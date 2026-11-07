/** Durable editor ownership; admission → document lock ordering lets preparation drain browser saves. */
import {randomUUID} from 'node:crypto'
import {mkdir,readFile} from 'node:fs/promises'
import {join} from 'node:path'
import {setTimeout as delay} from 'node:timers/promises'
import {z} from 'zod'
import {brandString} from '@deepseek-ai/dsh-brand'
import {withFileLock,writeFileAtomic} from '@deepseek-ai/dsh-atomic-write'
import {resumeIdSchema,resumeRevisionSchema} from '../identity.ts'
import type {EditorOwnerId,EditorIncarnationId,EditorToken,EditorPreparationId,EditorOwnership,EditorRegistration,EditorPreparation,EditorAcknowledgement,EditorReconciliation,ResumeId,ResumeRevision} from '../types.ts'
import type {ResumeStore,MutationGuard} from './store.ts'
import {withDocumentLock} from './document-lock.ts'
import {TransferFile} from './editor-transfer.ts'
import {validateEditorCheckpoint} from '../checkpoint.ts'
import type {EditorTransferRead,EditorTransferDisposition,EditorRecovery,EditorRecovered,EditorTransfer,EditorClaim,EditorActivation,EditorRollback,EditorClaimed} from '../types.ts'
import {ResumeError} from './errors.ts'
const token=z.string().uuid().transform(brandString<EditorToken>)
const schema=z.strictObject({schemaVersion:z.literal(1),hostId:z.string().uuid(),resumeId:resumeIdSchema,ownerId:z.string().uuid().transform(brandString<EditorOwnerId>),incarnationId:z.string().uuid().transform(brandString<EditorIncarnationId>),token,uncertain:z.boolean(),seenAt:z.number(),detached:z.boolean().optional(),retired:z.array(z.string().uuid()),preparation:z.strictObject({id:z.string().uuid().transform(brandString<EditorPreparationId>),expectedRevision:resumeRevisionSchema,deadline:z.number(),phase:z.enum(['requested','ready','failed']),revision:resumeRevisionSchema.optional()}).optional()})
type RecordV1=z.infer<typeof schema>
/** A one-use authorization must be passed into the store mutation, then released in finally. */
export interface EditorPermit { guard:MutationGuard; release:()=>Promise<void> }
/** Serializes model admissions across processes while preserving uncertain ownership on disk. */
export class EditorCoordinator {
 private stopped=false
 private readonly hostId=randomUUID()
 private readonly waits=new Set<Promise<void>>()
 private readonly abort=new AbortController()
 private readonly transfers:TransferFile
 constructor(private readonly store:ResumeStore){this.transfers=new TransferFile(store.config)}
 private path(id:ResumeId){z.string().uuid().parse(id);return join(this.store.config.storageDir,'owners-v1',`${id}.json`)}
 private async load(id:ResumeId):Promise<RecordV1|undefined>{
  let raw:string
  try{raw=await readFile(this.path(id),'utf8')}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return undefined;throw new ResumeError('storage-failure','Editor ownership cannot be read')}
  try{const record=schema.parse(JSON.parse(raw));if(record.resumeId!==id)throw Error('Identity mismatch');return record}catch(error){throw new ResumeError('invalid-storage','Editor ownership is invalid; restore the ownership record before AI editing')}
 }
 private write(record:RecordV1){return writeFileAtomic(this.path(record.resumeId),JSON.stringify(record)+'\n',{mode:0o600,dirMode:0o700})}
 private async admission<T>(id:ResumeId,work:()=>Promise<T>):Promise<T>{await mkdir(join(this.store.config.storageDir,'owners-v1'),{recursive:true,mode:0o700});return withFileLock(`${this.path(id)}.admission`,work,{waitMs:this.store.config.lockWaitMs})}
 private unavailable():never{throw new ResumeError('editor-unavailable','Editor ownership needs acknowledgement. Open this resume and acknowledge its committed revision; recovery copies are retained.')}
 private async owned(id:ResumeId,value:EditorToken){const record=await this.load(id);if(!record||record.token!==value)this.unavailable();return record}
 private async transferFence(id:ResumeId){const transfer=await this.transfers.read(id);if(transfer&&!['active','rolledback'].includes(transfer.phase))this.unavailable()}
 private transaction<T>(id:ResumeId,work:()=>Promise<T>){const pending=this.admission(id,()=>withDocumentLock(this.store.config,id,async()=>{if(this.stopped)this.unavailable();return work()}));const settled=pending.then(()=>undefined,()=>undefined);this.waits.add(settled);void settled.then(()=>this.waits.delete(settled));return pending}
 /** Retain a validated checkpoint before fencing the source capability.
  * @param request Fenced source and designated target at one acknowledged revision.
  * @returns True after durable retention. Lost responses require rollback, never a fresh register.
  */
 async transfer(request:EditorTransfer):Promise<boolean>{return this.transaction(request.resumeId,async()=>{
  const old=await this.transfers.read(request.resumeId)
  if(old&&!['active','rolledback'].includes(old.phase))this.unavailable()
  const source=await this.owned(request.resumeId,request.sourceToken)
  if(source.uncertain||source.preparation||source.hostId!==this.hostId||source.incarnationId!==request.sourceIncarnationId||source.incarnationId===request.targetIncarnationId||source.retired.includes(request.targetIncarnationId))this.unavailable()
  const snapshot=await this.store.read(request.resumeId)
  if(snapshot.revision!==request.revision)throw new ResumeError('conflict','The committed document changed before transfer',snapshot.revision)
  if(Buffer.byteLength(request.checkpointJson)>this.store.config.maxAssistantCheckpointBytes)throw new ResumeError('invalid-input','Checkpoint exceeds the configured byte limit')
  let checkpoint
  try{checkpoint=validateEditorCheckpoint(JSON.parse(request.checkpointJson),snapshot,this.store.config.maxAssistantCheckpointBytes)}catch(error){throw new ResumeError('invalid-input','Checkpoint does not match the acknowledged document or byte limit')}
  await this.transfers.write({...request,sourceOwnerId:source.ownerId,checkpointJson:JSON.stringify(checkpoint),schemaVersion:1,phase:'prepared',targetToken:brandString<EditorToken>(randomUUID()),rollbackToken:brandString<EditorToken>(randomUUID())})
  return true
 })}
 /** Consume the checkpoint once for its designated generation. The returned token cannot write yet.
  * @param request Exact transfer, checkpoint and target generation.
  * @returns Retained history and fenced ownership.
  */
 async claim(request:EditorClaim):Promise<EditorClaimed>{return this.transaction(request.resumeId,async()=>{
  const t=await this.transfers.read(request.resumeId)
  if(!t||t.phase!=='prepared'||t.transferId!==request.transferId||t.checkpointId!==request.checkpointId||t.targetIncarnationId!==request.incarnationId)this.unavailable()
  const source=await this.owned(request.resumeId,t.sourceToken),snapshot=await this.store.read(request.resumeId)
  if(snapshot.revision!==t.revision)throw new ResumeError('conflict','The committed revision changed; retain the original history',snapshot.revision)
  t.phase='claimed';await this.transfers.write(t)
  await this.write({...source,ownerId:t.targetOwnerId,incarnationId:t.targetIncarnationId,token:t.targetToken,uncertain:true,seenAt:Date.now(),retired:[...source.retired,source.incarnationId]})
  return{token:t.targetToken,uncertain:true,checkpointJson:t.checkpointJson,revision:t.revision}
 })}
 /** Authorize writes only after the target's exact loaded/layout acknowledgement.
  * @param request Designated generation, claimed token and loaded revision.
  * @returns Writable ownership after both independent files acknowledge persistence.
  */
 async activate(request:EditorActivation):Promise<EditorOwnership>{return this.transaction(request.resumeId,async()=>{
  const t=await this.transfers.read(request.resumeId)
  if(!t||t.phase!=='claimed'||t.transferId!==request.transferId||t.checkpointId!==request.checkpointId||t.targetIncarnationId!==request.incarnationId||t.targetToken!==request.token||t.revision!==request.revision)this.unavailable()
  const target=await this.owned(request.resumeId,request.token),snapshot=await this.store.read(request.resumeId)
  if(snapshot.revision!==request.revision)throw new ResumeError('conflict','The committed revision changed during loading',snapshot.revision)
  target.uncertain=false;target.detached=false;target.hostId=this.hostId;target.seenAt=Date.now();await this.write(target)
  t.phase='active';await this.transfers.write(t)
  return{token:target.token,uncertain:false}
 })}
 /** Revoke any target capability before restoring the retained source with a new token.
  * @param request Original source credentials and exact transfer identity.
  * @returns Confirmed source ownership, with a fresh token when a target was revoked. Unknown outcomes remain fenced until acknowledgement.
  */
 async rollback(request:EditorRollback):Promise<EditorOwnership>{return this.transaction(request.resumeId,async()=>{
  const t=await this.transfers.read(request.resumeId)
  if(!t||t.transferId!==request.transferId){
   if(t&&t.phase!=='active'&&t.phase!=='rolledback')this.unavailable()
   const source=await this.owned(request.resumeId,request.sourceToken)
   if(source.incarnationId!==request.sourceIncarnationId||source.uncertain||source.hostId!==this.hostId||source.preparation)this.unavailable()
   // The unchanged capability and completed predecessor establish that this transfer did not release its source.
   return{token:source.token,uncertain:false}
  }
  if(t.sourceToken!==request.sourceToken||t.sourceIncarnationId!==request.sourceIncarnationId)this.unavailable()
  const owner=await this.load(request.resumeId),snapshot=await this.store.read(request.resumeId)
  if(!owner||![t.sourceToken,t.targetToken,t.rollbackToken].includes(owner.token))this.unavailable()
  if(snapshot.revision!==t.revision)throw new ResumeError('conflict','Target revision changed; retain both histories and reload explicitly',snapshot.revision)
  t.phase='revoking';await this.transfers.write(t)
  await this.write({...owner,ownerId:t.sourceOwnerId,incarnationId:t.sourceIncarnationId,token:t.rollbackToken,uncertain:false,hostId:this.hostId,seenAt:Date.now(),retired:[...new Set([...owner.retired.filter(id=>id!==t.sourceIncarnationId),t.targetIncarnationId])]})
  t.phase='rolledback';await this.transfers.write(t)
  return{token:t.rollbackToken,uncertain:false}
 })}
 /** Revoke a detached target and designate a fresh frame without contacting the original source.
  * @param request Retained checkpoint and exact outgoing/fresh generations.
  * @returns The retained revision after durable revocation and designation; retry identical inputs on response loss.
  */
 async recover(request:EditorRecovery):Promise<EditorRecovered>{return this.transaction(request.resumeId,async()=>{
  const t=await this.transfers.read(request.resumeId),owner=await this.load(request.resumeId)
  if(!t||!owner||t.transferId!==request.transferId||t.checkpointId!==request.checkpointId)this.unavailable()
  const snapshot=await this.store.read(request.resumeId)
  if(snapshot.revision!==t.revision)throw new ResumeError('conflict','The saved revision changed; retain the checkpoint and reconcile history explicitly',snapshot.revision)
  if(t.recoveryTarget&&t.phase==='prepared'&&t.targetIncarnationId===request.targetIncarnationId&&t.targetOwnerId===request.targetOwnerId)return{revision:t.revision}
  if(t.targetIncarnationId!==request.fromIncarnationId||request.targetIncarnationId===t.sourceIncarnationId||request.targetIncarnationId===t.targetIncarnationId||owner.retired.includes(request.targetIncarnationId)||![t.sourceToken,t.targetToken,t.rollbackToken].includes(owner.token))this.unavailable()
  t.phase='revoking';await this.transfers.write(t)
  const revoked=t.rollbackToken
  await this.write({...owner,ownerId:t.sourceOwnerId,incarnationId:t.sourceIncarnationId,token:revoked,uncertain:true,hostId:this.hostId,seenAt:Date.now(),retired:[...new Set([...owner.retired,t.sourceIncarnationId,t.targetIncarnationId])]})
  await this.transfers.write({...t,sourceToken:revoked,targetOwnerId:request.targetOwnerId,targetIncarnationId:request.targetIncarnationId,targetToken:brandString<EditorToken>(randomUUID()),rollbackToken:brandString<EditorToken>(randomUUID()),phase:'prepared',recoveryTarget:true})
  return{revision:t.revision}
 })}
 /** Read exact transfer evidence under the document lock without renewing or changing ownership.
  * @param request Document, transfer and checkpoint identities.
  * @returns Pending/active revisions, or unknown for absent, replaced or rolled-back transfers.
  */
 async inspect(request:EditorTransferRead):Promise<EditorTransferDisposition>{return withDocumentLock(this.store.config,request.resumeId,async()=>{
  if(this.stopped)this.unavailable()
  const transfer=await this.transfers.read(request.resumeId)
  if(!transfer||transfer.transferId!==request.transferId||transfer.checkpointId!==request.checkpointId||transfer.phase==='rolledback')return{state:'unknown'}
  const snapshot=await this.store.read(request.resumeId)
  return{state:transfer.phase==='active'?'active':'pending',revision:transfer.revision,currentRevision:snapshot.revision}
 })}
 /** Register a frame. Replaced frames are permanently retired; replacement starts uncertain.
  * @param request Actual document and recovery identities.
  * @returns Private mutation token and reconciliation requirement.
  */
 async register(request:EditorRegistration):Promise<EditorOwnership>{return this.admission(request.resumeId,()=>withDocumentLock(this.store.config,request.resumeId,async()=>{
  if(this.stopped)this.unavailable()
  await this.transferFence(request.resumeId)
  const old=await this.load(request.resumeId)
  if(old?.retired.includes(request.incarnationId))this.unavailable()
  if(old?.incarnationId===request.incarnationId){if(old.ownerId!==request.ownerId)this.unavailable();if(old.hostId!==this.hostId){old.uncertain=true;old.hostId=this.hostId;await this.write(old)}return{token:old.token,uncertain:old.uncertain}}
  if(old&&request.acquisition&&(request.acquisition==='available'||!old.detached&&old.hostId===this.hostId&&Date.now()-old.seenAt<=this.store.config.editorLeaseMs))throw new ResumeError('editor-unavailable','This resume has another editor. Return to that editor, or explicitly recover after closing it; recovery copies are retained.')
  await this.store.read(request.resumeId)
  const record:RecordV1={schemaVersion:1,hostId:this.hostId,resumeId:request.resumeId,ownerId:request.ownerId,incarnationId:request.incarnationId,token:brandString<EditorToken>(randomUUID()),uncertain:!!old||request.recoveryPending,seenAt:Date.now(),retired:old?[...old.retired,old.incarnationId]:[]}
  await this.write(record);return{token:record.token,uncertain:record.uncertain}
 }))}
 /** Acknowledge the current committed revision without deleting any recovery evidence.
  * @param request Current token and explicitly acknowledged revision.
  * @returns Clean ownership metadata.
  */
 async reconcile(request:EditorReconciliation):Promise<EditorOwnership>{return this.admission(request.resumeId,()=>withDocumentLock(this.store.config,request.resumeId,async()=>{await this.transferFence(request.resumeId);const record=await this.owned(request.resumeId,request.token);const current=await this.store.read(request.resumeId);if(current.revision!==request.expectedRevision)throw new ResumeError('conflict','Read the current committed revision before acknowledging ownership',current.revision);record.uncertain=false;record.detached=false;record.hostId=this.hostId;record.seenAt=Date.now();delete record.preparation;await this.write(record);return{token:record.token,uncertain:false}}))}
 /** Validate a supplied browser capability only under the caller's document writer lock.
  * @param id Target document.
  * @param value Supplied private capability; omission retains external CAS semantics.
  * @returns Writer-local validation callback.
  */
 guard(id:ResumeId,value?:EditorToken):MutationGuard|undefined{return value===undefined?undefined:async()=>{const record=await this.owned(id,value);await this.transferFence(id);if(record.preparation?.phase==='ready')this.unavailable()}}
 /** Poll renews liveness but never clears uncertainty or expires a preparation into trust.
  * @param id Registered document.
  * @param value Private capability.
  * @returns Outstanding preparation, or null after release.
  */
 async poll(id:ResumeId,value:EditorToken):Promise<EditorPreparation|null>{return withDocumentLock(this.store.config,id,async()=>{const record=await this.owned(id,value);if(record.hostId!==this.hostId||Date.now()-record.seenAt>this.store.config.editorLeaseMs||(record.preparation!==undefined&&Date.now()>record.preparation.deadline))record.uncertain=true;record.seenAt=Date.now();await this.write(record);if(record.uncertain)this.unavailable();const p=record.preparation;return p?{id:p.id,expectedRevision:p.expectedRevision,deadline:p.deadline}:null})}
 /** Record a drained browser acknowledgement without taking admission.
  * @param request Clean state and exact revision observed after flush.
  * @returns True after durable acknowledgement.
  */
 async acknowledge(request:EditorAcknowledgement):Promise<boolean>{return withDocumentLock(this.store.config,request.resumeId,async()=>{const record=await this.owned(request.resumeId,request.token);const p=record.preparation;if(!p||p.id!==request.preparationId)this.unavailable();p.phase=request.clean?'ready':'failed';p.revision=request.revision;if(!request.clean)record.uncertain=true;await this.write(record);return true})}
 /** Persist disconnect uncertainty; manual recovery remains possible with the current token.
  * @param id Registered document.
  * @param value Private capability.
  * @param detached Explicit frame disposal, distinct from a failed preparation in a live frame.
  * @returns True after fencing AI preparation.
  */
 async disconnect(id:ResumeId,value:EditorToken,detached=false):Promise<boolean>{return withDocumentLock(this.store.config,id,async()=>{const record=await this.owned(id,value);record.uncertain=true;if(detached)record.detached=true;if(record.preparation)record.preparation.phase='failed';await this.write(record);return true})}
 /** Reserve model admission, request a draft flush, and return a one-use writer permit.
  * @param request Exact model revision, mutation identity, and cancellation signal.
  * @returns Permit holding admission until release; preparation never holds the document lock while waiting.
  */
 async prepare(request:{resumeId:ResumeId;expectedRevision:ResumeRevision;mutationId:string;signal?:AbortSignal}):Promise<EditorPermit>{
  const signal=AbortSignal.any([this.abort.signal,...(request.signal?[request.signal]:[])])
  const check=()=>{if(signal.aborted||this.stopped)throw new ResumeError('edit-cancelled','Resume edit cancelled before admission')}
  check()
  let deliver!:(permit:EditorPermit)=>void,fail!:(error:unknown)=>void
  const result=new Promise<EditorPermit>((resolve,reject)=>{deliver=resolve;fail=reject})
  const work=this.admission(request.resumeId,async()=>{
   let owner:RecordV1|undefined,preparation:EditorPreparation|undefined,settle!:()=>void,used=false,released=false,delivered=false,cleanRevisionMismatch=false
   const held=new Promise<void>(resolve=>{settle=()=>{released=true;resolve()}})
   signal.addEventListener('abort',settle,{once:true})
   try{
    check()
    await this.transferFence(request.resumeId)
    owner=await withDocumentLock(this.store.config,request.resumeId,async()=>{const record=await this.load(request.resumeId);if(record){if(record.hostId!==this.hostId||record.uncertain||Date.now()-record.seenAt>this.store.config.editorLeaseMs)this.unavailable();preparation={id:brandString<EditorPreparationId>(randomUUID()),expectedRevision:request.expectedRevision,deadline:Date.now()+this.store.config.editorPrepareTimeoutMs};record.preparation={...preparation,phase:'requested'};await this.write(record)}return record})
    if(owner){for(;;){check();const record=await this.owned(request.resumeId,owner.token),p=record.preparation;if(record.uncertain||!p||p.phase==='failed'||Date.now()>p.deadline)this.unavailable();if(p.phase==='ready'){if(p.revision!==request.expectedRevision){cleanRevisionMismatch=true;throw new ResumeError('conflict','The editor saved a newer revision; read it before editing',p.revision);}break}await delay(this.store.config.editorPollIntervalMs,undefined,{signal}).catch(()=>check())}}
    check()
    const guard:MutationGuard=async()=>{check();if(used||released)throw new ResumeError('conflict','Preparation permit already used');used=true;if(owner){const record=await this.owned(request.resumeId,owner.token);if(record.uncertain||record.preparation?.id!==preparation?.id||record.preparation?.phase!=='ready'||Date.now()>record.preparation.deadline||Date.now()-record.seenAt>this.store.config.editorLeaseMs)this.unavailable()}const snapshot=await this.store.read(request.resumeId);if(snapshot.revision!==request.expectedRevision)throw new ResumeError('conflict','Resume changed during preparation',snapshot.revision)}
    delivered=true
    deliver({guard,release:async()=>{settle();await work}})
    await held
   }finally{signal.removeEventListener('abort',settle);if(owner&&preparation)await withDocumentLock(this.store.config,request.resumeId,async()=>{const record=await this.owned(request.resumeId,owner!.token);if(record.preparation?.id===preparation!.id){if(!delivered&&(!cleanRevisionMismatch||signal.aborted))record.uncertain=true;delete record.preparation;await this.write(record)}})}
  })
  void work.catch(fail)
  this.waits.add(work);void work.then(()=>this.waits.delete(work),()=>this.waits.delete(work))
  return result
 }
 /** Cancel owned preparation waits and await their cleanup. */
 async dispose():Promise<void>{this.stopped=true;this.abort.abort();await Promise.allSettled(this.waits)}
}

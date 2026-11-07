/** Atomic Session target selections independent of resume document revisions and history. */
import {brandString} from '@deepseek-ai/dsh-brand'
import type {AssistantHandoffBegin,AssistantHandoffRead,AssistantSessionRecord,AssistantHandoffRecord,AssistantHandoffAdmission,AssistantHandoffId,AssistantWorkspaceId} from '../types.ts'
import { createHash,randomUUID } from 'node:crypto'
import { mkdir, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import { withFileLock, writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { ResumeContextBindRequest, ResumeContextResult, ResumeId, ResumeSessionContextV1 } from '../types.ts'
import { resumeIdSchema, resumeRevisionSchema, resumeSessionIdSchema } from '../identity.ts'
import { ResumeError } from './errors.ts'
import type { ResumeStore } from './store.ts'
const contextSchema=z.strictObject({schemaVersion:z.literal(1),sessionId:resumeSessionIdSchema,resumeId:z.string().uuid().pipe(resumeIdSchema),updatedAt:z.iso.datetime(),source:z.enum(['editor-entry','explicit-tool','committed-edit'])})
const bindingSchema=z.strictObject({requestId:z.string().min(1).max(256),fingerprint:z.string().regex(/^[a-f0-9]{64}$/),context:contextSchema,revision:resumeRevisionSchema})
const recordSchema=z.strictObject({schemaVersion:z.literal(1),context:contextSchema,bindings:z.array(bindingSchema).min(1)})
const commitIntentSchema=z.strictObject({schemaVersion:z.literal(1),sessionId:resumeSessionIdSchema,resumeId:z.string().uuid().pipe(resumeIdSchema),requestId:z.string().min(1).max(256),fingerprint:z.string().regex(/^[a-f0-9]{64}$/),previousBinding:z.string().min(1).max(256).nullable()})
const handoffId=z.string().uuid().transform(brandString<AssistantHandoffId>)
const handoffBegin=z.strictObject({resumeId:z.string().uuid().pipe(resumeIdSchema),expectedRevision:resumeRevisionSchema,requestId:handoffId,workspaceId:z.string().min(1).max(256).transform(brandString<AssistantWorkspaceId>)})
const handoffRecord=handoffBegin.partial({workspaceId:true}).extend({schemaVersion:z.literal(1),requestedSessionId:resumeSessionIdSchema,sessionId:resumeSessionIdSchema.optional()})
/** Bounded ordering evidence for one unresolved model mutation in a Session. */
export type CommitTargetRequest=Pick<ResumeContextBindRequest,'sessionId'|'resumeId'|'requestId'> & {fingerprint:string}
/** Exact persisted intent used for conditional cleanup after a verified rejection. */
export type CommitIntent=z.infer<typeof commitIntentSchema>
type ContextRecord=z.infer<typeof recordSchema>
const requestSchema=z.strictObject({sessionId:resumeSessionIdSchema,resumeId:z.string().uuid().pipe(resumeIdSchema),expectedRevision:resumeRevisionSchema,requestId:z.string().min(1).max(256),source:z.enum(['editor-entry','explicit-tool','committed-edit']).default('explicit-tool')})
const hash=(value:string):string=>createHash('sha256').update(value).digest('hex')
/** Owns profile-local Session bindings; document writes never occur here. */
export class SessionContextStore {
 private readonly stopped=new AbortController()
 private readonly executions=new Set<Promise<unknown>>()
 constructor(private readonly documents:ResumeStore){}
 private handoffPath(requestId:AssistantHandoffId):string{return join(this.documents.config.storageDir,'handoffs-v1',`${handoffId.parse(requestId)}.json`)}
 /** Read exact creation evidence without changing document content.
  * @param request Stable entry identity.
  * @returns Persisted admission or null; storage errors remain visible.
  */
 async readAssistantHandoff(request:AssistantHandoffRead):Promise<AssistantHandoffRecord|null>{
  let text:string
  try{text=await readFile(this.handoffPath(request.requestId),'utf8')}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return null;throw error}
  const record=handoffRecord.parse(JSON.parse(text));if(record.requestId!==request.requestId)throw new ResumeError('invalid-storage','Assistant entry identity differs');return record
 }
 /** Allocate before create. An existing admission never grants another create attempt.
  * @param request Explicit document, acknowledged revision and stable entry identity.
  * @returns Durable identity and whether this call alone may dispatch creation.
  */
 async beginAssistantHandoff(request:AssistantHandoffBegin):Promise<AssistantHandoffAdmission>{
  const input=handoffBegin.parse(request),path=this.handoffPath(input.requestId)
  await mkdir(join(this.documents.config.storageDir,'handoffs-v1'),{recursive:true,mode:0o700})
  return withFileLock(path,async()=>{
   const existing=await this.readAssistantHandoff(input)
   if(existing){if(existing.resumeId!==input.resumeId||existing.workspaceId!==input.workspaceId)throw new ResumeError('conflict','Assistant entry belongs to another resume or Workspace');return{handoff:existing,admitted:false}}
   const current=await this.documents.read(input.resumeId);if(current.revision!==input.expectedRevision)throw new ResumeError('conflict','Resume changed before assistant admission',current.revision)
   const handoff:AssistantHandoffRecord={...input,schemaVersion:1,requestedSessionId:brandString<SessionId>(randomUUID())}
   await writeFileAtomic(path,JSON.stringify(handoff)+'\n',{mode:0o600,dirMode:0o700});return{handoff,admitted:true}
  },{waitMs:this.documents.config.lockWaitMs})
 }
 /** Retain a known canonical response before binding or navigation.
  * @param request Entry identity and actual returned Session.
  * @returns Durable evidence; a conflicting canonical identity rejects.
  */
 async recordAssistantSession(request:AssistantSessionRecord):Promise<AssistantHandoffRecord>{
  const sessionId=resumeSessionIdSchema.parse(request.sessionId),path=this.handoffPath(request.requestId)
  return withFileLock(path,async()=>{
   const existing=await this.readAssistantHandoff(request);if(!existing)throw new ResumeError('not-found','Assistant admission is missing')
   if(existing.sessionId&&existing.sessionId!==sessionId)throw new ResumeError('conflict','Assistant entry already has another canonical Session')
   const result={...existing,sessionId};await writeFileAtomic(path,JSON.stringify(result)+'\n',{mode:0o600,dirMode:0o700});return result
  },{waitMs:this.documents.config.lockWaitMs})
 }
 /** Serialize a Session's model outcomes without holding its selection lock during editor preparation.
  * @param sessionId Actual invoking Session.
  * @param signal Caller cancellation; omitted for an already durable receipt.
  * @param operation Mutation and intent settlement using the combined lifetime signal.
  * @returns Operation result. Lock acquisition is bounded by lockWaitMs; cancellation is checked before execution.
  */
 async executeCommit<T>(sessionId:SessionId,signal:AbortSignal|undefined,operation:(signal:AbortSignal)=>Promise<T>):Promise<T>{
  const combined=AbortSignal.any([this.stopped.signal,...(signal?[signal]:[])])
  const check=()=>{if(combined.aborted)throw new ResumeError('edit-cancelled','Resume edit cancelled before admission')}
  check();let entered=false
  const pending=(async()=>{try{await mkdir(join(this.documents.config.storageDir,'context-commits-v1'),{recursive:true,mode:0o700});return await withFileLock(`${this.intentPath(sessionId)}.execution`,async()=>{check();entered=true;return operation(combined)},{waitMs:this.documents.config.lockWaitMs})}catch(error){if(!entered)check();if(error instanceof ResumeError)throw error;throw new ResumeError('storage-failure','Session mutation execution was not acknowledged; retry identical inputs')}})()
  this.executions.add(pending)
  try{return await pending}finally{this.executions.delete(pending)}
 }
 /** Abort queued admissions and await active mutation outcomes. */
 async dispose():Promise<void>{this.stopped.abort();await Promise.allSettled(this.executions)}
 private filename(sessionId:SessionId):string{return join(this.documents.config.storageDir,'contexts-v1',`${hash(sessionId)}.json`)}
 private async load(sessionId:SessionId):Promise<ContextRecord|undefined>{
  let text:string
  try{text=await readFile(this.filename(sessionId),'utf8')}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return undefined;throw new ResumeError('storage-failure','Session target cannot be read; retry after checking storage access')}
  let raw:unknown
  try{raw=JSON.parse(text)}catch(error){throw new ResumeError('invalid-storage','Session target JSON is invalid; restore the context record from backup')}
  const result=recordSchema.safeParse(raw)
  if(!result.success||result.data.context.sessionId!==sessionId||result.data.bindings.some(binding=>binding.context.sessionId!==sessionId)||new Set(result.data.bindings.map(binding=>binding.requestId)).size!==result.data.bindings.length)throw new ResumeError('invalid-storage','Session target record is invalid; restore it from backup')
  return result.data
 }
 private intentPath(sessionId:SessionId):string{return join(this.documents.config.storageDir,'context-commits-v1',`${hash(sessionId)}.json`)}
 private async intent(sessionId:SessionId):Promise<CommitIntent|undefined>{
  let text:string
  try{text=await readFile(this.intentPath(sessionId),'utf8')}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return undefined;throw new ResumeError('storage-failure','Pending Session target cannot be read')}
  try{const value=commitIntentSchema.parse(JSON.parse(text));if(value.sessionId!==sessionId)throw Error('Session identity mismatch');return value}catch(error){throw new ResumeError('invalid-storage','Pending Session target is invalid; restore its record before another model mutation')}
 }
 private async locked<T>(sessionId:SessionId,operation:()=>Promise<T>):Promise<T>{
  try{await mkdir(join(this.documents.config.storageDir,'contexts-v1'),{recursive:true,mode:0o700});return await withFileLock(this.filename(sessionId),operation,{waitMs:this.documents.config.lockWaitMs})}catch(error){if(error instanceof ResumeError)throw error;throw new ResumeError('storage-failure','Session target update was not acknowledged; retry the same mutation after checking storage access')}
 }
 /** Persist ordering evidence before a model mutation, without changing the selected target. The caller holds executeCommit through settlement.
  * @param request Stable mutation identity and actual Session/document identities.
  * @returns The exact durable intent for conditional cleanup. A different unresolved mutation rejects until retried or superseded by explicit selection.
  */
 async beginCommit(request:CommitTargetRequest):Promise<CommitIntent>{
  return this.locked(request.sessionId,async()=>{
   const existing=await this.load(request.sessionId),pending=await this.intent(request.sessionId),previousBinding=existing?.bindings.at(-1)?.requestId??null
   if(pending?.requestId===request.requestId){if(pending.resumeId!==request.resumeId||pending.fingerprint!==request.fingerprint)throw new ResumeError('conflict','Mutation identity belongs to different pending inputs');return pending}
   if(pending&&pending.previousBinding===previousBinding&&!existing?.bindings.some(binding=>binding.requestId===pending.requestId))throw new ResumeError('conflict','Another model mutation has an unresolved Session target; retry it or explicitly select a target before continuing')
   const intent:CommitIntent={schemaVersion:1,...request,previousBinding}
   await writeFileAtomic(this.intentPath(request.sessionId),JSON.stringify(intent)+'\n',{mode:0o600,dirMode:0o700});return intent
  })
 }
 /** Discard only a captured intent after its execution owner has verified a definitive rejection and no durable receipt.
  * @param captured Exact intent returned before this rejected mutation.
  * @returns Completion after conditional removal; another intent is never removed.
  */
 async abandonCommit(captured:CommitIntent):Promise<void>{await this.locked(captured.sessionId,async()=>{const pending=await this.intent(captured.sessionId);if(pending?.requestId===captured.requestId&&pending.resumeId===captured.resumeId&&pending.fingerprint===captured.fingerprint&&pending.previousBinding===captured.previousBinding)await rm(this.intentPath(captured.sessionId),{force:true})})}
 /** Repair a committed target only while its recorded previous selection remains current.
  * @param request Stable mutation identity captured before the commit.
  * @param revision Durable receipt revision; the current document may have advanced.
  * @returns Bound, superseded by a later selection, or ambiguous because ordering evidence is absent. No document writes occur; context and intent replacements are independently atomic.
  */
 async finishCommit(request:CommitTargetRequest,revision:ResumeContextBindRequest['expectedRevision']):Promise<'bound'|'superseded'|'ambiguous'>{
  return this.locked(request.sessionId,async()=>{
   const existing=await this.load(request.sessionId),pending=await this.intent(request.sessionId),input=requestSchema.parse({sessionId:request.sessionId,resumeId:request.resumeId,requestId:request.requestId,expectedRevision:revision,source:'committed-edit'}),fingerprint=hash(JSON.stringify(input)),old=existing?.bindings.find(binding=>binding.requestId===request.requestId)
   const ownsIntent=pending?.requestId===request.requestId&&pending.resumeId===request.resumeId&&pending.fingerprint===request.fingerprint
   const cleanup=async()=>{if(ownsIntent)await rm(this.intentPath(request.sessionId),{force:true})}
   if(old){if(old.fingerprint!==fingerprint)throw new ResumeError('conflict','Mutation identity belongs to different committed target inputs');await cleanup();return 'bound'}
   if(!ownsIntent)return 'ambiguous'
   if(pending.previousBinding!==(existing?.bindings.at(-1)?.requestId??null))return 'superseded'
   return withFileLock<'bound'>(join(this.documents.config.storageDir,`${request.resumeId}.json`),async()=>{
    const snapshot=await this.documents.read(request.resumeId)
    if(snapshot.revision<revision)throw new ResumeError('invalid-storage','Committed target revision is ahead of the stored document')
    const context:ResumeSessionContextV1={schemaVersion:1,sessionId:request.sessionId,resumeId:request.resumeId,updatedAt:new Date().toISOString(),source:'committed-edit'}
    const record:ContextRecord={schemaVersion:1,context,bindings:[...(existing?.bindings??[]),{requestId:request.requestId,fingerprint,context,revision}]}
    await writeFileAtomic(this.filename(request.sessionId),JSON.stringify(record)+'\n',{mode:0o600,dirMode:0o700})
    await cleanup();return 'bound'
   },{waitMs:this.documents.config.lockWaitMs})
  })
 }
 /** Capture selection ordering before a manual save, without taking the model execution lock.
  * @param sessionId Conversation owning the editor.
  * @returns Last durable selection identity, or null before the first selection.
  */
 async captureManualSave(sessionId:SessionId):Promise<string|null>{return this.locked(sessionId,async()=>(await this.load(sessionId))?.bindings.at(-1)?.requestId??null)}
 /** Associate an acknowledged manual save only while its captured selection still wins.
  * @param sessionId Conversation owning the editor.
  * @param previousBinding Selection captured before document persistence.
  * @param snapshot Acknowledged saved document; its legacy Session field is ignored.
  * @returns Bound or superseded by a later selection. Call only after releasing the document writer lock.
  */
 async finishManualSave(sessionId:SessionId,previousBinding:string|null,snapshot:import('../types.ts').ResumeSnapshot):Promise<'bound'|'superseded'>{
  return this.locked(sessionId,async()=>{
   const existing=await this.load(sessionId)
   if((existing?.bindings.at(-1)?.requestId??null)!==previousBinding)return 'superseded'
   return withFileLock(join(this.documents.config.storageDir,`${snapshot.id}.json`),async()=>{
    const current=await this.documents.read(snapshot.id)
    if(current.revision<snapshot.revision)throw new ResumeError('invalid-storage','Saved revision is ahead of the stored document')
    const requestId=`manual-save:${randomUUID()}`,context:ResumeSessionContextV1={schemaVersion:1,sessionId,resumeId:snapshot.id,updatedAt:new Date().toISOString(),source:'committed-edit'}
    const fingerprint=hash(JSON.stringify({sessionId,resumeId:snapshot.id,expectedRevision:snapshot.revision,requestId,source:'committed-edit'}))
    await writeFileAtomic(this.filename(sessionId),JSON.stringify({schemaVersion:1,context,bindings:[...(existing?.bindings??[]),{requestId,fingerprint,context,revision:snapshot.revision}]} satisfies ContextRecord)+'\n',{mode:0o600,dirMode:0o700})
    return 'bound' as const
   },{waitMs:this.documents.config.lockWaitMs})
  })
 }
 /** Resolve only this Session, with optional nonpersisting comparison selection.
  * @param sessionId Actual Session identity.
  * @param explicitResumeId Optional document to inspect instead of the persisted selection.
  * @returns Target and current document revision, or missing/deleted choice. Corrupt records fail visibly.
  */
 async resolve(sessionId:SessionId,explicitResumeId?:ResumeId):Promise<ResumeContextResult>{
  const context:ResumeSessionContextV1|undefined=explicitResumeId===undefined?(await this.load(sessionId))?.context:{schemaVersion:1,sessionId,resumeId:explicitResumeId,updatedAt:new Date().toISOString(),source:'explicit-tool'}
  if(!context)return{state:'choose',reason:'missing'}
  try{const snapshot=await this.documents.read(context.resumeId);return{state:'bound',context,revision:snapshot.revision}}catch(error){if(error instanceof ResumeError&&error.code==='not-found')return{state:'choose',reason:'deleted'};throw error}
 }
 /** Select a target atomically after checking its acknowledged document revision.
  * @param request Session, document, revision, and request identity; source defaults to explicit-tool.
  * @returns Original metadata for identical retries, without replacing any later selection. Failures leave documents unchanged.
  */
 async bind(request:ResumeContextBindRequest):Promise<ResumeContextResult>{
  const parsed=requestSchema.safeParse(request)
  if(!parsed.success)throw new ResumeError('invalid-input','Selection requires a valid Session, resume, revision and request id')
  const input=parsed.data,path=this.filename(input.sessionId),fingerprint=hash(JSON.stringify(input))
  try{
   await mkdir(join(this.documents.config.storageDir,'contexts-v1'),{recursive:true,mode:0o700})
   return await withFileLock(path,async()=>{
    const existing=await this.load(input.sessionId),old=existing?.bindings.find(binding=>binding.requestId===input.requestId)
    if(old){if(old.fingerprint!==fingerprint)throw new ResumeError('conflict','Selection request id already belongs to different inputs');return{state:'bound' as const,context:old.context,revision:old.revision}}
    // Hold the document writer lock through selection persistence so deletion cannot race the acknowledged read.
    return withFileLock(join(this.documents.config.storageDir,`${input.resumeId}.json`),async()=>{
     const snapshot=await this.documents.read(input.resumeId)
     if(snapshot.revision!==input.expectedRevision)throw new ResumeError('conflict','Resume changed; read its current revision before selecting it',snapshot.revision)
     const context:ResumeSessionContextV1={schemaVersion:1,sessionId:input.sessionId,resumeId:input.resumeId,updatedAt:new Date().toISOString(),source:input.source}
     const record:ContextRecord={schemaVersion:1,context,bindings:[...(existing?.bindings??[]),{requestId:input.requestId,fingerprint,context,revision:snapshot.revision}]}
     await writeFileAtomic(path,JSON.stringify(record)+'\n',{mode:0o600,dirMode:0o700})
     return{state:'bound' as const,context,revision:snapshot.revision}
    },{waitMs:this.documents.config.lockWaitMs})
   },{waitMs:this.documents.config.lockWaitMs})
  }catch(error){if(error instanceof ResumeError)throw error;throw new ResumeError('storage-failure','Session target was not acknowledged; retry the same request after checking storage access')}
 }
}

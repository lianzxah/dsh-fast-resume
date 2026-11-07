/** Atomic Fast Resume service and generated authenticated Remote methods. */
import type {AssistantHandoffBegin,AssistantHandoffRead,AssistantSessionRecord,AssistantHandoffRecord,AssistantHandoffAdmission} from '../types.ts'
import {uiMutationRequestSchema,sessionSaveRequestSchema,requestSchemas} from '../protocol.ts'
import type {ResumeUiMutationRequest,ResumeUiMutationResult,ResumeSessionSaveRequest,ResumeSessionSaveResult} from '../types.ts'
import { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-app-boot'
import { TypertRemoteService, Remote, RemoteError } from '@deepseek-ai/dsh-typert-protocol'
import Schema from '@deepseek-ai/schemastery'
import { readFile } from 'node:fs/promises'
import { randomUUID,createHash } from 'node:crypto'
import { join } from 'node:path'
import { writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'
import { serializeResumeBackup } from '../../upstream/shared/src/index.ts'
import type { ResumeId,ResumeRevision,ResumeVersionId,Config, ResolvedConfig, ResumeSnapshot, ResumeSummary, CreateRequest, SaveRequest, ProposeRequest, ApplyRequest, RevertRequest, RestoreRequest, ProposalView, ChangeReceipt, HistoryView, ImportRequest, ExportRequest, ExportReceipt, RendererLease, RenderJob, RenderCompletion, EditorAssets } from '../types.ts'
import {EditorCoordinator} from './editor-coordinator.ts'
import {OperationLifetime} from './operation-lifetime.ts'
import type {ToolExecutionInput} from '@deepseek-ai/dsh-tools'
import type {EditorTransferRead,EditorTransferDisposition,EditorRecovery,EditorRecovered,EditorTransfer,EditorClaim,EditorClaimed,EditorActivation,EditorRollback,EditorToken,EditorRegistration,EditorOwnership,EditorPreparation,EditorAcknowledgement,EditorReconciliation,ResumeEditResult} from '../types.ts'
import { ResumeStore, resolveConfig } from './store.ts'
import { RenderQueue } from './render-queue.ts'
import { SessionContextStore,type CommitIntent } from './session-context.ts'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { ResumeContextResult, ResumeContextBindRequest,ResumeContextReadRequest } from '../types.ts'
import { ResumeError } from './errors.ts'
import { decodeJson, validateDocument } from './operations.ts'
export type * from '../types.ts'
export { ResumeError } from './errors.ts'

declare module '@deepseek-ai/cordis' {interface Context {fastResume:FastResumeService}}
/** Trusted Session metadata supplied by Harness tool execution, never by model arguments. */
export interface ResumeExecution {sessionId:SessionId;callId:ToolExecutionInput['callId'];signal:AbortSignal}
interface MutationExecution {sessionId:SessionId;mutationId:string;signal:AbortSignal}
/** Owns accepted assistant/editor operations through durable settlement; closing rejects new work while completion callbacks drain. */
export class FastResumeService extends TypertRemoteService {
 static inject=['profileContext']
 static Config=Schema.object({storageDir:Schema.string(),wheelZoomDirection:Schema.union(['auto','standard','reversed']).default('auto'),autosaveDelayMs:Schema.number().min(1).step(1).default(2000),maxAssistantCheckpointBytes:Schema.number().min(1).step(1).default(67108864),maxDocumentBytes:Schema.number().min(1).step(1).default(10485760),maxImportBytes:Schema.number().min(1).step(1).default(10485760),maxVersions:Schema.number().min(1).step(1).default(100),renderTimeoutMs:Schema.number().min(1).step(1).default(30000),lockWaitMs:Schema.number().min(1).step(1).default(10000),maxRenderRequests:Schema.number().min(1).step(1).default(8),rendererLeaseMs:Schema.number().min(1).step(1).default(15000),maxProposalOperations:Schema.number().min(1).step(1).default(256),renderPixelRatio:Schema.number().min(0.1).max(4).default(2),maxRenderPixels:Schema.number().min(1).step(1).default(32000000),frameConnectTimeoutMs:Schema.number().min(1).step(1).default(15000),bridgeTimeoutMs:Schema.number().min(1).step(1),rendererPollIntervalMs:Schema.number().min(1).step(1).default(1000),editorPrepareTimeoutMs:Schema.number().min(1).step(1).default(15000),editorLeaseMs:Schema.number().min(1).step(1).default(15000),editorPollIntervalMs:Schema.number().min(1).step(1).default(1000),refreshIntervalMs:Schema.number().min(1).step(1).default(2000)})
 private readonly operations=new OperationLifetime()
 private readonly store:ResumeStore
 private readonly contexts:SessionContextStore
 private readonly editors:EditorCoordinator
 private readonly queue:RenderQueue
 private readonly config:ResolvedConfig
 constructor(ctx:Context,config:Config={}) {super(ctx,'fastResume');this.config=resolveConfig(ctx.profileContext.dir,config);this.store=new ResumeStore(this.config);this.contexts=new SessionContextStore(this.store);this.editors=new EditorCoordinator(this.store);ctx.effect(()=>()=>this.operations.close([()=>this.editors.dispose(),()=>this.contexts.dispose()]),'fastResume.operations()');this.queue=new RenderQueue({timeoutMs:this.config.renderTimeoutMs,leaseMs:this.config.rendererLeaseMs,maxRequests:this.config.maxRenderRequests,maxBytes:this.config.maxDocumentBytes,maxPixels:this.config.maxRenderPixels});ctx.effect(()=>()=>this.queue.dispose(),'fastResume.renderers()')}
 private owned<T>(operation:()=>T|Promise<T>,completion=false):Promise<T>{return this.guard(()=>this.operations.run(operation,completion))}
 private async guard<T>(operation:()=>T|Promise<T>):Promise<T>{try{return await operation()}catch(error){if(error instanceof ResumeError)throw new RemoteError('FAST_RESUME_ERROR',error.message,{code:error.code,...(error.currentRevision===undefined?{}:{currentRevision:error.currentRevision})});throw error}}
 /** Resolve a Session target or inspect an explicit document without rebinding.
  * @param sessionId Actual caller Session identity.
  * @param explicitResumeId Optional comparison target.
  * @returns Current target metadata or an explicit choice requirement.
  */
 async resolveContext(sessionId:SessionId,explicitResumeId?:ResumeId):Promise<ResumeContextResult>{return this.owned(()=>this.contexts.resolve(sessionId,explicitResumeId))}
 /** Read a Session target through the authenticated Client API without changing its binding.
  * @param request Actual Session and optional comparison target.
  * @returns Bound document metadata or an explicit choice requirement.
  */
 @Remote async readContext(request:ResumeContextReadRequest):Promise<ResumeContextResult>{return this.resolveContext(request.sessionId,request.explicitResumeId)}
 /** Persist an explicit Session target without changing the document.
  * @param request Session, target, acknowledged revision, and retry identity.
  * @returns Selection metadata at the acknowledged document revision.
  */
 async bindContext(request:ResumeContextBindRequest):Promise<ResumeContextResult>{return this.operations.run(()=>this.contexts.bind(request))}
 /** Durably allocate one ordinary Session entry before Client dispatch.
  * @param request Explicit document and stable entry identity.
  * @returns Durable allocation and first-call admission.
  */
 @Remote async beginAssistantHandoff(request:AssistantHandoffBegin):Promise<AssistantHandoffAdmission>{return this.owned(()=>this.contexts.beginAssistantHandoff(request))}
 /** Read creation evidence after failure or reload.
  * @param request Stable entry identity.
  * @returns Durable record or null.
  */
 @Remote async readAssistantHandoff(request:AssistantHandoffRead):Promise<AssistantHandoffRecord|null>{return this.owned(()=>this.contexts.readAssistantHandoff(request))}
 /** Persist the actual Session response before binding.
  * @param request Entry and canonical Session identities.
  * @returns Durable record.
  */
 @Remote async recordAssistantSession(request:AssistantSessionRecord):Promise<AssistantHandoffRecord>{return this.owned(()=>this.contexts.recordAssistantSession(request))}
 /** Bind an acknowledged entry without saving document content.
  * @param request Canonical Session and document revision.
  * @returns Persisted context selection.
  */
 @Remote async bindAssistantContext(request:ResumeContextBindRequest):Promise<ResumeContextResult>{return this.owned(()=>this.contexts.bind(request))}
 /** Transfer an exact editor generation; retained checkpoints survive unknown outcomes.
  * @param request Validated transfer identity and generation.
  * @returns Durable coordinator acknowledgement.
  */
 @Remote async editorTransfer(request:EditorTransfer):Promise<boolean>{return this.owned(()=>this.editors.transfer(request))}
 /** Claim an exact editor generation; retained checkpoints survive unknown outcomes.
  * @param request Validated transfer identity and generation.
  * @returns Durable coordinator acknowledgement.
  */
 @Remote async editorClaim(request:EditorClaim):Promise<EditorClaimed>{return this.owned(()=>this.editors.claim(request))}
 /** Activate an exact editor generation; retained checkpoints survive unknown outcomes.
  * @param request Validated transfer identity and generation.
  * @returns Durable coordinator acknowledgement.
  */
 @Remote async editorActivate(request:EditorActivation):Promise<EditorOwnership>{return this.owned(()=>this.editors.activate(request))}
 /** Rollback an exact editor generation; retained checkpoints survive unknown outcomes.
  * @param request Validated transfer identity and generation.
  * @returns Durable coordinator acknowledgement.
  */
 @Remote async editorRollback(request:EditorRollback):Promise<EditorOwnership>{return this.owned(()=>this.editors.rollback(request))}
 /** Designate a fresh recovery frame after revoking a detached target.
  * @param request Retained checkpoint and outgoing/fresh generations.
  * @returns Exact revision available to the recovery frame.
  */
 @Remote async editorRecover(request:EditorRecovery):Promise<EditorRecovered>{return this.owned(()=>this.editors.recover(request))}
 /** Inspect one exact retained transfer without changing document or ownership state.
  * @param request Branded document, transfer and checkpoint identities, validated at the Remote entry.
  * @returns Disposition and revisions without capabilities or checkpoint content.
  */
 @Remote async editorTransferRead(request:EditorTransferRead):Promise<EditorTransferDisposition>{return this.owned(()=>this.editors.inspect(requestSchemas.editorTransferRead.parse([request])[0]))}
 /** Register an authenticated editor document and recovery owner.
  * @param request Actual frame/document identity and pending recovery state.
  * @returns Document-scoped capability and uncertainty status.
  */
 @Remote async editorRegister(request:EditorRegistration):Promise<EditorOwnership>{return this.owned(()=>this.editors.register(request))}
 /** Poll preparation and renew liveness without clearing uncertainty.
  * @param id Document identity.
  * @param token Writable frame capability.
  * @returns Pending preparation or null after release.
  */
 @Remote async editorPoll(id:ResumeId,token:EditorToken):Promise<EditorPreparation|null>{return this.owned(()=>this.editors.poll(id,token),true)}
 /** Acknowledge preparation after draft/save/recovery draining.
  * @param request Exact clean revision or failure.
  * @returns True after persistence.
  */
 @Remote async editorAcknowledge(request:EditorAcknowledgement):Promise<boolean>{return this.owned(()=>this.editors.acknowledge(request),true)}
 /** Explicitly reconcile ownership at the acknowledged committed revision.
  * @param request Current capability and committed revision.
  * @returns Reconciled ownership; recovery bytes remain untouched.
  */
 @Remote async editorReconcile(request:EditorReconciliation):Promise<EditorOwnership>{return this.owned(()=>this.editors.reconcile(request))}
 /** Retain uncertainty when a frame disconnects.
  * @param id Document identity.
  * @param token Frame capability.
  * @param detached Explicit frame disposal; omission retains unknown live ownership.
  * @returns True after persistence.
  */
 @Remote async editorDisconnect(id:ResumeId,token:EditorToken,detached?:boolean):Promise<boolean>{return this.owned(()=>this.editors.disconnect(id,token,detached),true)}
 /** Commit an atomic model edit after all known editor drafts have acknowledged preparation.
  * @param request Identical-retry operation batch.
  * @param execution Trusted Session/call/signal metadata from tool execution.
  * @returns Durable receipt; target association failure is reported as committed in the summary.
  */
 async edit(request:ProposeRequest,execution:ResumeExecution):Promise<ResumeEditResult>{return this.operations.run(async()=>{const recovered=await this.store.recoverEdit(request);return this.contexts.executeCommit(execution.sessionId,recovered?undefined:execution.signal,signal=>this.commitEdit(request,{...execution,signal}))})}
 private async commitEdit(request:ProposeRequest,execution:ResumeExecution):Promise<ResumeEditResult>{
  const target={sessionId:execution.sessionId,resumeId:request.id,requestId:createHash('sha256').update(JSON.stringify(['edit',request.id,request.requestId])).digest('hex'),fingerprint:createHash('sha256').update(JSON.stringify({kind:'edit',request})).digest('hex')}
  let releaseFailed=false
  let receipt=await this.store.recoverEdit(request)
  if(!receipt){if(execution.signal.aborted)throw new ResumeError('edit-cancelled','Resume edit cancelled before admission');const intent=await this.contexts.beginCommit(target);try{const permit=await this.editors.prepare({resumeId:request.id,expectedRevision:request.expectedRevision,mutationId:execution.callId,signal:execution.signal});try{receipt=await this.store.edit(request,execution.signal,permit.guard)}finally{try{await permit.release()}catch(error){if(!receipt)throw error;releaseFailed=true}}}catch(error){await this.discardRejectedIntent(intent,error,()=>this.store.recoverEdit(request));throw error}}
  let summary=request.summary
  if(releaseFailed)summary+=` (Committed revision ${receipt.revision}; editor release was not acknowledged. Reopen and reconcile ownership.)`
  try{if(await this.contexts.finishCommit(target,receipt.revision)==='ambiguous')summary+=` (Committed revision ${receipt.revision}; target association is ambiguous. Explicitly select the intended Session target.)`}catch(error){summary+=` (Committed revision ${receipt.revision}; Session target association was not acknowledged. Recover using the same edit inputs.)`}
  return{schemaVersion:1,resumeId:request.id,sessionId:execution.sessionId,baseRevision:request.expectedRevision,receipt,summary}
 }
 /** Coordinate legacy model mutations while retaining their original receipt output.
  * @param kind Legacy mutation kind.
  * @param request Existing request fields.
  * @param execution Trusted tool context.
  * @returns Original legacy receipt including on offline identical retry.
  */
 async modelMutation(kind:'apply'|'revert'|'restore',request:ApplyRequest|RevertRequest|RestoreRequest,execution:ResumeExecution):Promise<ChangeReceipt>{return this.operations.run(async()=>{const recovered=(await this.store.history(request.id)).changes.some(change=>change.requestId===request.requestId);return this.contexts.executeCommit(execution.sessionId,recovered?undefined:execution.signal,async signal=>{const result=await this.commitLegacy(kind,request,{sessionId:execution.sessionId,mutationId:execution.callId,signal});if(result.editor==='uncertain'||result.association==='failed'||result.association==='ambiguous')throw new ResumeError('storage-failure',`Mutation committed: ${JSON.stringify(result.receipt)}. ${result.editor==='uncertain'?'Editor release was not acknowledged; reopen and reconcile ownership.':result.association==='ambiguous'?'Target association is ambiguous; explicitly select the intended Session target.':'Session target association was not acknowledged.'} Retry identical inputs to recover the receipt.`);return result.receipt})})}
 private async commitLegacy(kind:'apply'|'revert'|'restore',request:ApplyRequest|RevertRequest|RestoreRequest,execution:MutationExecution):Promise<ResumeUiMutationResult>{
  const history=await this.store.history(request.id),old=history.changes.find(c=>c.requestId===request.requestId)
  const perform=(guard?:import('./store.ts').MutationGuard)=>kind==='apply'?this.store.apply(request as ApplyRequest,guard):kind==='revert'?this.store.revert(request as RevertRequest,guard):this.store.restore(request as RestoreRequest,guard)
  const target={sessionId:execution.sessionId,resumeId:request.id,requestId:createHash('sha256').update(JSON.stringify([kind,request.id,request.requestId])).digest('hex'),fingerprint:createHash('sha256').update(JSON.stringify({kind,request})).digest('hex')}
  let receipt:ChangeReceipt|undefined,editor:ResumeUiMutationResult['editor']='released'
  if(old){receipt=await perform();editor='not-required'}
  else{
   const revision='expectedRevision' in request?request.expectedRevision:history.proposals.find(p=>p.id===request.proposalId)?.baseRevision
   if(revision===undefined)throw new ResumeError('not-found','Proposal does not exist')
   if(execution.signal.aborted)throw new ResumeError('edit-cancelled','Resume edit cancelled before admission')
   const intent=await this.contexts.beginCommit(target)
   try{const permit=await this.editors.prepare({resumeId:request.id,expectedRevision:revision,mutationId:execution.mutationId,signal:execution.signal})
   try{receipt=await perform(permit.guard)}finally{try{await permit.release()}catch(error){if(!receipt)throw error;editor='uncertain'}}}catch(error){await this.discardRejectedIntent(intent,error,async()=>(await this.store.history(request.id)).changes.find(change=>change.requestId===request.requestId));throw error}
  }
  let association:ResumeUiMutationResult['association']
  try{association=await this.contexts.finishCommit(target,receipt.revision)}catch(error){association='failed'}
  return{resumeId:request.id,sessionId:execution.sessionId,receipt,association,editor}
 }
 /** Execute explicit UI approval or undo with draft coordination and identical-retry receipt recovery.
  * @param request Session, UI correlation identity and immutable mutation inputs.
  * @param signal Cancellation before admission; admitted writes settle and remain recoverable.
  * @returns Committed receipt with independent association and release status. Transport failure requires identical retry.
  */
 @Remote async uiMutation(request:ResumeUiMutationRequest,signal?:AbortSignal):Promise<ResumeUiMutationResult>{return this.owned(async()=>{
  const input=uiMutationRequestSchema.parse(request),recovered=(await this.store.history(input.request.id)).changes.some(change=>change.requestId===input.request.requestId)
  return this.contexts.executeCommit(input.sessionId,recovered?undefined:signal,combined=>this.commitLegacy(input.kind,input.request,{sessionId:input.sessionId,mutationId:input.actionId,signal:combined}))
 })}
 /** Save an owned conversation draft, independently reporting conditional target association.
  * @param request Current editor capability, document save and actual conversation Session.
  * @returns Acknowledged snapshot even if context capture or association fails. Save failures still reject.
  */
 @Remote async saveInSession(request:ResumeSessionSaveRequest):Promise<ResumeSessionSaveResult>{return this.owned(async()=>{
  const input=sessionSaveRequestSchema.parse(request)
  let previous:string|null|undefined
  try{previous=await this.contexts.captureManualSave(input.contextSessionId)}catch(error){/* Document persistence remains available when Session context storage fails. */}
  const snapshot=await this.store.save(input.save,this.editors.guard(input.save.id,input.token))
  let association:ResumeSessionSaveResult['association']='failed'
  if(previous!==undefined)try{association=await this.contexts.finishManualSave(input.contextSessionId,previous,snapshot)}catch(error){/* The document acknowledgement must survive failed target persistence. */}
  return{snapshot,association}
 })}
 private async discardRejectedIntent(intent:CommitIntent,error:unknown,recover:()=>Promise<ChangeReceipt|undefined>):Promise<void>{
  if(!(error instanceof ResumeError)||!['invalid-input','conflict','not-found','edit-cancelled','editor-unavailable'].includes(error.code))return
  let receipt:ChangeReceipt|undefined
  try{receipt=await recover()}catch(recoveryError){return /* Unverified receipt state retains its ordering evidence. */}
  if(receipt)return
  await this.contexts.abandonCommit(intent)
 }
 /** List resume summaries.
  * @returns Active profile documents.
  */
 @Remote async list():Promise<ResumeSummary[]>{return this.guard(()=>this.store.list())}
 /** Create a blank, template, or supplied document.
  * @param request Initial document selection.
  * @returns Revision-one independent snapshot.
  */
 @Remote async create(request:CreateRequest):Promise<ResumeSnapshot>{return this.guard(()=>this.store.create(request))}
 /** Read a committed document.
  * @param id Resume identity.
  * @returns Current snapshot.
  */
 @Remote async read(id:ResumeId):Promise<ResumeSnapshot>{return this.guard(()=>this.store.read(id))}
 /** Persist an optimistic draft.
  * @param request Full document and expected revision.
  * @param token Optional current editor capability, validated under the writer lock.
  * @returns New snapshot or a structured conflict.
  */
 @Remote async save(request:SaveRequest,token?:EditorToken):Promise<ResumeSnapshot>{return this.owned(()=>this.store.save(request,this.editors.guard(request.id,token)))}
 /** Rename one document with revision checking.
  * @param id Resume identity.
  * @param expectedRevision Current acknowledged revision.
  * @param title Replacement title.
  * @param token Optional current editor capability.
  * @returns Committed snapshot.
  */
 @Remote async rename(id:ResumeId,expectedRevision:ResumeRevision,title:string,token?:EditorToken):Promise<ResumeSnapshot>{return this.guard(()=>this.store.rename(id,expectedRevision,title,this.editors.guard(id,token)))}
 /** Duplicate a document and all recursive ids.
  * @param id Source resume identity.
  * @returns New independent snapshot.
  */
 @Remote async duplicate(id:ResumeId):Promise<ResumeSnapshot>{return this.guard(()=>this.store.duplicate(id))}
 /** Remove a document explicitly.
  * @param id Resume identity.
  * @param expectedRevision Last acknowledged revision.
  * @param token Optional current editor capability.
  * @returns True after deletion.
  */
 @Remote async deleteResume(id:ResumeId,expectedRevision:ResumeRevision,token?:EditorToken):Promise<boolean>{return this.guard(()=>this.store.remove(id,expectedRevision,this.editors.guard(id,token)))}
 /** Validate a durable proposal without mutating the current document.
  * @param request Revision-bound editing operations.
  * @returns Reviewable proposal and before/after preview.
  */
 @Remote async propose(request:ProposeRequest):Promise<ProposalView>{return this.guard(()=>this.store.propose(request))}
 /** Apply a proposal with a durable idempotency receipt.
  * @param request Explicit proposal selection.
  * @param token Optional current editor capability.
  * @returns New revision receipt or original identical receipt.
  */
 @Remote async applyProposal(request:ApplyRequest,token?:EditorToken):Promise<ChangeReceipt>{return this.guard(()=>this.store.apply(request,this.editors.guard(request.id,token)))}
 /** Undo one applied proposal while retaining unrelated later changes.
  * @param request Expected revision and applied proposal identity.
  * @param token Optional current editor capability.
  * @returns New mutation receipt or an overlapping-edit conflict.
  */
 @Remote async revert(request:RevertRequest,token?:EditorToken):Promise<ChangeReceipt>{return this.guard(()=>this.store.revert(request,this.editors.guard(request.id,token)))}
 /** Read one revision's mutation metadata without proposal or version documents.
  * @param id Document identity.
  * @param revision Committed revision.
  * @returns A matching receipt, or null for an ordinary saved revision.
  */
 @Remote async changeReceipt(id:ResumeId,revision:ResumeRevision):Promise<ChangeReceipt|null>{return this.guard(()=>this.store.changeReceipt(id,revision))}
 /** List retained versions and proposals.
  * @param id Resume identity.
  * @returns History summaries and receipts.
  */
 @Remote async history(id:ResumeId):Promise<HistoryView>{return this.guard(()=>this.store.history(id))}
 /** Read one historical document.
  * @param id Resume identity.
  * @param versionId Retained snapshot identity.
  * @returns Historical snapshot.
  */
 @Remote async versionRead(id:ResumeId,versionId:ResumeVersionId):Promise<ResumeSnapshot>{return this.guard(()=>this.store.versionRead(id,versionId))}
 /** Restore as a new committed revision.
  * @param request Version and expected current revision.
  * @param token Optional current editor capability.
  * @returns Durable receipt.
  */
 @Remote async restore(request:RestoreRequest,token?:EditorToken):Promise<ChangeReceipt>{return this.guard(()=>this.store.restore(request,this.editors.guard(request.id,token)))}
 /** Import a size-bounded file through retained upstream parsers.
  * @param request Declared format and base64 bytes.
  * @returns New editable snapshot.
  */
 @Remote async importDocument(request:ImportRequest):Promise<ResumeSnapshot>{return this.guard(()=>this.store.importDocument(request))}
 /** Read packaged editor HTML through the authenticated transport.
  * @returns Complete srcdoc and resolved adapter limits.
  */
 @Remote async editorAssets():Promise<EditorAssets>{return{maxAssistantCheckpointBytes:this.config.maxAssistantCheckpointBytes,wheelZoomDirection:this.config.wheelZoomDirection,editorPollIntervalMs:this.config.editorPollIntervalMs,html:await readFile(new URL('../assets/editor.html',import.meta.url),'utf8'),autosaveDelayMs:this.config.autosaveDelayMs,maxImportBytes:this.config.maxImportBytes,maxDocumentBytes:this.config.maxDocumentBytes,frameConnectTimeoutMs:this.config.frameConnectTimeoutMs,bridgeTimeoutMs:this.config.bridgeTimeoutMs,rendererPollIntervalMs:this.config.rendererPollIntervalMs,refreshIntervalMs:this.config.refreshIntervalMs}}
 /** Register one live client renderer.
  * @returns Lease token renewed by polling.
  */
 @Remote async rendererRegister():Promise<RendererLease>{return this.guard(()=>this.queue.register())}
 /** Renew a renderer and claim one job.
  * @param rendererId Private renderer lease token.
  * @returns Exact committed render job or null.
  */
 @Remote async rendererPoll(rendererId:string):Promise<RenderJob|null>{return this.guard(()=>this.queue.poll(rendererId))}
 /** Complete a claimed job with validated bytes or an explicit failure.
  * @param completion Renderer lease and result.
  * @returns True when the job was settled.
  */
 @Remote async rendererComplete(completion:RenderCompletion):Promise<boolean>{return this.guard(()=>this.queue.complete(completion))}
 /** Disconnect a renderer and reject its outstanding jobs.
  * @param rendererId Private lease token.
  * @returns True after cancellation.
  */
 @Remote async rendererUnregister(rendererId:string):Promise<boolean>{return this.guard(()=>{this.queue.unregister(rendererId);return true})}
 /** Store verified export bytes before returning a receipt.
  * @param request Exact revision and requested format/page.
  * @param signal Transport or tool cancellation signal.
  * @returns Downloadable bytes and durable artifact metadata.
  */
 @Remote async exportDocument(request:ExportRequest,signal:AbortSignal):Promise<ExportReceipt>{return this.guard(async()=>{
   const snapshot=await this.store.read(request.id)
   if(snapshot.revision!==request.expectedRevision)throw new ResumeError('conflict','Export revision changed',snapshot.revision)
   const document=validateDocument(decodeJson(snapshot.documentJson),this.config.maxDocumentBytes)
   const page=request.pageId===undefined?document.pages[0]:document.pages.find(page=>page.id===request.pageId)
   if(!page)throw new ResumeError('invalid-input','Selected export page does not exist')
   const rendered=request.format==='json'?undefined:await this.queue.request({resumeId:request.id,revision:snapshot.revision,documentJson:snapshot.documentJson,format:request.format,pixelRatio:this.config.renderPixelRatio,...(request.pageId===undefined?{}:{pageId:request.pageId})},signal)
   const bytes=rendered?.bytes??Buffer.from(serializeResumeBackup(document))
   signal.throwIfAborted()
   const id=randomUUID();const filename=`resume-${request.id}-r${snapshot.revision}.${request.format}`
   const artifactPath=join(this.config.storageDir,'exports',`${id}.${request.format}`)
   await writeFileAtomic(artifactPath,bytes,{mode:0o600,dirMode:0o700})
   if(signal.aborted){await import('node:fs/promises').then(fs=>fs.rm(artifactPath,{force:true}));throw new ResumeError('render-cancelled','Export was cancelled')}
   const dimensions={...document.pageConfig,...page.config}
   return{id,resumeId:request.id,revision:snapshot.revision,format:request.format,filename,byteSize:bytes.byteLength,pageCount:rendered?.pageCount??document.pages.length,width:rendered?.width??dimensions.width,height:rendered?.height??dimensions.height,dimensionUnit:rendered?.dimensionUnit??'mm',dataBase64:Buffer.from(bytes).toString('base64'),artifactPath}
 })}
}
export default FastResumeService

/** Ordinary Session creation with durable admission and canonical-response recovery. */
import {brandString} from '@deepseek-ai/dsh-brand'
import {editorDestination,prepareEditorHandoff,releaseEditorHandoff,rollbackEditorHandoff,type PreparedEditorHandoff,type RetainedEditorHandoff} from './editor-handoff.ts'
import type {EditorViews} from './editor-views.ts'
import type {AssistantHandoffId,EditorLaunch} from '../types.ts'
import type {IWorkspaces,WorkspaceSnapshot} from '@deepseek-ai/dsh-api-workspace-controller/client'
import type {AssistantWorkspaceId} from '../types.ts'
import type {ISessions} from '@deepseek-ai/dsh-api-session-controller/client'
import type {SessionId} from '@deepseek-ai/dsh-session/types'
import type {AssistantHandoffBegin,AssistantHandoffRead,AssistantHandoffAdmission,AssistantHandoffRecord,AssistantSessionRecord,AssistantEntryState,EditorCheckpointId,ResumeContextBindRequest,ResumeId} from '../types.ts'
declare module '@deepseek-ai/dsh-api-session-controller/client' {interface SessionReferenceSourceMap {fastResumeEntry:unknown}}
/** Wait on the public Workspace projection without bypassing source cancellation. */
function workspaceReady(workspaces:Pick<IWorkspaces,'list'>,signal:AbortSignal,accept:(snapshot:WorkspaceSnapshot)=>boolean):Promise<WorkspaceSnapshot>{
 return new Promise((resolve,reject)=>{
  let remove=()=>{}
  const stop=()=>{remove();signal.removeEventListener('abort',cancel)}
  const cancel=()=>{stop();reject(signal.reason)}
  const check=()=>{const snapshot=workspaces.list.getSnapshot();if(signal.aborted){cancel();return}if(snapshot.state==='error'){stop();reject(Error('Workspace connection is unavailable. Retry after reconnecting.'));return}if(snapshot.phase==='ready'&&accept(snapshot)){stop();resolve(snapshot)}}
  remove=workspaces.list.subscribe(check);signal.addEventListener('abort',cancel,{once:true});check()
 })
}
/** Resolve the selected Session's Workspace, otherwise the Host's configured default, before admitting create.
 * @param workspaces Public Workspace Controller.
 * @param sessions Public Session catalog and reference-source counts.
 * @param signal Source entry lifetime.
 * @returns Workspace identity to persist with the admitted Session identity.
 */
export async function assistantWorkspace(workspaces:Pick<IWorkspaces,'list'|'initializeDefault'>,sessions:Pick<ISessions,'list'>,signal:AbortSignal):Promise<AssistantWorkspaceId>{
 const snapshot=await workspaceReady(workspaces,signal,()=>true),catalog=sessions.list.getSnapshot()
 const selected=snapshot.items.find(workspace=>workspace.sessionIds.some(id=>(catalog.byId[id]?.retainedBy.mainView??0)>0))
 if(selected)return selected.workspaceId
 const fallback=await workspaces.initializeDefault(signal);signal.throwIfAborted()
 if(!fallback)throw Error('Choose a Workspace in Harness before opening a new resume conversation.')
 return fallback.workspaceId
}
/** Hold the canonical Session until public navigation acquires its own reference and Workspace membership is visible.
 * @param sessions Public Client Session service.
 * @param workspaces Public Workspace projection.
 * @param sessionId Journaled canonical identity.
 * @param workspaceId Workspace fixed by the admitted entry.
 * @param signal Source navigation lifetime.
 * @returns Reference release, owned by the caller through synchronous main navigation.
 */
export async function prepareAssistantSession(sessions:Pick<ISessions,'refresh'|'retain'>,workspaces:Pick<IWorkspaces,'list'>,sessionId:SessionId,workspaceId:AssistantWorkspaceId,signal:AbortSignal):Promise<()=>void>{
 await sessions.refresh();signal.throwIfAborted()
 await workspaceReady(workspaces,signal,snapshot=>snapshot.items.some(workspace=>workspace.workspaceId===workspaceId&&workspace.sessionIds.includes(sessionId)))
 const reference=sessions.retain(sessionId,{source:'fastResumeEntry',signal})
 try{const binding=await reference.ready;signal.throwIfAborted();if(binding.session.getSnapshot().openState!=='open')throw Error('Conversation could not open. Retry this same conversation after checking its connection.');return()=>reference.release()}catch(error){reference.release();throw error}
}
export interface SessionHandoffCalls {
 workspace:(signal:AbortSignal)=>Promise<AssistantWorkspaceId>
 begin:(request:AssistantHandoffBegin)=>Promise<AssistantHandoffAdmission>
 read:(request:AssistantHandoffRead)=>Promise<AssistantHandoffRecord|null>
 record:(request:AssistantSessionRecord)=>Promise<AssistantHandoffRecord>
 create:(request:{sessionId:SessionId;workspaceId:AssistantWorkspaceId})=>Promise<{sessionId:SessionId}>
 bind:(request:ResumeContextBindRequest)=>Promise<unknown>
 lookup:(sessionId:SessionId)=>Promise<boolean>
}
/** One entry can be retried, but an unresolved create is never dispatched twice. */
export class SessionHandoff {
 private pending:Promise<{sessionId:SessionId;resumeId:ResumeId;workspaceId:AssistantWorkspaceId}>|undefined
 private readonly known=new Map<AssistantHandoffId,SessionId>()
 constructor(private readonly calls:SessionHandoffCalls){}
 /** Read one durable entry for target-mount cleanup after reload.
  * @param requestId Tab-retained entry identity.
  * @returns Known Session evidence, or null without inferring an outcome.
  */
 readEntry(requestId:AssistantHandoffId):Promise<AssistantHandoffRecord|null>{return this.calls.read({requestId})}
 /** Save/checkpoint precede this call; navigation follows its acknowledged binding.
  * @param input Explicit entry and checkpoint identity.
  * @param progress In-place phase reporting.
  * @param signal Source lifetime until navigation is committed.
  * @returns Canonical Session and bound document; no prompt is submitted.
  */
 startResumeConversation(input:Omit<AssistantHandoffBegin,'workspaceId'>&{checkpointId:EditorCheckpointId},progress:(state:AssistantEntryState)=>void=()=>{},signal:AbortSignal):Promise<{sessionId:SessionId;resumeId:ResumeId;workspaceId:AssistantWorkspaceId}>{
  if(this.pending)return this.pending
  const unknown=(cause?:unknown)=>Object.assign(Error('Conversation creation is unconfirmed. Check the conversation list; retry only reconciles this entry.',{cause}),{code:'outcome-unknown'})
  const run=async()=>{
   signal.throwIfAborted();progress('creating')
   const previous=await this.calls.read({requestId:input.requestId})
   const workspaceId=previous?previous.workspaceId:await this.calls.workspace(signal)
   if(!workspaceId)throw Error('This existing conversation has no recorded Workspace. Its saved editor can be recovered, but Retry cannot attach or replace this conversation.')
   signal.throwIfAborted()
   const admission=await this.calls.begin({resumeId:input.resumeId,expectedRevision:input.expectedRevision,requestId:input.requestId,workspaceId});let sessionId=this.known.get(input.requestId)??admission.handoff.sessionId
   if(!sessionId){
    if(admission.admitted){
     signal.throwIfAborted()
     try{sessionId=(await this.calls.create({sessionId:admission.handoff.requestedSessionId,workspaceId})).sessionId;this.known.set(input.requestId,sessionId)}catch(error){throw unknown(error)}
    }else{
     const stored=await this.calls.read({requestId:input.requestId});sessionId=stored?.sessionId
     if(!sessionId){if(await this.calls.lookup(admission.handoff.requestedSessionId))sessionId=admission.handoff.requestedSessionId;else throw unknown()}
    }
   }
   // A known response is journaled even if its source closed while create was in flight.
   await this.calls.record({requestId:input.requestId,sessionId});this.known.delete(input.requestId);signal.throwIfAborted();progress('binding')
   await this.calls.bind({sessionId,resumeId:input.resumeId,expectedRevision:input.expectedRevision,requestId:`${input.requestId}:${input.expectedRevision}`,source:'editor-entry'})
   signal.throwIfAborted();return{sessionId,resumeId:input.resumeId,workspaceId}
  }
  const pending=run().catch(error=>{progress(error instanceof Error&&'code' in error&&error.code==='outcome-unknown'?'outcome-unknown':'failed');throw error}).finally(()=>{if(this.pending===pending)this.pending=undefined})
  this.pending=pending;return pending
 }
}

/** A post-commit root observer opens this exact descriptor in its mounted Session. */
export interface AssistantOpen {sessionId:SessionId;resumeId:ResumeId;handoff:import('./editor-handoff.ts').RetainedEditorHandoff}

/** Client-lifetime entry guard; editor ownership remains exclusively in EditorViews and the Host coordinator. */
export class AssistantEntry {
 private pending:Promise<boolean>|undefined
 private requested:(AssistantOpen&{requestId:AssistantHandoffId})|undefined
 private readonly listeners=new Set<()=>void>()
 constructor(private readonly flow:SessionHandoff,private readonly views:()=>Pick<EditorViews,'source'|'retain'>,private readonly storage:Storage|undefined,private readonly navigate:(id:SessionId)=>void,private readonly reveal:(id:SessionId,signal:AbortSignal)=>Promise<void>,private readonly prepareNavigation?:(id:SessionId,workspaceId:AssistantWorkspaceId,signal:AbortSignal)=>Promise<()=>void>){}
 private key(id:ResumeId){return `fast-resume:assistant-entry:v1:${id}`}
 /** Pending explicit entry for the mounted Session observer; historical bindings never populate it. */
 readonly snapshot=():AssistantOpen|undefined=>this.requested
 /** Observe explicit entry completion/navigation. */
 readonly subscribe=(listener:()=>void):(()=>void)=>{this.listeners.add(listener);return()=>{this.listeners.delete(listener)}}
 private notify(){for(const listener of this.listeners)listener()}
 /** Share admission across all editor entry surfaces; Session-local calls only reveal their bound view.
  * @param id Visible document.
  * @param sessionId Actual resource Session, absent for the global editor.
  * @param signal Source lifetime until navigation commits.
  * @returns Navigation acknowledgement. Save failures never create Sessions.
  */
 readonly open=(id:ResumeId,sessionId:SessionId|undefined,signal:AbortSignal):Promise<boolean>=>{
  if(this.pending)return this.pending
  const run=async()=>{
   signal.throwIfAborted()
   if(sessionId){await this.reveal(sessionId,signal);return true}
   const source=this.views().source(id);if(!source)throw Error('Show the resume editor before opening its assistant')
   const storage=this.storage;if(!storage)throw Error('Assistant entry requires browser tab storage. Keep this editor open.')
   const key=this.key(id),existing=storage.getItem(key),requestId=brandString<AssistantHandoffId>(existing??crypto.randomUUID())
   if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId))throw Error('Assistant entry recovery record is invalid')
   storage.setItem(key,requestId);if(storage.getItem(key)!==requestId)throw Error('Assistant entry recovery could not be retained')
   const progress=(state:AssistantEntryState)=>{void source.bridge.call('assistantStatus',[state]).catch(error=>{/* Source disposal ends its progress surface; durable evidence remains in the Host. */})}
   let prepared:PreparedEditorHandoff|undefined,navigating=false,clearRetained:(()=>void)|undefined,releaseSession:(()=>void)|undefined
   try{
    progress('saving');prepared=await prepareEditorHandoff(source,editorDestination(source.ownerId),id,signal)
    const retained=releaseEditorHandoff(prepared);clearRetained=this.views().retain(retained)
    const result=await this.flow.startResumeConversation({resumeId:id,expectedRevision:prepared.revision,requestId,checkpointId:prepared.checkpointId},progress,signal)
    signal.throwIfAborted();progress('mounting');releaseSession=await this.prepareNavigation?.(result.sessionId,result.workspaceId,signal);signal.throwIfAborted()
    this.requested={...result,handoff:retained,requestId};progress('mounting');this.notify();navigating=true
    this.navigate(result.sessionId);return true
   }catch(error){
    if(prepared&&!navigating){try{await rollbackEditorHandoff(prepared);clearRetained?.()}catch(rollback){throw Error('Editor recovery is unconfirmed. Keep the saved checkpoint and recover ownership before editing.',{cause:rollback})}}
    progress(error instanceof Error&&'code' in error&&error.code==='outcome-unknown'?'outcome-unknown':'failed');throw error
   }finally{releaseSession?.()}
  }
  const pending=run().finally(()=>{if(this.pending===pending)this.pending=undefined});this.pending=pending;return pending
 }
 /** Retire only this entry after target layout and writer activation are acknowledged.
  * @param launch Actual mounted target resource.
  * @param handoff Completed retained transfer.
  */
 async ready(launch:EditorLaunch,handoff:RetainedEditorHandoff,signal?:AbortSignal):Promise<void>{
  if(launch.source!=='conversation'||!launch.sessionId)return
  const storage=this.storage,key=this.key(launch.resumeId),raw=storage?.getItem(key)
  if(!storage||!raw)return
  const requestId=brandString<AssistantHandoffId>(raw),record=await this.flow.readEntry(requestId)
  signal?.throwIfAborted()
  if(record?.sessionId!==launch.sessionId||record?.resumeId!==launch.resumeId)return
  if(storage.getItem(key)===raw)storage.removeItem(key)
  if(this.requested?.handoff.transferId===handoff.transferId){this.requested=undefined;this.notify()}
 }
}

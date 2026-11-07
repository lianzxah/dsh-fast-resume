/** Client-lifetime live bridge references and durable transfer launch descriptors; Host owns writer admission. */
import {z} from 'zod'
import {brandString,type Branded} from '@deepseek-ai/dsh-brand'
import {resumeIdSchema,resumeRevisionSchema} from '../identity.ts'
import {checkpointIdSchema,transferIdSchema,requestSchemas,editorTransferDispositionSchema} from '../protocol.ts'
import type {EditorLaunch,EditorOwnerId,EditorIncarnationId,ResumeId,ResumeRevision,EditorAssets} from '../types.ts'
import {connectFrame,type Dispatch,type FrameFace} from './frame.tsx'
import {editorDestination,prepareEditorHandoff,releaseEditorHandoff,rollbackEditorHandoff,completeEditorHandoff,recoverEditorHandoff,type EditorReadyHandle,type RetainedEditorHandoff,type EditorIdentity} from './editor-handoff.ts'
const identity=z.object({ownerId:z.string().uuid().transform(brandString<EditorOwnerId>),incarnationId:z.string().uuid().transform(brandString<EditorIncarnationId>)})
const retained=z.object({target:identity,resumeId:resumeIdSchema,revision:resumeRevisionSchema,checkpointId:checkpointIdSchema,transferId:transferIdSchema})
type JournalGeneration=Branded<'FastResumeJournalGeneration'>
const journal=z.object({handoff:retained,recoveryTarget:identity.optional(),generation:z.string().uuid().transform(brandString<JournalGeneration>).optional()})
type JournalValue=z.infer<typeof journal>
type JournalSnapshot={raw:string|null;value?:JournalValue}
/** Exact clean document acknowledged after render by one current visible frame. */
export interface EditorLoaded {sessionId:EditorLaunch['sessionId'];resumeId:ResumeId;revision:ResumeRevision}
type View={loaded?:EditorLoaded;handle?:EditorReadyHandle;resumeId?:ResumeId;visible:boolean;close:()=>void;report:(message:string)=>void}
/** Parent-owned bindings. A hidden view is retained but cannot provide layout evidence. */
export class EditorViews {
 private readonly views=new Set<View>()
 private readonly outlined=new Map<string,ResumeRevision>()
 private loaded:readonly EditorLoaded[]=[]
 private readonly loadedListeners=new Set<()=>void>()
 /** Read the current visible exact-revision acknowledgements, never Host save receipts. */
 readonly loadedSnapshot=():readonly EditorLoaded[]=>this.loaded
 /** Observe view installation, hiding and disposal. */
 readonly subscribeLoaded=(listener:()=>void):(()=>void)=>{this.loadedListeners.add(listener);return()=>{this.loadedListeners.delete(listener)}}
 private publishLoaded(){this.loaded=[...this.views].flatMap(view=>view.visible&&view.loaded?[view.loaded]:[]);for(const listener of this.loadedListeners)listener()}

 /** Highlight only a visible, exactly acknowledged revision; explicit locate may navigate its canvas.
  * @param sessionId Actual conversation identity.
  * @param id Saved document identity.
  * @param revision Receipt revision; later revisions are never mislabeled.
  * @param ids Changed element/page identities.
  * @param locate Whether the user explicitly requested canvas navigation.
  * @returns Completion of the owned editor feedback capability.
  */
 async feedback(sessionId:EditorLaunch['sessionId'],id:ResumeId,revision:ResumeRevision,ids:string[],locate=false):Promise<void>{
  const view=[...this.views].find(v=>v.visible&&v.loaded&&v.loaded.sessionId===sessionId&&v.loaded.resumeId===id&&v.loaded.revision===revision&&v.handle)
  if(!view?.handle)throw Error('Exact saved revision is not visible')
  const key=JSON.stringify([sessionId,id]);if(!locate&&(this.outlined.get(key)??-1)>=revision)return
  if(!locate)this.outlined.set(key,revision)
  await view.handle.bridge.call('editorFeedback',[{resumeId:id,revision,ids,locate}])
 }
 constructor(private readonly assets:()=>Promise<EditorAssets>,private readonly dispatch:Dispatch,private readonly locale:()=> 'en'|'zh',private readonly storage:Storage|undefined,private readonly moved:()=>string,private readonly assistant?:(id:ResumeId,sessionId:EditorLaunch['sessionId'],signal:AbortSignal)=>Promise<boolean>,private readonly mounted?:(launch:EditorLaunch,handoff:RetainedEditorHandoff,signal:AbortSignal)=>void|Promise<void>,private readonly select?:(launch:EditorLaunch,id:ResumeId,revision:ResumeRevision,signal:AbortSignal)=>Promise<void>){}
 private key(id:ResumeId){return `fast-resume:handoff:v1:${id}`}
 private read(id:ResumeId):JournalSnapshot|undefined{
  if(!this.storage)return undefined
  let raw:string|null
  try{raw=this.storage.getItem(this.key(id))}catch(error){return undefined}
  return{raw,value:raw===null?undefined:journal.parse(JSON.parse(raw))}
 }
 private requireJournal(snapshot:JournalSnapshot|undefined):JournalSnapshot{
  if(!snapshot)throw Error('Editor transfer requires available browser tab storage. Keep the source editor open.')
  return snapshot
 }
 /** Synchronous compare-and-replace in this tab; a generation distinguishes identical repeated descriptors. */
 private persist(id:ResumeId,snapshot:JournalSnapshot|undefined,value:Omit<JournalValue,'generation'>|undefined):JournalSnapshot{
  const expected=this.requireJournal(snapshot),storage=this.storage
  if(!storage)throw Error('Editor transfer requires available browser tab storage. Keep the source editor open.')
  const key=this.key(id)
  if(storage.getItem(key)!==expected.raw)throw Error('Editor recovery changed in another attempt. Keep its newer recovery record.')
  const next=value?{...value,generation:brandString<JournalGeneration>(crypto.randomUUID())}:undefined,raw=next?JSON.stringify(next):null
  if(raw===null)storage.removeItem(key);else storage.setItem(key,raw)
  if(storage.getItem(key)!==raw)throw Error('Editor recovery storage could not confirm the write. Keep the source editor open.')
  return{raw,value:next}
 }
 /** Locate a live source without acquiring ownership or changing its Session.
  * @param id Explicit document identity.
  * @returns Visible connected source; undefined if none is mounted. Hidden sources reject because their layout cannot be captured.
  */
 source(id:ResumeId):EditorReadyHandle|undefined{const view=[...this.views].find(v=>v.resumeId===id&&v.handle);if(view&&!view.visible)throw Error('Show the active editor before transferring its history');return view?.handle}
 /** Retain a detached launch before asynchronous creation or navigation.
  * @param handoff Prepared descriptor; storage failure leaves the source responsible for rollback.
  * @returns Generation-checked cleanup, callable only after acknowledged rollback.
  */
 retain(handoff:RetainedEditorHandoff):()=>void{const saved=this.persist(handoff.resumeId,this.read(handoff.resumeId),{handoff});return()=>{this.persist(handoff.resumeId,saved,undefined)}}
 /** Build the shared editor face. Handoff targets mount only after a durable checkpoint is available.
  * @param initialLaunch Placement and actual Session, absent for the library.
  * @param incoming Explicit pre-navigation handoff from the caller.
  * @param navigate Resource-owned document/library navigation; never changes Session binding.
  * @param consumed Notify the owning public tab after this exact transfer is completed or confirmed obsolete.
  * @returns Face plus visibility/disposal owned by the mounted body.
  */
 face(initialLaunch?:EditorLaunch,incoming?:RetainedEditorHandoff,navigate?:(id?:ResumeId)=>void,consumed?:(handoff:RetainedEditorHandoff)=>void):FrameFace&{setVisible:(visible:boolean)=>void;dispose:()=>void}{
  let launch=initialLaunch,current:View|undefined,visible=true,usedIncoming=false,attempt=0
  const face:FrameFace&{setVisible:(visible:boolean)=>void;dispose:()=>void}={loadAssets:this.assets,dispose:()=>current?.close(),setVisible:value=>{visible=value;if(current){const view=current;view.visible=value;if(!value)view.loaded=undefined;this.publishLoaded();void view.handle?.bridge.call('editorVisibility',[value]).catch(error=>{if(current===view&&this.views.has(view))view.report(error instanceof Error?error.message:String(error))})}},connect:(frame,assets,report)=>{
   const opening=launch
   const retry=attempt++>0,abort=new AbortController();let disconnect=()=>{},recoveryDisconnect:(()=>void)|undefined,requestedDocument=opening?.resumeId,ownershipGeneration=0
   const view:View={visible,report,resumeId:opening?.resumeId,close:()=>{abort.abort();disconnect();this.views.delete(view);this.publishLoaded()}};current=view;this.views.add(view)
   const check=()=>{abort.signal.throwIfAborted();if(current!==view||!this.views.has(view))throw Error('Editor attempt is no longer mounted')}
   const run=async()=>{
    let savedJournal:JournalSnapshot|undefined
    const persist=(id:ResumeId,value:Omit<JournalValue,'generation'>|undefined)=>{check();savedJournal=this.persist(id,savedJournal,value)}
    let handoff=usedIncoming?undefined:incoming,target:EditorIdentity|undefined
    if(opening){
     savedJournal=this.read(opening.resumeId)
     let saved=savedJournal?.value
     if(saved&&saved.handoff.resumeId!==opening.resumeId)throw Error('Retained checkpoint document differs')
     if(handoff&&handoff.resumeId!==opening.resumeId)throw Error('Checkpoint document does not match the opened resource')
     if(handoff&&saved&&(handoff.transferId!==saved.handoff.transferId||handoff.checkpointId!==saved.handoff.checkpointId||handoff.revision!==saved.handoff.revision||handoff.target.incarnationId!==saved.handoff.target.incarnationId||handoff.target.ownerId!==saved.handoff.target.ownerId))throw Error('A newer editor recovery record is retained')
     const candidate=handoff??saved?.handoff
     if(candidate){
      this.requireJournal(savedJournal)
      const disposition=editorTransferDispositionSchema.parse(await this.dispatch('editorTransferRead',[{resumeId:opening.resumeId,transferId:candidate.transferId,checkpointId:candidate.checkpointId}],abort.signal))
      check()
      if(this.read(opening.resumeId)?.raw!==savedJournal?.raw)throw Error('Editor recovery changed during lookup')
      if(disposition.state==='unknown'||disposition.revision!==candidate.revision||disposition.currentRevision<disposition.revision||disposition.state==='pending'&&disposition.currentRevision!==disposition.revision)throw Error('Editor transfer could not be confirmed')
      if(disposition.state==='active'){
       handoff=undefined
       if(!saved||disposition.currentRevision>disposition.revision){if(saved)persist(opening.resumeId,undefined);saved=undefined;consumed?.(candidate)}
      }else if(saved?.recoveryTarget)handoff=undefined
      else if(handoff&&!saved)persist(opening.resumeId,{handoff})
      // Only durable retention or confirmed consumption releases the incoming Retry identity.
      usedIncoming=true
     }
     if(!handoff&&saved){
      if([...this.views].some(v=>v!==view&&v.resumeId===opening.resumeId))throw Error('The active editor holds this resume. Return to that pane before recovering.')
      if(!retry)throw Error('A retained editor checkpoint is available. Retry to recover its editing history.')
      target=saved.recoveryTarget??editorDestination(saved.handoff.target.ownerId)
      persist(opening.resumeId,{handoff:saved.handoff,recoveryTarget:target})
      const recovered=await recoverEditorHandoff(saved.handoff,target,this.dispatch,abort.signal)
      persist(opening.resumeId,{handoff:recovered});handoff=recovered
     }
     const source=[...this.views].find(v=>v!==view&&v.resumeId===opening.resumeId&&v.handle)
     if(!handoff&&source){
      if(!source.visible)throw Error('The active editor is hidden. Return to it before moving this resume.')
      this.requireJournal(savedJournal)
      const prepared=await prepareEditorHandoff(source.handle!,editorDestination(source.handle!.ownerId),opening.resumeId,abort.signal)
      try{const released=releaseEditorHandoff(prepared);persist(opening.resumeId,{handoff:released});handoff=released}catch(error){await rollbackEditorHandoff(prepared);throw error}
      source.close();source.report(this.moved())
     }
     if(handoff)target=handoff.target
    }
    check()
    const execute:Dispatch=async(method,args,signal)=>{
     if(method==='editorSelectTarget'){check();if(opening?.source!=='conversation'||!this.select)throw Error('Conversation selection unavailable');const [id,revision]=requestSchemas.editorSelectTarget.parse(args);await this.select(opening,id,revision,AbortSignal.any([abort.signal,...(signal?[signal]:[])]));check();return true}
     if(method==='saveInSession'){check();const request=requestSchemas.saveInSession.parse(args)[0];if(opening?.source!=='conversation'||opening.sessionId!==request.contextSessionId||view.resumeId!==request.save.id)throw Error('Conversation save target differs from current view')}
     if(method==='editorInstalled'){check();signal?.throwIfAborted();const installed=requestSchemas.editorInstalled.parse(args)[0];if(installed.resumeId!==view.resumeId)throw Error('Installed document differs from current view');view.loaded=view.visible&&installed.revision!==undefined?{...installed,revision:installed.revision,sessionId:opening?.sessionId}:undefined;this.publishLoaded();return true}
     if(method==='editorRecoverView'){const id=requestSchemas.editorRecoverView.parse(args)[0];check();if(signal?.aborted)throw Error('Recovery cancelled');if(opening?.source==='conversation'||requestedDocument!==id)throw Error('Recovery document differs');if(!this.read(id)?.value)return false;launch={resumeId:id,source:'space'};view.close();recoveryDisconnect=face.connect(frame,assets,report);return true}
     if(method==='editorRegister')requestedDocument=requestSchemas.editorRegister.parse(args)[0].resumeId
     if(method==='editorAssistant'){if(!this.assistant)throw Error('Assistant entry is unavailable');const id=requestSchemas.editorAssistant.parse(args)[0];if(view.resumeId!==id)throw Error('Assistant source document differs');return this.assistant(id,opening?.sessionId,signal??abort.signal)}
     if(method==='editorNavigate'){abort.signal.throwIfAborted();if(!navigate)throw Error('Resource navigation is unavailable');navigate(requestSchemas.editorNavigate.parse(args)[0]);return true}
     const adoptsOwnership=method==='editorRegister'||method==='editorClaim'||method==='editorActivate'||method==='editorRollback'||method==='editorReconcile'
     const generation=adoptsOwnership||method==='editorDisconnect'?++ownershipGeneration:undefined
     if(generation!==undefined){view.loaded=undefined;this.publishLoaded()}
     const value=await this.dispatch(method,args,signal)
     if(generation===ownershipGeneration&&!abort.signal.aborted&&current===view&&this.views.has(view)){
      if(adoptsOwnership)view.resumeId=requestSchemas[method].parse(args)[0].resumeId
      if(method==='editorDisconnect'&&args[0]===view.resumeId&&args[2]===true)view.resumeId=undefined
     }
     return value
    }
    disconnect=connectFrame(frame,assets,this.locale(),'editor',execute,report,undefined,{launch:opening&&{...opening,checkpointId:handoff?.checkpointId},identity:target,onEditorReady:handle=>{
     view.handle=handle
     void (async()=>{
      await handle.bridge.call('editorVisibility',[view.visible],abort.signal)
      check()
      if(handoff){await completeEditorHandoff(handoff,handle,abort.signal);if(opening)await this.mounted?.(opening,handoff,abort.signal);persist(handoff.resumeId,undefined);consumed?.(handoff)}
     })().catch(error=>{if(!abort.signal.aborted&&current===view&&this.views.has(view))report(error instanceof Error?error.message:String(error))})
    }})
   }
   void run().catch(error=>{if(!abort.signal.aborted&&current===view&&this.views.has(view))report(error instanceof Error?error.message:String(error))})
   return()=>{view.close();recoveryDisconnect?.()}
  }}
  return face
 }
 /** Dispose bridges and waits; journaled recovery remains available after unload. */
 dispose():void{for(const view of this.views)view.close();this.views.clear()}
}

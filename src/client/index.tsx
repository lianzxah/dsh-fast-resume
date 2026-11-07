/** Harness client registration and capability dispatch for the isolated original editor. */
import React from 'react'
import {ResumeToolCard,type ReviewFace} from './resume-review-ui.tsx'
import type {} from '@deepseek-ai/dsh-client-ui-tool/client'
import {ResumeActions} from './resume-actions.ts'
import type {ISessions} from '@deepseek-ai/dsh-api-session-controller/client'
import {SessionHandoff,AssistantEntry,prepareAssistantSession,assistantWorkspace} from './session-handoff.ts'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import {ResumeActivityTracker,resumeActivityDefinition} from './resume-activity.ts'
import {EditorViews} from './editor-views.ts'
import {ResumeTab,ResumeHeader,AssistantMount,ResumeActivityMount,revealResume,revealResumeActivity} from './resume-tab.tsx'
import {parseResumeAddress,resumeAddress} from './resume-resource.ts'
import { FileText } from 'lucide-react'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-connection/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import type { SessionId, SessionRequestId } from '@deepseek-ai/dsh-api-remotes/client'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { TYPERT_REMOTE } from '../../lib/typert.remote-client.js'
import { EditorFrame, renderInFrame, type Dispatch } from './frame.tsx'
import { requestSchemas, recoverySchema, type Recovery } from '../protocol.ts'
import { ownRemoteLifetime } from './lifecycle.ts'
import { RendererWorker } from './renderer.ts'
import { RecoveryStore } from './recovery.ts'
import { en,zh } from './locales.tsx'
import type { TypertRemoteNamespaceMap } from '@deepseek-ai/dsh-typert-protocol'
import type { EditorAssets,RendererLease,RenderJob } from '../types.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' { interface LocaleNamespaceMap { fastResume:keyof typeof en } }
/** Required services; Session prompts use the ordinary logged Host API. */
export const inject=['slots','locale','remote','layout','uiWorkspace','sidebarRight','sidebarRightTabs','sessions','workspaces','uiConversation']
async function unwrap<T>(pending:Promise<{ok:true;value:T}|{ok:false;error:unknown}>):Promise<T>{const r=await pending;if(!r.ok)throw r.error;return r.value}
function Icon({size}:PropsRuntime<'sidebar.panellist'>){return <FileText size={size} aria-hidden="true"/>}
/** Mount generated remotes, editor slots and one renderer for the connected Client lifetime. */
async function startClient(ctx:Context):Promise<()=>Promise<void>>{
 let stage='register Client dictionary'
 let drain=async()=>{}
 try {
 const reviewLifetime=new AbortController()
 let stopped=false,worker:RendererWorker|undefined,restarting=Promise.resolve()
 let views:EditorViews|undefined,actions:ResumeActions|undefined
 const requests=new Set<Promise<unknown>>()
 let reset=()=>{},unload=()=>{}
 drain=async()=>{
  views?.dispose();stopped=true;reviewLifetime.abort();reset();window.removeEventListener('pagehide',unload)
  await actions?.dispose();await restarting;await worker?.dispose()
  await Promise.allSettled(requests)
 }
 stage='register Client dictionary'
 ctx.effect(()=>ctx.locale.register('fastResume',{en,zh}))
 stage='acquire mounted fastResume namespace'
 const api:TypertRemoteNamespaceMap['fastResume']=ctx.remote.fastResume
 actions=new ResumeActions((request,signal)=>unwrap(api.uiMutation(request,signal)),()=>ctx.sidebarRight.mounted.getSnapshot())
 let assetPromise:Promise<EditorAssets>|undefined
 const assets=()=>{
  if(stopped)return Promise.reject(Error('Editor connection closed'))
  const request=assetPromise??=(unwrap<EditorAssets>(api.editorAssets()).catch(error=>{assetPromise=undefined;throw error}))
  requests.add(request);void request.then(()=>requests.delete(request),()=>requests.delete(request));return request
 }
 const recoveryStorage=()=>new RecoveryStore(localStorage)
 const execute:Dispatch=async(method,args,signal)=>{
  if(stopped)throw Error('Editor connection closed')
  switch(method){
   case 'editorTransferRead':return unwrap(api.editorTransferRead(...requestSchemas.editorTransferRead.parse(args)))
   case 'editorRecover':return unwrap(api.editorRecover(...requestSchemas.editorRecover.parse(args)))
   case 'editorTransfer':return unwrap(api.editorTransfer(...requestSchemas.editorTransfer.parse(args)))
   case 'editorClaim':return unwrap(api.editorClaim(...requestSchemas.editorClaim.parse(args)))
   case 'editorActivate':return unwrap(api.editorActivate(...requestSchemas.editorActivate.parse(args)))
   case 'editorRollback':return unwrap(api.editorRollback(...requestSchemas.editorRollback.parse(args)))
   case 'editorRegister':return unwrap(api.editorRegister(...requestSchemas.editorRegister.parse(args)))
   case 'editorPoll':return unwrap(api.editorPoll(...requestSchemas.editorPoll.parse(args)))
   case 'editorAcknowledge':return unwrap(api.editorAcknowledge(...requestSchemas.editorAcknowledge.parse(args)))
   case 'editorReconcile':return unwrap(api.editorReconcile(...requestSchemas.editorReconcile.parse(args)))
   case 'editorDisconnect':return unwrap(api.editorDisconnect(...requestSchemas.editorDisconnect.parse(args)))
   case 'list':return unwrap(api.list())
   case 'create':return unwrap(api.create(...requestSchemas.create.parse(args)))
   case 'read':return unwrap(api.read(...requestSchemas.read.parse(args)))
   case 'saveInSession':return unwrap(api.saveInSession(...requestSchemas.saveInSession.parse(args)))
   case 'save':return unwrap(api.save(...requestSchemas.save.parse(args)))
   case 'rename':return unwrap(api.rename(...requestSchemas.rename.parse(args)))
   case 'duplicate':return unwrap(api.duplicate(...requestSchemas.duplicate.parse(args)))
   case 'deleteResume':return unwrap(api.deleteResume(...requestSchemas.deleteResume.parse(args)))
   case 'changeReceipt':return unwrap(api.changeReceipt(...requestSchemas.changeReceipt.parse(args)))
   case 'history':return unwrap(api.history(...requestSchemas.history.parse(args)))
   case 'versionRead':return unwrap(api.versionRead(...requestSchemas.versionRead.parse(args)))
   case 'applyProposal':return unwrap(api.applyProposal(...requestSchemas.applyProposal.parse(args)))
   case 'revert':return unwrap(api.revert(...requestSchemas.revert.parse(args)))
   case 'restore':return unwrap(api.restore(...requestSchemas.restore.parse(args)))
   case 'importDocument':return unwrap(api.importDocument(...requestSchemas.importDocument.parse(args)))
   case 'exportDocument':return unwrap(api.exportDocument(requestSchemas.exportDocument.parse(args)[0],signal))
   case 'recoveryRead':return recoveryStorage().list(requestSchemas.recoveryRead.parse(args)[0])
   case 'recoveryWrite':{const [r]=requestSchemas.recoveryWrite.parse(args);if(new TextEncoder().encode(r.documentJson).length>(await assets()).maxDocumentBytes)throw Error('Draft exceeds document limit');return recoveryStorage().write(r)}
   case 'recoveryRemove':{const [record,revision]=requestSchemas.recoveryRemove.parse(args);return recoveryStorage().remove(record,revision)}
   case 'sessionCreate':return unwrap<{sessionId:SessionId}>(ctx.remote.session.create({}))
   case 'prompt':{
    const [r]=requestSchemas.prompt.parse(args),session=r.sessionId as SessionId|undefined
    const sessionId=session??(await unwrap<{sessionId:SessionId}>(ctx.remote.session.create({}))).sessionId
    const content=`Resume id: ${r.id}\nCommitted revision: ${r.revision}\nSelected element ids: ${JSON.stringify(r.selectedIds)}\nUse resume_read to inspect the saved resume, then resume_propose for reviewable changes. Do not invent facts.\n\n${r.text}`
    await unwrap(ctx.remote.session.prompt({requestId:r.requestId as SessionRequestId,sessionId,mode:'queue',content:[{type:'text',text:content}],clientTimeZone:Intl.DateTimeFormat().resolvedOptions().timeZone}))
    return {sessionId}
   }
   case 'conversation':{const [id]=requestSchemas.conversation.parse(args);if(id)ctx.uiWorkspace.openSession(id as SessionId);else ctx.layout.selectPanel(null);return true}
   case 'editorFeedback':case 'editorSelectTarget':case 'editorInstalled':case 'editorRecoverView':case 'editorAssistant':case 'assistantStatus':case 'editorNavigate':case 'editorVisibility':case 'editorReady':case 'editorCapture':case 'editorLoad':case 'editorResume':
   case 'render':throw Error('Unavailable capability')
  }
 }
 const dispatch:Dispatch=(method,args,signal)=>{
  if(stopped)return Promise.reject(Error('Editor connection closed'))
  const request=execute(method,args,signal);requests.add(request)
  void request.then(()=>requests.delete(request),()=>requests.delete(request))
  return request
 }
 let journalStorage:Storage|undefined
 try{journalStorage=sessionStorage}catch(error){/* Frame bootstrap reports the existing ephemeral-owner limitation when tab storage is denied. */}
 // Client service injection stays independent of the Host program's Context.sessions declaration.
 const sessions:ISessions=ctx.get('sessions' as string,true)
 const sessionFlow=new SessionHandoff({workspace:signal=>assistantWorkspace(ctx.workspaces,sessions,signal),begin:request=>unwrap(api.beginAssistantHandoff(request)),read:request=>unwrap(api.readAssistantHandoff(request)),record:request=>unwrap(api.recordAssistantSession(request)),bind:request=>unwrap(api.bindAssistantContext(request)),create:async request=>({sessionId:await sessions.create(request)}),lookup:async id=>(await unwrap(ctx.remote.session.list({}))).items.some(item=>item.sessionId===id)})
 const openResume=(sessionId:SessionId,id:import('../types.ts').ResumeId,handoff?:import('./editor-handoff.ts').RetainedEditorHandoff)=>revealResume(ctx.sidebarRight,sessionId,id,handoff)
 // Published SidebarRight's interface breakpoint for automatic fullscreen.
 const wide=window.matchMedia('(min-width: 768px)')
 const feedback=new Map<string,{activity:import('./resume-activity.ts').ResumeActivity;valid:()=>boolean}>()
 const flushFeedback=()=>{for(const[key,item]of feedback){const a=item.activity;if(!item.valid()){feedback.delete(key);continue}if(!a.target||!a.receipt)continue;const sessionId=ctx.sidebarRight.mounted.getSnapshot();if(sessionId&&views?.loadedSnapshot().some(v=>v.sessionId===sessionId&&v.resumeId===a.target?.resumeId&&v.revision===a.target.revision)){feedback.delete(key);void views.feedback(sessionId,a.target.resumeId,a.target.revision,a.receipt.changedElementIds).catch(()=>{/* Loaded evidence can expire before the read-only outline arrives. */})}}}
 const tracker=new ResumeActivityTracker(()=>ctx.sidebarRight.mounted.getSnapshot(),()=>JSON.stringify([ctx.sidebarRight.isExpanded(),ctx.sidebarRight.active()?.id,ctx.sidebarRight.active()?.contentId]),(activity,valid)=>{
  const pending=revealResumeActivity(activity,()=>!stopped&&valid(),{sidebar:ctx.sidebarRight,wide:()=>wide.matches,resolve:sessionId=>unwrap(api.readContext({sessionId}))})
  requests.add(pending);void pending.then(()=>requests.delete(pending),()=>requests.delete(pending));return pending
 },undefined,(activity,valid)=>{feedback.set(activity.callId,{activity,valid});flushFeedback()})
 ctx.effect(()=>ctx.uiConversation.events.register(resumeActivityDefinition))
 ctx.effect(()=>ctx.on('connection/reset',()=>tracker.reset()))
 ctx.effect(()=>()=>tracker.reset())
 const entry=new AssistantEntry(sessionFlow,()=>{if(!views)throw Error('Editor views are unavailable');return views},journalStorage,id=>ctx.uiWorkspace.openSession(id),async(sessionId,signal)=>{
  const result=await unwrap(api.readContext({sessionId}));signal.throwIfAborted();if(result.state!=='bound')throw Error(ctx.locale.bind('fastResume')('unbound'));openResume(sessionId,result.context.resumeId)
 },(id,workspaceId,signal)=>prepareAssistantSession(sessions,ctx.workspaces,id,workspaceId,signal))
 views=new EditorViews(assets,dispatch,()=>ctx.locale.getSnapshot().active==='zh'?'zh':'en',journalStorage,()=>ctx.locale.bind('fastResume')('editorMoved'),(id,sessionId,signal)=>{if(stopped)throw Error('Editor connection closed');const pending=entry.open(id,sessionId,signal);requests.add(pending);void pending.then(()=>requests.delete(pending),()=>requests.delete(pending));return pending},(launch,handoff,signal)=>entry.ready(launch,handoff,signal),(launch,target,revision,signal)=>{if(!launch.sessionId)throw Error('Session unavailable');return reviewFace(launch.sessionId).select({id:target,revision},signal)})
 const editorViews=views,face=editorViews.face()
 ctx.effect(()=>editorViews.subscribeLoaded(flushFeedback))
 const reviewFaces=new Map<SessionId,ReviewFace>()
 const reviewFace=(sessionId:SessionId):ReviewFace=>{
  const existing=reviewFaces.get(sessionId);if(existing)return existing
  const owned=async<T,>(signal:AbortSignal,work:(signal:AbortSignal)=>Promise<T>):Promise<T>=>{
   const combined=AbortSignal.any([signal,reviewLifetime.signal]);combined.throwIfAborted();if(stopped)throw Error('Client closed')
   const pending=work(combined);requests.add(pending)
   try{const value=await pending;combined.throwIfAborted();if(stopped)throw Error('Client closed');return value}finally{requests.delete(pending)}
  }
  const selections=new Map<import('../types.ts').ResumeId,import('../types.ts').ResumeContextBindRequest>()
  const result:ReviewFace={reviewSession:sessionId,actions:actions!,views:editorViews,
   preview:(id,revision,documentJson,pageId,signal)=>owned(signal,async signal=>{const adapter=await assets();signal.throwIfAborted();const bytes=await renderInFrame(adapter,{id:crypto.randomUUID(),resumeId:id,revision,documentJson,format:'png',pixelRatio:.5,pageId,deadline:Date.now()+adapter.bridgeTimeoutMs},signal);return `data:image/png;base64,${bytes}`}),
   read:(id,signal)=>owned(signal,()=>unwrap(api.read(id))),history:(id,signal)=>owned(signal,()=>unwrap(api.history(id))),list:signal=>owned(signal,()=>unwrap(api.list())),context:signal=>owned(signal,()=>unwrap(api.readContext({sessionId}))),
   select:async(target,signal)=>{
    if(ctx.sidebarRight.mounted.getSnapshot()!==sessionId)throw Error('Session changed')
    const request=selections.get(target.id)??{sessionId,resumeId:target.id,expectedRevision:target.revision,requestId:crypto.randomUUID(),source:'editor-entry' as const};selections.set(target.id,request)
    try{await owned(signal,()=>unwrap(api.bindAssistantContext(request)));selections.delete(target.id)}catch(error){if(typeof error==='object'&&error&&'details'in error&&typeof error.details==='object'&&error.details&&'code'in error.details&&['conflict','not-found','invalid-input'].includes(String(error.details.code)))selections.delete(target.id);throw error}
    if(ctx.sidebarRight.mounted.getSnapshot()!==sessionId)throw Error('Session changed')
    const selected=await owned(signal,()=>unwrap(api.readContext({sessionId})));if(selected.state!=='bound'||selected.context.resumeId!==target.id)throw Error('A later target selection is current')
   },open:id=>{tracker.hide(sessionId);openResume(sessionId,id)}}
  reviewFaces.set(sessionId,result);return result
 }
 for(const key of ['resume_context','resume_list','resume_create','resume_read','resume_edit','resume_propose','resume_apply','resume_revert','resume_history','resume_restore','resume_export'])ctx.slots.inject('tool.call.toolview',()=>ctx.slots.register({name:'tool.call.toolview',key,locale:'fastResume',inject:(sessionId:SessionId)=>({review:reviewFace(sessionId)})},ResumeToolCard))
 ctx.effect(()=>ctx.sidebarRightTabs.register({id:'fast-resume.document',kind:'fast-resume.document',patterns:['dsh-resource://fast-resume/document/**'],canOpen:address=>parseResumeAddress(address)!==undefined,priority:'extension',keepMounted:true,title:()=>ctx.locale.bind('fastResume')('panel')}))
 ctx.slots.inject('sidebar.right.pane.tab',()=>ctx.slots.register({name:'sidebar.right.pane.tab',key:'fast-resume.document',locale:'fastResume',inject:(sessionId:SessionId)=>({review:reviewFace(sessionId),views:editorViews,hidden:(sessionId:SessionId)=>tracker.hide(sessionId),library:()=>ctx.layout.selectPanel('fast-resume' as MainPanelId)})},ResumeTab))
 ctx.slots.inject('conversation.session.header.actions',()=>ctx.slots.register({name:'conversation.session.header.actions',id:'fast-resume.open',locale:'fastResume',inject:(sessionId:SessionId)=>({review:reviewFace(sessionId),activity:tracker.statusSource(sessionId),viewFailure:tracker.failureSource(sessionId),views:editorViews,resolve:()=>unwrap(api.readContext({sessionId})),mounted:()=>ctx.sidebarRight.mounted.getSnapshot(),open:(id:import('../types.ts').ResumeId,handoff?:import('./editor-handoff.ts').RetainedEditorHandoff)=>{openResume(sessionId,id,handoff)},hooks:{sidebarMounted:ctx.sidebarRight.mounted}})},ResumeHeader))
 ctx.slots.inject('shell.overlay',()=>ctx.slots.register({name:'shell.overlay',id:'fast-resume.entry',inject:()=>({pending:entry.snapshot,subscribePending:entry.subscribe,mounted:ctx.sidebarRight.mounted,open:(pending:import('./session-handoff.ts').AssistantOpen)=>{openResume(pending.sessionId,pending.resumeId,pending.handoff)}})},AssistantMount))
 ctx.slots.inject('shell.overlay',()=>ctx.slots.register({name:'shell.overlay',id:'fast-resume.activity',inject:()=>({mounted:ctx.sidebarRight.mounted,sessions,conversation:ctx.uiConversation,tracker})},ResumeActivityMount))
 stage='register main editor slot'
 ctx.slots.inject('main',()=>ctx.slots.register({name:'main',key:'fast-resume' as MainPanelId,locale:'fastResume',inject:()=>face},EditorFrame))
 stage='register sidebar panel slot'
 ctx.slots.inject('sidebar.panellist',()=>ctx.slots.register({name:'sidebar.panellist',id:'fast-resume',locale:'fastResume',label:()=>ctx.locale.bind('fastResume')('panel')},Icon))
 stage='register renderer lifecycle'

  const restart=()=>{
   restarting=restarting.then(async()=>{
    await worker?.dispose();if(stopped)return
    const adapter=await assets()
    if(stopped)return
    worker=new RendererWorker({
     pollIntervalMs:adapter.rendererPollIntervalMs,
     register:()=>unwrap<RendererLease>(api.rendererRegister()),poll:id=>unwrap<RenderJob|null>(api.rendererPoll(id)),
     complete:r=>unwrap<boolean>(api.rendererComplete(r)),unregister:id=>unwrap<boolean>(api.rendererUnregister(id)),
     assets,render:renderInFrame,report:error=>console.error('Fast Resume renderer',error),
    });await worker.start()
   }).catch(error=>console.error('Fast Resume renderer unavailable',error))
  }
  restart()
  reset=ctx.on('connection/reset',restart)
  unload=()=>{views?.dispose();void worker?.dispose()};window.addEventListener('pagehide',unload)
 return drain
 }catch(error){await drain();console.error(`Fast Resume Client failed to ${stage}: ${error instanceof Error?error.message:String(error)}`);throw error}
}

/** Install the generated provider and explicitly injected consumers with ordered teardown.
 * @param ctx - Client plugin scope.
 * @returns Completion of namespace and UI activation.
 */
export async function apply(ctx:Context):Promise<void>{
 await ownRemoteLifetime(ctx,TYPERT_REMOTE,[...inject,'remote.fastResume','remote.session'],startClient)
}

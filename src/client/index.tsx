/** Harness client registration and capability dispatch for the isolated original editor. */
import React from 'react'
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
import { EditorFrame, connectFrame, renderInFrame, type Dispatch, type FrameFace } from './frame.tsx'
import { requestSchemas, recoverySchema, type Recovery } from '../protocol.ts'
import { ownRemoteLifetime } from './lifecycle.ts'
import { RendererWorker } from './renderer.ts'
import { RecoveryStore } from './recovery.ts'
import { en,zh } from './locales.tsx'
import type { TypertRemoteNamespaceMap } from '@deepseek-ai/dsh-typert-protocol'
import type { EditorAssets,RendererLease,RenderJob } from '../types.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' { interface LocaleNamespaceMap { fastResume:keyof typeof en } }
/** Required services; Session prompts use the ordinary logged Host API. */
export const inject=['slots','locale','remote','layout','uiWorkspace']
async function unwrap<T>(pending:Promise<{ok:true;value:T}|{ok:false;error:unknown}>):Promise<T>{const r=await pending;if(!r.ok)throw r.error;return r.value}
function Icon({size}:PropsRuntime<'sidebar.panellist'>){return <FileText size={size} aria-hidden="true"/>}
/** Mount generated remotes, editor slots and one renderer for the connected Client lifetime. */
async function startClient(ctx:Context):Promise<()=>Promise<void>>{
 let stage='register Client dictionary'
 let drain=async()=>{}
 try {
 let stopped=false,worker:RendererWorker|undefined,restarting=Promise.resolve()
 const frames=new Set<()=>void>(),requests=new Set<Promise<unknown>>()
 let reset=()=>{},unload=()=>{}
 drain=async()=>{
  stopped=true;reset();window.removeEventListener('pagehide',unload)
  for(const close of frames)close();frames.clear()
  await restarting;await worker?.dispose()
  await Promise.allSettled(requests)
 }
 stage='register Client dictionary'
 ctx.effect(()=>ctx.locale.register('fastResume',{en,zh}))
 stage='acquire mounted fastResume namespace'
 const api:TypertRemoteNamespaceMap['fastResume']=ctx.remote.fastResume
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
   case 'list':return unwrap(api.list())
   case 'create':return unwrap(api.create(...requestSchemas.create.parse(args)))
   case 'read':return unwrap(api.read(...requestSchemas.read.parse(args)))
   case 'save':return unwrap(api.save(...requestSchemas.save.parse(args)))
   case 'rename':return unwrap(api.rename(...requestSchemas.rename.parse(args)))
   case 'duplicate':return unwrap(api.duplicate(...requestSchemas.duplicate.parse(args)))
   case 'deleteResume':return unwrap(api.deleteResume(...requestSchemas.deleteResume.parse(args)))
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
   case 'render':throw Error('Unavailable capability')
  }
 }
 const dispatch:Dispatch=(method,args,signal)=>{
  if(stopped)return Promise.reject(Error('Editor connection closed'))
  const request=execute(method,args,signal);requests.add(request)
  void request.then(()=>requests.delete(request),()=>requests.delete(request))
  return request
 }
 const face:FrameFace={loadAssets:assets,connect:(frame,a,error)=>{
  if(stopped)throw Error('Editor connection closed')
  const disconnect=connectFrame(frame,a,ctx.locale.getSnapshot().active==='zh'?'zh':'en','editor',dispatch,error)
  const close=()=>{disconnect();frames.delete(close)};frames.add(close);return close
 }}
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
  unload=()=>{void worker?.dispose()};window.addEventListener('pagehide',unload)
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

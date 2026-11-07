/** Sandboxed frame ownership, nonce handshake, request validation and cancellation. */
import {brandString} from '@deepseek-ai/dsh-brand'
import type {EditorLaunch,EditorOwnerId,EditorIncarnationId} from '../types.ts'
import type {EditorIdentity,EditorReadyHandle} from './editor-handoff.ts'
import React, { useEffect, useRef, useState } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { PortBridge } from '../editor/bridge.ts'
import { requestSchemas, ownershipSchema, type Bootstrap, type Method } from '../protocol.ts'
import type { EditorAssets, RenderJob } from '../types.ts'

export type Dispatch = (method:Method,args:unknown[],signal?:AbortSignal)=>Promise<unknown>
export interface FrameFace { loadAssets:()=>Promise<EditorAssets>; connect:(frame:HTMLIFrameElement,assets:EditorAssets,onError:(message:string)=>void)=>()=>void }
export type EditorSurfaceProps=PropsLocale<'fastResume'>&InjectFace<FrameFace>
export type FrameProps=PropsRuntime<'main'>&EditorSurfaceProps
/** Main slot retains its complete runtime props. */
export function EditorFrame(props:FrameProps){return <EditorSurface {...props}/>}
/** Main-slot view; only the lifecycle callbacks cross from the apply closure. */
export function EditorSurface({loadAssets,connect,t}:EditorSurfaceProps){
 const ref=useRef<HTMLIFrameElement>(null),[error,setError]=useState(''),[attempt,setAttempt]=useState(0),[loading,setLoading]=useState(true)
 useEffect(()=>{setLoading(true);let disposed=false;let cleanup:(()=>void)|undefined;void loadAssets().then(assets=>{if(!disposed&&ref.current)cleanup=connect(ref.current,assets,setError)}).catch(e=>{if(!disposed)setError(e instanceof Error?e.message:String(e))});return()=>{disposed=true;cleanup?.()}},[loadAssets,connect,attempt])
 return <div style={{height:'100%',width:'100%',position:'relative'}}><iframe ref={ref} onLoad={()=>{if(ref.current?.srcdoc)setLoading(false)}} title={t('panel')} sandbox="allow-scripts allow-downloads allow-forms" style={{border:0,width:'100%',height:'100%',display:'block'}}/>{loading&&!error&&<div role="status" style={{position:'absolute',inset:0,display:'grid',placeItems:'center',fontSize:12,color:'var(--dsh-color-text,inherit)'}}>{t('opening')}</div>}{error&&<div role="alert" style={{position:'absolute',inset:0,background:'var(--dsh-color-surface,white)',color:'var(--dsh-color-text,#222)',padding:24}}><p>{t('connectionError')}</p><button onClick={()=>{setError('');setAttempt(n=>n+1)}}>{t('retry')}</button></div>}</div>
}
/** Attach exactly one owned document and port; cleanup rejects outstanding renderer requests. */
export function connectFrame(frame:HTMLIFrameElement,assets:EditorAssets,locale:'zh'|'en',mode:'editor'|'renderer',dispatch:Dispatch,onError:(message:string)=>void,onReady?:(bridge:PortBridge)=>void,options?:{launch?:EditorLaunch;identity?:EditorIdentity;onEditorReady?:(handle:EditorReadyHandle)=>void}):()=>void {
 const nonce=options?.identity?.incarnationId??crypto.randomUUID(),ownerKey='fast-resume:editor-owner:v1'
 let recoveryOwnerId:string=nonce,recoveryOwnerPersistent=true
 if(mode==='editor'){try{recoveryOwnerId=sessionStorage.getItem(ownerKey)??crypto.randomUUID();sessionStorage.setItem(ownerKey,recoveryOwnerId)}catch(error){recoveryOwnerId=nonce;recoveryOwnerPersistent=false}}
 if(options?.identity)recoveryOwnerId=options.identity.ownerId
 const bootstrap:Bootstrap={launch:options?.launch,maxAssistantCheckpointBytes:assets.maxAssistantCheckpointBytes,wheelZoomDirection:assets.wheelZoomDirection,nonce,recoveryOwnerId,recoveryOwnerPersistent,mode,locale,autosaveDelayMs:assets.autosaveDelayMs,maxImportBytes:assets.maxImportBytes,maxDocumentBytes:assets.maxDocumentBytes,frameConnectTimeoutMs:assets.frameConnectTimeoutMs,bridgeTimeoutMs:assets.bridgeTimeoutMs,rendererPollIntervalMs:assets.rendererPollIntervalMs,refreshIntervalMs:assets.refreshIntervalMs,editorPollIntervalMs:assets.editorPollIntervalMs}
 let active=true,port:MessagePort|undefined,bridge:PortBridge|undefined,claimed=false
 const owned=new Map<string,import('../types.ts').EditorToken>()
 const disconnectOwners=()=>{for(const [id,token] of owned)void dispatch('editorDisconnect',[id,token,true]).catch(error=>{/* Persisted lease expiry keeps uncertainty when transport is unavailable. */});owned.clear()}
 const timer=setTimeout(()=>{if(!claimed&&active)onError('Editor did not connect. Reload the panel.')},assets.frameConnectTimeoutMs)
 const listener=(event:MessageEvent)=>{
  if(!active||claimed||event.source!==frame.contentWindow||typeof event.data!=='object'||event.data?.kind!=='fast-resume-ready'||event.data?.nonce!==nonce)return
  claimed=true;clearTimeout(timer);window.removeEventListener('message',listener)
  const channel=new MessageChannel();port=channel.port1
  if(mode==='renderer'){bridge=new PortBridge(port,assets.bridgeTimeoutMs);onReady?.(bridge)}
  else {
   bridge=new PortBridge(port,assets.bridgeTimeoutMs,{generation:nonce,role:'parent',failed:onError,handle:async(method,args,signal)=>{
    if(method==='editorRegister'){const [r]=requestSchemas.editorRegister.parse(args);if(r.ownerId!==recoveryOwnerId||r.incarnationId!==nonce)throw Error('Invalid editor identity')}
    if(method==='editorTransfer'){const [r]=requestSchemas.editorTransfer.parse(args);if(r.sourceIncarnationId!==nonce)throw Error('Invalid transfer source')}
    if(method==='editorClaim'||method==='editorActivate'){const [r]=requestSchemas[method].parse(args);if(r.incarnationId!==nonce)throw Error('Invalid transfer target')}
    if(method==='editorRollback'){const [r]=requestSchemas.editorRollback.parse(args);if(r.sourceIncarnationId!==nonce)throw Error('Invalid rollback source')}
    const value=await dispatch(method,args,signal)
    if(method==='editorRegister'||method==='editorClaim'||method==='editorActivate'||method==='editorRollback'){
     const [r]=requestSchemas[method].parse(args),ownership=ownershipSchema.parse(value);owned.set(r.resumeId,ownership.token);if(!active)disconnectOwners()
    }
    return value
   }})
   options?.onEditorReady?.({bridge,ownerId:brandString<EditorOwnerId>(recoveryOwnerId),incarnationId:brandString<EditorIncarnationId>(nonce)})
  }
  frame.contentWindow?.postMessage({kind:'fast-resume-connect',nonce},'*',[channel.port2])
 }
 window.addEventListener('message',listener)
 frame.srcdoc=assets.html.replace('"__FAST_RESUME_BOOTSTRAP__"',JSON.stringify(bootstrap).replace(/</g,'\\u003c'))
 return ()=>{active=false;disconnectOwners();clearTimeout(timer);window.removeEventListener('message',listener);bridge?.close();port?.close();frame.srcdoc=''}
}
/** A renderer frame holds the immutable job document and is destroyed on any settlement. */
export async function renderInFrame(assets:EditorAssets,job:RenderJob,signal:AbortSignal):Promise<string>{
 requestSchemas.render.parse([job])
 const frame=document.createElement('iframe');frame.setAttribute('sandbox','allow-scripts');frame.title='Resume renderer';frame.style.cssText='position:fixed;left:-100000px;top:0;width:1024px;height:768px;visibility:hidden';document.body.append(frame)
 let dispose=()=>{}
 try{return await new Promise<string>((resolve,reject)=>{
  const timeout=setTimeout(()=>reject(Error('Render deadline exceeded')),Math.max(1,job.deadline-Date.now()))
  const abort=()=>reject(Error('Render cancelled'));signal.addEventListener('abort',abort,{once:true})
  if(signal.aborted){clearTimeout(timeout);signal.removeEventListener('abort',abort);reject(Error('Render cancelled'));return}
  dispose=connectFrame(frame,assets,'en','renderer',async()=>{throw Error('Unavailable capability')},message=>reject(Error(message)),bridge=>{void bridge.call('render',[job]).then(value=>typeof value==='string'?resolve(value):reject(Error('Invalid render response')),reject).finally(()=>{clearTimeout(timeout);signal.removeEventListener('abort',abort)})})
  const original=dispose;dispose=()=>{clearTimeout(timeout);signal.removeEventListener('abort',abort);original()}
 })}finally{dispose();frame.remove()}
}

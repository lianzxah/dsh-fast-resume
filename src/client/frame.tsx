/** Sandboxed frame ownership, nonce handshake, request validation and cancellation. */
import React, { useEffect, useRef, useState } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { PortBridge } from '../editor/bridge.ts'
import { parseRequest, requestSchemas, type Bootstrap, type Method } from '../protocol.ts'
import type { EditorAssets, RenderJob } from '../types.ts'

export type Dispatch = (method:Method,args:unknown[],signal?:AbortSignal)=>Promise<unknown>
export interface FrameFace { loadAssets:()=>Promise<EditorAssets>; connect:(frame:HTMLIFrameElement,assets:EditorAssets,onError:(message:string)=>void)=>()=>void }
export type FrameProps=PropsRuntime<'main'>&PropsLocale<'fastResume'>&InjectFace<FrameFace>
/** Main-slot view; only the lifecycle callbacks cross from the apply closure. */
export function EditorFrame({loadAssets,connect,t}:FrameProps){
 const ref=useRef<HTMLIFrameElement>(null),[error,setError]=useState(''),[attempt,setAttempt]=useState(0)
 useEffect(()=>{let disposed=false;let cleanup:(()=>void)|undefined;void loadAssets().then(assets=>{if(!disposed&&ref.current)cleanup=connect(ref.current,assets,setError)}).catch(e=>{if(!disposed)setError(e instanceof Error?e.message:String(e))});return()=>{disposed=true;cleanup?.()}},[loadAssets,connect,attempt])
 return <div style={{height:'100%',width:'100%',position:'relative'}}><iframe ref={ref} title={t('panel')} sandbox="allow-scripts allow-downloads allow-forms" style={{border:0,width:'100%',height:'100%',display:'block'}}/>{error&&<div role="alert" style={{position:'absolute',inset:0,background:'var(--dsh-color-surface,white)',color:'var(--dsh-color-text,#222)',padding:24}}><p>{t('connectionError')}</p><p>{error}</p><button onClick={()=>{setError('');setAttempt(n=>n+1)}}>{t('retry')}</button></div>}</div>
}
/** Attach exactly one owned document and port; cleanup rejects outstanding renderer requests. */
export function connectFrame(frame:HTMLIFrameElement,assets:EditorAssets,locale:'zh'|'en',mode:'editor'|'renderer',dispatch:Dispatch,onError:(message:string)=>void,onReady?:(bridge:PortBridge)=>void):()=>void {
 const nonce=crypto.randomUUID(),ownerKey='fast-resume:editor-owner:v1'
 let recoveryOwnerId:string=nonce,recoveryOwnerPersistent=true
 if(mode==='editor'){try{recoveryOwnerId=sessionStorage.getItem(ownerKey)??crypto.randomUUID();sessionStorage.setItem(ownerKey,recoveryOwnerId)}catch(error){recoveryOwnerId=nonce;recoveryOwnerPersistent=false}}
 const bootstrap:Bootstrap={nonce,recoveryOwnerId,recoveryOwnerPersistent,mode,locale,autosaveDelayMs:assets.autosaveDelayMs,maxImportBytes:assets.maxImportBytes,maxDocumentBytes:assets.maxDocumentBytes,frameConnectTimeoutMs:assets.frameConnectTimeoutMs,bridgeTimeoutMs:assets.bridgeTimeoutMs,rendererPollIntervalMs:assets.rendererPollIntervalMs,refreshIntervalMs:assets.refreshIntervalMs}
 let active=true,port:MessagePort|undefined,bridge:PortBridge|undefined,claimed=false
 const controllers=new Set<AbortController>()
 const timer=setTimeout(()=>{if(!claimed&&active)onError('Editor did not connect. Reload the panel.')},assets.frameConnectTimeoutMs)
 const listener=(event:MessageEvent)=>{
  if(!active||claimed||event.source!==frame.contentWindow||typeof event.data!=='object'||event.data?.kind!=='fast-resume-ready'||event.data?.nonce!==nonce)return
  claimed=true;clearTimeout(timer);window.removeEventListener('message',listener)
  const channel=new MessageChannel();port=channel.port1
  if(mode==='renderer'){bridge=new PortBridge(port,assets.bridgeTimeoutMs);onReady?.(bridge)}
  else {
   port.onmessage=event=>{
    let request:ReturnType<typeof parseRequest>
    try{request=parseRequest(event.data)}catch(error){active=false;for(const controller of controllers)controller.abort();onError('Invalid editor request. Reload the panel.');port?.close();return}
    if(request.method==='render'){port?.postMessage({kind:'response',id:request.id,ok:false,error:{message:'Unavailable capability'}});return}
    const controller=new AbortController();controllers.add(controller)
    void dispatch(request.method,request.args,controller.signal).then(value=>{if(active)port?.postMessage({kind:'response',id:request.id,ok:true,value})},error=>{if(!active)return;const e=error as {message?:string;code?:string;details?:{code?:string;currentRevision?:number};currentRevision?:number};port?.postMessage({kind:'response',id:request.id,ok:false,error:{message:e.message??'Operation failed',code:e.details?.code??e.code,currentRevision:e.details?.currentRevision??e.currentRevision}})}).finally(()=>controllers.delete(controller))
   };port.onmessageerror=()=>{active=false;for(const controller of controllers)controller.abort();onError('Editor communication failed. Reload the panel.');port?.close()};port.start()
  }
  frame.contentWindow?.postMessage({kind:'fast-resume-connect',nonce},'*',[channel.port2])
 }
 window.addEventListener('message',listener)
 frame.srcdoc=assets.html.replace('"__FAST_RESUME_BOOTSTRAP__"',JSON.stringify(bootstrap).replace(/</g,'\\u003c'))
 return ()=>{active=false;clearTimeout(timer);window.removeEventListener('message',listener);bridge?.close();port?.close();for(const c of controllers)c.abort();frame.srcdoc=''}
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

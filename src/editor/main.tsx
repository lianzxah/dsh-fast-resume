/** One-time parent-window handshake followed by a dedicated validated MessagePort. */
import React from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app.tsx'
import { createEditorApi } from './api.ts'
import { PortBridge } from './bridge.ts'
import { bootstrapSchema,parseRequest,requestSchemas } from '../protocol.ts'
import { renderJob } from './render.ts'

declare global { interface Window { __FAST_RESUME_BOOTSTRAP__:unknown } }
const config=bootstrapSchema.parse(window.__FAST_RESUME_BOOTSTRAP__)
let connected=false,bridge:PortBridge|undefined,port:MessagePort|undefined
const root=createRoot(document.getElementById('root')!)
const listener=(event:MessageEvent)=>{
 if(connected||event.source!==parent||event.data?.kind!=='fast-resume-connect'||event.data?.nonce!==config.nonce||event.ports.length!==1)return
 connected=true;window.removeEventListener('message',listener);port=event.ports[0]
 if(config.mode==='editor'){
  bridge=new PortBridge(port,config.bridgeTimeoutMs);root.render(<App api={createEditorApi(bridge,config)}/>)
 }else {
  let active=false
  port.onmessage=async event=>{
   let request:ReturnType<typeof parseRequest>
   try{request=parseRequest(event.data);if(request.method!=='render'||active)throw Error('Invalid render request')}catch(error){port?.close();return}
   active=true
   try{const [job]=requestSchemas.render.parse(request.args);const value=await renderJob(job);port?.postMessage({kind:'response',id:request.id,ok:true,value})}
   catch(error){port?.postMessage({kind:'response',id:request.id,ok:false,error:{message:error instanceof Error?error.message:'Render failed'}})}
  };port.start()
 }
}
window.addEventListener('message',listener)
parent.postMessage({kind:'fast-resume-ready',nonce:config.nonce},'*')
window.addEventListener('pagehide',()=>{window.removeEventListener('message',listener);root.unmount();bridge?.close();port?.close()},{once:true})

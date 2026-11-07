/** Owns bounded bidirectional requests, generation validation, cancellation and teardown. */
import {parseRequest,requestSchemas,responseSchema,type Arguments,type Method} from '../protocol.ts'
export type BridgeHandler=(method:Method,args:unknown[],signal:AbortSignal)=>Promise<unknown>
type Role='parent'|'editor'
interface Duplex {generation:string;role:Role;handle:BridgeHandler;failed?:(message:string)=>void}
export class PortBridge {
 private pending=new Map<string,{resolve:(v:unknown)=>void;reject:(e:Error)=>void;cleanup:()=>void}>()
 private running=new Map<string,AbortController>()
 private closed=false
 private post(value:Record<string,unknown>){this.port.postMessage({...value,...(this.duplex?{generation:this.duplex.generation,role:this.duplex.role}:{})})}
 private receive=(event:Event)=>{
  if(!('data' in event)||!event.data||typeof event.data!=='object'){this.failure('Invalid frame response');return}
  const data=event.data as Record<string,unknown>
  if(this.duplex&&(data.generation!==this.duplex.generation||data.role===(this.duplex.role)||(data.role!=='parent'&&data.role!=='editor'))){this.failure('Stale editor generation');return}
  if(data.kind==='cancel'&&this.duplex){if(typeof data.id!=='string'){this.failure('Invalid cancellation');return}this.running.get(data.id)?.abort();return}
  if(data.kind==='request'&&this.duplex){
   let request:ReturnType<typeof parseRequest>
   try{request=parseRequest(data);const editorMethods=['editorFeedback','assistantStatus','editorVisibility','editorReady','editorCapture','editorLoad','editorResume'];if((this.duplex.role==='editor')!==editorMethods.includes(request.method)||request.method==='render'||request.method==='editorRecover'||request.method==='editorTransferRead'||this.running.has(request.id))throw Error('Unavailable editor capability')}catch(error){this.failure('Invalid editor request');return}
   const controller=new AbortController();this.running.set(request.id,controller)
   void this.duplex.handle(request.method,request.args,controller.signal).then(value=>{if(!this.closed&&!controller.signal.aborted)this.post({kind:'response',id:request.id,ok:true,value})},error=>{if(!this.closed&&!controller.signal.aborted){const e=error as {message?:string;code?:string;currentRevision?:number;details?:{code?:string;currentRevision?:number}};this.post({kind:'response',id:request.id,ok:false,error:{message:e.message??'Operation failed',code:e.details?.code??e.code,currentRevision:e.details?.currentRevision??e.currentRevision}})}}).finally(()=>this.running.delete(request.id));return
  }
  const parsed=responseSchema.safeParse(data);if(!parsed.success){this.failure('Invalid frame response');return}const r=parsed.data,p=this.pending.get(r.id);if(!p)return;this.pending.delete(r.id);p.cleanup();r.ok?p.resolve(r.value):p.reject(Object.assign(Error(r.error.message),r.error))
 }
 private failure(message:string){this.close(message);this.duplex?.failed?.(message)}
 private invalid=()=>this.failure('Frame communication failed')
 constructor(private port:Pick<MessagePort,'addEventListener'|'removeEventListener'|'start'|'close'>&{postMessage:(value:unknown)=>void},private timeoutMs:number,private duplex?:Duplex){port.addEventListener('message',this.receive);port.addEventListener('messageerror',this.invalid);port.start()}
 /** Send a validated request. Aborted or timed-out work retains an unknown remote outcome.
  * @param method Role-specific capability.
  * @param args Validated method arguments.
  * @param signal Caller-owned cancellation.
  * @returns Matching response for this generation only.
  */
 call<K extends Method>(method:K,args:Arguments<K>,signal?:AbortSignal):Promise<unknown>{
  if(this.closed||signal?.aborted)return Promise.reject(Error('Editor connection closed or cancelled'))
  const checked=requestSchemas[method].parse(args),id=crypto.randomUUID()
  return new Promise((resolve,reject)=>{
   const fail=(message:string)=>{if(!this.pending.delete(id))return;cleanup();if(this.duplex)this.post({kind:'cancel',id});reject(Error(message))}
   const abort=()=>fail('Editor operation cancelled; check ownership before retrying')
   const timer=setTimeout(()=>fail('Operation timed out. Check the saved document before retrying.'),this.timeoutMs)
   const cleanup=()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort)}
   this.pending.set(id,{resolve,reject,cleanup});signal?.addEventListener('abort',abort,{once:true})
   try{this.post({kind:'request',id,method,args:checked})}catch(error){fail('Editor request could not be sent')}
  })
 }
 /** Reject waits and abort owned requests before closing the port. */
 close(message='Editor closed'):void{if(this.closed)return;this.closed=true;for(const p of this.pending.values()){p.cleanup();p.reject(Error(message))}this.pending.clear();for(const controller of this.running.values())controller.abort();this.running.clear();this.port.removeEventListener('message',this.receive);this.port.removeEventListener('messageerror',this.invalid);this.port.close()}
}

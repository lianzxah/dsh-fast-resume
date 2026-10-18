/** Owns a single port, bounded request waits, response matching and teardown. */
import { requestSchemas, responseSchema, type Arguments, type Method } from '../protocol.ts'
export class PortBridge {
 private pending=new Map<string,{resolve:(v:unknown)=>void;reject:(e:Error)=>void;timer:ReturnType<typeof setTimeout>}>()
 private closed=false
 private receive=(event:Event)=>{if(!('data' in event)){this.close('Invalid frame response');return}const parsed=responseSchema.safeParse(event.data);if(!parsed.success){this.close('Invalid frame response');return}const r=parsed.data;const p=this.pending.get(r.id);if(!p)return;this.pending.delete(r.id);clearTimeout(p.timer);r.ok?p.resolve(r.value):p.reject(Object.assign(Error(r.error.message),r.error))}
 private invalid=()=>this.close('Frame communication failed')
 constructor(private port:Pick<MessagePort,'addEventListener'|'removeEventListener'|'start'|'close'>&{postMessage:(value:unknown)=>void},private timeoutMs:number){port.addEventListener('message',this.receive);port.addEventListener('messageerror',this.invalid);port.start()}

 call<K extends Method>(method:K,args:Arguments<K>):Promise<unknown>{
  if(this.closed)return Promise.reject(Error('Editor connection closed'))
  const checked=requestSchemas[method].parse(args),id=crypto.randomUUID()
  return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{this.pending.delete(id);reject(Error('Operation timed out. Check the saved document before retrying.'))},this.timeoutMs);this.pending.set(id,{resolve,reject,timer});this.port.postMessage({kind:'request',id,method,args:checked})})
 }
 close(message='Editor closed'):void{if(this.closed)return;this.closed=true;for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(Error(message))}this.pending.clear();this.port.removeEventListener('message',this.receive);this.port.removeEventListener('messageerror',this.invalid);this.port.close()}
}

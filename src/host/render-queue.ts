/** Bounded leases and exact-revision export jobs for connected authenticated Clients. */
import { randomUUID } from 'node:crypto'
import type { RendererLease, RenderJob, RenderCompletion } from '../types.ts'
import { validateRenderedBinary } from './render-validation.ts'
import type { RenderedBinary } from './render-validation.ts'
import { ResumeError } from './errors.ts'
/** Renderer deployment limits supplied by the resolved Host configuration. */
export interface RenderQueueConfig {timeoutMs:number;leaseMs:number;maxRequests:number;maxBytes:number;maxPixels:number}
interface Pending {job:RenderJob;rendererId:string;timer:ReturnType<typeof setTimeout>;settle:(bytes:RenderedBinary|ResumeError)=>void;claimed:boolean}
/** Owns render requests until completion, cancellation, timeout, disconnect, or disposal. */
export class RenderQueue {
  private readonly renderers=new Map<string,{until:number;timer:ReturnType<typeof setTimeout>}>()
  private readonly pending=new Map<string,Pending>()
  private disposed=false
  constructor(private readonly config:RenderQueueConfig){}
  /** Register a connection lease; random ids also serve as private possession tokens.
   * @returns Renewable renderer identity.
   */
  register():RendererLease {if(this.disposed)throw new ResumeError('disposed','Renderer service has stopped');const rendererId=randomUUID();this.touch(rendererId);return{rendererId,leaseMs:this.config.leaseMs}}
  private touch(id:string):void {const old=this.renderers.get(id);if(old)clearTimeout(old.timer);const timer=setTimeout(()=>this.unregister(id),this.config.leaseMs);timer.unref();this.renderers.set(id,{until:Date.now()+this.config.leaseMs,timer})}
  private require(id:string):void {const lease=this.renderers.get(id);if(!lease||lease.until<=Date.now())throw new ResumeError('render-cancelled','Renderer lease expired');this.touch(id)}
  /** Release a renderer and fail every exact-revision request it owns.
   * @param rendererId Lease identity.
   */
  unregister(rendererId:string):void {const renderer=this.renderers.get(rendererId);if(renderer)clearTimeout(renderer.timer);this.renderers.delete(rendererId);for(const pending of [...this.pending.values()])if(pending.rendererId===rendererId)pending.settle(new ResumeError('render-cancelled','Renderer disconnected'))}
  /** Renew a connection and claim at most one pending job exactly once.
   * @param rendererId Lease identity.
   * @returns A detached job or null while idle.
   */
  poll(rendererId:string):RenderJob|null {this.require(rendererId);for(const pending of this.pending.values()){if(pending.rendererId===rendererId&&!pending.claimed){pending.claimed=true;return structuredClone(pending.job)}}return null}
  /** Report actual bytes or a renderer failure; late or foreign completions fail.
   * @param completion Renderer possession token and response.
   * @returns True when the pending job was settled.
   */
  async complete(completion:RenderCompletion):Promise<boolean> {
    this.require(completion.rendererId)
    const pending=this.pending.get(completion.jobId)
    if(!pending||pending.rendererId!==completion.rendererId||!pending.claimed)throw new ResumeError('render-cancelled','Render job is no longer assigned to this renderer')
    if(completion.error){pending.settle(new ResumeError('render-cancelled',completion.error));return true}
    const encoded=completion.dataBase64
    if(!encoded||encoded.length>Math.ceil(this.config.maxBytes/3)*4||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)){pending.settle(new ResumeError('invalid-input','Invalid or oversized renderer bytes'));return true}
    const bytes=Buffer.from(encoded,'base64')
    if(bytes.length>this.config.maxBytes){pending.settle(new ResumeError('invalid-input','Renderer bytes exceed the configured byte limit'));return true}
    try{
      const decoded=await validateRenderedBinary(bytes,pending.job,this.config.maxBytes,this.config.maxPixels)
      if(this.pending.get(pending.job.id)!==pending)throw new ResumeError('render-cancelled','Render job ended while its bytes were being decoded')
      pending.settle(decoded)
    }catch(error){if(this.pending.get(pending.job.id)!==pending)throw error;pending.settle(error instanceof ResumeError?error:new ResumeError('invalid-input',String(error)))}
    return true
  }
  /** Render one immutable committed document, respecting caller cancellation.
   * @param input Exact document and format.
   * @param signal Optional requesting tool/transport cancellation.
   * @returns Verified bytes; no artifact receipt exists yet.
   */
  request(input:Omit<RenderJob,'id'|'deadline'>,signal?:AbortSignal):Promise<RenderedBinary> {
    if(this.disposed)return Promise.reject(new ResumeError('disposed','Renderer service has stopped'))
    if(signal?.aborted)return Promise.reject(new ResumeError('render-cancelled','Export cancelled'))
    for(const [id,lease] of this.renderers)if(lease.until<=Date.now())this.unregister(id)
    const rendererId=this.renderers.keys().next().value
    if(rendererId===undefined)return Promise.reject(new ResumeError('renderer-unavailable','Open a connected Harness Web or Desktop client to export PDF/PNG'))
    if(this.pending.size>=this.config.maxRequests)return Promise.reject(new ResumeError('queue-full','Renderer queue is full'))
    const job:RenderJob={...input,id:randomUUID(),deadline:Date.now()+this.config.timeoutMs}
    return new Promise((resolve,reject)=>{
      const cancel=()=>settle(new ResumeError('render-cancelled','Export cancelled'))
      const settle=(result:RenderedBinary|ResumeError)=>{const pending=this.pending.get(job.id);if(!pending)return;clearTimeout(pending.timer);signal?.removeEventListener('abort',cancel);this.pending.delete(job.id);result instanceof ResumeError?reject(result):resolve(result)}
      const timer=setTimeout(()=>settle(new ResumeError('render-timeout','Connected renderer did not finish before the deadline')),this.config.timeoutMs)
      this.pending.set(job.id,{job,rendererId,timer,settle,claimed:false});signal?.addEventListener('abort',cancel,{once:true})
    })
  }
  /** Stop admission, invalidate leases, and reject all outstanding work. */
  dispose():void {this.disposed=true;for(const id of [...this.renderers.keys()])this.unregister(id)}
}

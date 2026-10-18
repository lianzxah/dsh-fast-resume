/** Lease renewal, serial immutable rendering and asynchronous teardown for one Client. */
import {remoteErrorOf} from '@deepseek-ai/dsh-typert-protocol'
import type { EditorAssets,RendererLease,RenderJob,RenderCompletion } from '../types.ts'
export interface RendererCalls {
 register:()=>Promise<RendererLease>
 poll:(id:string)=>Promise<RenderJob|null>
 complete:(r:RenderCompletion)=>Promise<boolean>
 unregister:(id:string)=>Promise<boolean>
 assets:()=>Promise<EditorAssets>
 render:(assets:EditorAssets,job:RenderJob,signal:AbortSignal)=>Promise<string>
 report:(error:unknown)=>void
 pollIntervalMs:number
}
function expiredLease(error:unknown):boolean {
 const failure=remoteErrorOf(error)
 return failure?.code==='FAST_RESUME_ERROR'&&typeof failure.details==='object'&&failure.details!==null&&'code' in failure.details&&failure.details.code==='render-cancelled'
}
/** Poll cancellation invalidates the lease. Retired work drains before registration retries at the configured cadence. */
export class RendererWorker {
 private stopped=false
 private started=false
 private lease:RendererLease|null=null
 private timer:ReturnType<typeof setInterval>|undefined
 private rendering=Promise.resolve()
 private pendingPoll:Promise<void>|null=null
 private abort=new AbortController()
 private starting:Promise<void>|null=null
 private disposing:Promise<void>|null=null
 constructor(private calls:RendererCalls){}
 start():Promise<void>{
  if(this.started||this.stopped)return this.starting??Promise.resolve()
  this.started=true;this.timer=setInterval(()=>{void this.poll()},this.calls.pollIntervalMs)
  this.starting=this.poll().finally(()=>{this.starting=null});return this.starting
 }
 private poll():Promise<void>{
  if(this.stopped||this.pendingPoll)return this.pendingPoll??Promise.resolve()
  this.pendingPoll=(async()=>{
   if(!this.lease){
    const registered=await this.calls.register()
    if(this.stopped){await this.calls.unregister(registered.rendererId);return}
    this.lease=registered
   }
   const lease=this.lease,signal=this.abort.signal
   let job:RenderJob|null
   try{job=await this.calls.poll(lease.rendererId)}catch(error){
    if(!this.stopped&&expiredLease(error)){
     this.lease=null;this.abort.abort()
     await this.rendering
     await this.calls.unregister(lease.rendererId).catch(cleanupError=>this.calls.report(cleanupError))
     if(!this.stopped)this.abort=new AbortController()
    }
    throw error
   }
   if(!job||this.stopped)return
   const claimed=job,owned=()=>!this.stopped&&this.lease===lease&&!signal.aborted
   this.rendering=this.rendering.then(async()=>{
    if(!owned())return
    try{
     const assets=await this.calls.assets()
     if(!owned())return
     const dataBase64=await this.calls.render(assets,claimed,signal)
     if(owned()){const accepted=await this.calls.complete({rendererId:lease.rendererId,jobId:claimed.id,dataBase64});if(!accepted)throw Error('Host rejected the rendered artifact')}
    }catch(error){if(owned()){this.calls.report(error);await this.calls.complete({rendererId:lease.rendererId,jobId:claimed.id,error:error instanceof Error?error.message:String(error)})}}
   }).catch(error=>this.calls.report(error))
  })().catch(error=>{if(!this.stopped)this.calls.report(error)}).finally(()=>{this.pendingPoll=null})
  return this.pendingPoll
 }
 /** Abort frames, stop renewals, drain registration/polls, then release the owned token and rendering work. */
 dispose():Promise<void>{return this.disposing??=this.close()}
 private async close():Promise<void>{
  this.stopped=true;this.abort.abort();if(this.timer)clearInterval(this.timer)
  await this.starting
  await this.pendingPoll
  const lease=this.lease;this.lease=null
  if(lease)await this.calls.unregister(lease.rendererId).catch(error=>this.calls.report(error))
  await this.rendering
 }
}

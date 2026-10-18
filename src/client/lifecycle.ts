/** One sequential Cordis effect retains the Remote provider through all Client consumer cleanup. */
import type {Context,Fiber} from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {TypertRemoteContribution} from '@deepseek-ai/dsh-typert-protocol'
/** Adopt provider and consumer fibers so consumer cleanup finishes before Remote unmount.
 * @param ctx - Owning Client plugin scope.
 * @param contribution - Actual generated Remote metadata.
 * @param inject - Explicit dependencies of the consumer, including its mounted namespace.
 * @param start - Registers consumers and returns their asynchronous drain callback.
 * @returns Completion of provider installation and consumer activation.
 */
export async function ownRemoteLifetime(ctx:Context,contribution:TypertRemoteContribution,inject:string[],start:(scope:Context)=>Promise<()=>Promise<void>>):Promise<void>{
 let provider:Fiber|undefined,consumer:Fiber|undefined
 ctx.effect(function*(){
  provider=ctx.plugin({name:'fast-resume.remote-provider',inject:['remote'],async apply(scope:Context){await scope.remote.$mount(contribution)}})
  yield provider.dispose
  consumer=ctx.plugin({name:'fast-resume.client-consumers',inject,apply:start})
  yield consumer.dispose
 },'fastResume.ordered-client-lifetime')
 await provider
 await consumer
}

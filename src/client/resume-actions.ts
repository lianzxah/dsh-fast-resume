/** Client-lifetime explicit proposal actions; unknown outcomes retain identical retry inputs. */
import {brandString} from '@deepseek-ai/dsh-brand'
import type {SessionId} from '@deepseek-ai/dsh-session/types'
import type {ResumeId,ResumeProposalId,ResumeRevision,ResumeUiActionId,ResumeUiMutationRequest,ResumeUiMutationResult} from '../types.ts'
import {uiMutationRequestSchema,uiMutationResultSchema} from '../protocol.ts'
/** User-selected proposal operation before allocating its stable request identity. */
export type ResumeActionInput={sessionId:SessionId;id:ResumeId;proposalId:ResumeProposalId}&({kind:'apply'}|{kind:'revert';expectedRevision:ResumeRevision})
/** Local pending/error state is independent of durable saved outcome. */
export type ResumeActionState={state:'idle'|'pending'|'unknown'|'rejected';error?:unknown}|{state:'committed';result:ResumeUiMutationResult}
/** A retained action supports subscription and identical retry after transport uncertainty. */
export interface ResumeAction {getSnapshot:()=>ResumeActionState;subscribe:(listener:()=>void)=>()=>void;run:()=>Promise<void>;cancel:()=>void}
type Mutate=(request:ResumeUiMutationRequest,signal:AbortSignal)=>Promise<ResumeUiMutationResult>
/** Owns pending Remote calls until completion, including after cancellation or view unmount. */
export class ResumeActions {
 private stopped=false
 private version=0
 private readonly listeners=new Set<()=>void>()
 /** Observe action creation and settlement across mounted cards and sidebar consumers. */
 readonly subscribe=(listener:()=>void):(()=>void)=>{this.listeners.add(listener);return()=>{this.listeners.delete(listener)}}
 /** Stable observable revision; reading it never allocates an action. */
 readonly getSnapshot=():number=>this.version
 private changed(){this.version++;for(const listener of this.listeners)listener()}
 /** Find a retained action without creating a write identity.
  * @param input Session, document, proposal and operation identity.
  * @returns Existing lifetime-owned action, including unknown or committed results.
  */
 find(input:Pick<ResumeActionInput,'sessionId'|'id'|'proposalId'|'kind'>):ResumeAction|undefined{return this.actions.get(JSON.stringify([input.sessionId,input.id,input.proposalId,input.kind]))}
 private readonly pending=new Map<Promise<void>,AbortController>()
 private readonly actions=new Map<string,ResumeAction>()
 constructor(private readonly mutate:Mutate,private readonly mounted:()=>SessionId|undefined){}
 /** Create or retrieve a pending/uncertain action for the same Session and proposal operation.
  * @param input Explicit target and, for Undo, the revision currently reviewed.
  * @returns Retained observable action. Only a definitively rejected operation permits a fresh explicit intent.
  */
 create(input:ResumeActionInput):ResumeAction {
  if(this.stopped)throw Error('Resume actions are closed')
  const key=JSON.stringify([input.sessionId,input.id,input.proposalId,input.kind]),old=this.actions.get(key)
  if(old&&old.getSnapshot().state!=='rejected')return old
  const actionId=brandString<ResumeUiActionId>(crypto.randomUUID())
  const request=uiMutationRequestSchema.parse({sessionId:input.sessionId,actionId,kind:input.kind,request:{id:input.id,proposalId:input.proposalId,requestId:`ui:${actionId}`,...(input.kind==='revert'?{expectedRevision:input.expectedRevision}:{})}})
  let state:ResumeActionState={state:'idle'},running:Promise<void>|undefined,controller:AbortController|undefined
  const listeners=new Set<()=>void>(),publish=(next:ResumeActionState)=>{state=next;for(const listener of listeners)listener();this.changed()}
  const action:ResumeAction={getSnapshot:()=>state,subscribe:listener=>{listeners.add(listener);return()=>{listeners.delete(listener)}},cancel:()=>controller?.abort(),run:async()=>{
   if(this.stopped)throw Error('Resume actions are closed')
   if(running)return running
   if(state.state==='committed')return
   if(this.mounted()!==request.sessionId){publish({state:state.state==='unknown'?'unknown':'rejected',error:Error('Open this conversation before applying changes')});return}
   controller=new AbortController();const signal=controller.signal;publish({state:'pending'})
   const pending=(async()=>{
    try{
     const result=uiMutationResultSchema.parse(await this.mutate(structuredClone(request),signal))
     if(result.resumeId!==request.request.id||result.sessionId!==request.sessionId||result.receipt.requestId!==request.request.requestId||(request.kind==='apply'?result.receipt.proposalId:result.receipt.revertedProposalId)!==request.request.proposalId)throw Error('Mutation acknowledgement does not match the request')
     publish({state:'committed',result})
    }catch(error){
     const details=typeof error==='object'&&error!==null&&'details'in error?error.details:undefined
     const code=typeof details==='object'&&details!==null&&'code'in details?details.code:undefined
     publish({state:['invalid-input','conflict','not-found','edit-cancelled','editor-unavailable'].includes(String(code))?'rejected':'unknown',error})
    }
   })()
   running=pending;this.pending.set(pending,controller)
   try{await pending}finally{this.pending.delete(pending);running=undefined;controller=undefined}
  }}
  this.actions.set(key,action);this.changed();return action
 }
 /** Cancel queued admissions and drain admitted/unknown operations before Remote provider teardown. */
 async dispose():Promise<void>{this.stopped=true;for(const controller of this.pending.values())controller.abort();await Promise.allSettled(this.pending.keys());this.actions.clear();this.listeners.clear()}
}

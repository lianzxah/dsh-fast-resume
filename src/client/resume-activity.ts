/** Pure projection of logged tool execution into hidden Chat activity. */
import {z} from 'zod'
import type {ConversationMatch,ConversationNodeDefinition} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {ChatConversationViewNode} from '@deepseek-ai/dsh-client-ui-chat/client'
import type {} from '@deepseek-ai/dsh-tools/types'
import {resumeIdSchema,resumeRevisionSchema,resumeSessionIdSchema,proposalIdSchema,versionIdSchema} from '../identity.ts'
import type {ChangeReceipt,ResumeId,ResumeRevision} from '../types.ts'
import type {SessionId} from '@deepseek-ai/dsh-session/types'
/** Exact logged facts. Partial argument text is retained without inferring a target. */
export interface ResumeActivityInput {callId:string;rootCallId:string;name:string;argsRaw:string;startSeq:number;seq:number;turn?:number;result?:unknown;meta?:unknown;isError?:boolean}
/** Display state is independent of whether an editor has loaded the saved revision. */
export interface ResumeActivity extends ResumeActivityInput {phase:'reading'|'preparing'|'applying'|'ready'|'choose'|'review'|'saved'|'failed'|'unverified';requestId?:string;sessionId?:SessionId;target?:{resumeId:ResumeId;revision:ResumeRevision};receipt?:ChangeReceipt}
const argsSchema=z.object({id:resumeIdSchema.optional(),intent:z.enum(['resolve','select']).optional(),requestId:z.string().min(1).optional()})
const receiptSchema=z.object({requestId:z.string().min(1),revision:resumeRevisionSchema,changedElementIds:z.array(z.string()),createdAt:z.string(),proposalId:proposalIdSchema.optional(),versionId:versionIdSchema.optional(),revertedProposalId:proposalIdSchema.optional()})
const boundSchema=z.object({state:z.literal('bound'),context:z.object({schemaVersion:z.literal(1),sessionId:resumeSessionIdSchema,resumeId:resumeIdSchema,updatedAt:z.string(),source:z.enum(['editor-entry','explicit-tool','committed-edit'])}),revision:resumeRevisionSchema})
const chooseSchema=z.object({state:z.literal('choose'),reason:z.enum(['missing','deleted','ambiguous'])})
const editSchema=z.object({schemaVersion:z.literal(1),resumeId:resumeIdSchema,sessionId:resumeSessionIdSchema,baseRevision:resumeRevisionSchema,receipt:receiptSchema,summary:z.string()})
const names=new Set(['resume_context','resume_list','resume_create','resume_read','resume_edit','resume_propose','resume_apply','resume_revert','resume_history','resume_restore','resume_export'])
function json(text:string):unknown {try{return JSON.parse(text)}catch(error){return undefined}}
/** Interpret only actual tool names and validated logged JSON; comparison reads never bind.
 * @param input One native or nested call's durable facts.
 * @returns Activity, or undefined for unrelated tools.
 */
export function deriveResumeActivity(input:ResumeActivityInput):ResumeActivity|undefined{
 if(!names.has(input.name))return
 const parsed=argsSchema.safeParse(json(input.argsRaw)),args=parsed.success?parsed.data:undefined
 const mutations=['resume_edit','resume_apply','resume_revert','resume_restore'].includes(input.name)
 const phase=input.isError?'failed':input.result===undefined?(mutations?'applying':input.name==='resume_propose'?'preparing':'reading'):input.name==='resume_propose'?'review':'ready'
 const activity:ResumeActivity={...input,phase,requestId:args?.requestId}
 if(input.isError||input.result===undefined)return activity
 if(input.name==='resume_context'){
  if(chooseSchema.safeParse(input.result).success)return{...activity,phase:'choose'}
  const result=boundSchema.safeParse(input.result)
  if(!result.success||!args)return{...activity,phase:'unverified'}
  if(args.intent==='resolve'&&args.id)return activity
  if((args.intent==='select'&&args.id!==result.data.context.resumeId)||(args.intent!=='select'&&args.intent!=='resolve'))return{...activity,phase:'unverified'}
  return{...activity,sessionId:result.data.context.sessionId,target:{resumeId:result.data.context.resumeId,revision:result.data.revision}}
 }
 if(mutations){
  const modern=editSchema.safeParse(input.result),legacy=receiptSchema.safeParse(input.result)
  const receipt=modern.success?modern.data.receipt:legacy.success?legacy.data:undefined
  if(!receipt||!args?.id||!args.requestId||receipt.requestId!==args.requestId||(modern.success&&modern.data.resumeId!==args.id))return{...activity,phase:'unverified'}
  return{...activity,phase:'saved',sessionId:modern.success?modern.data.sessionId:undefined,receipt,target:{resumeId:args.id,revision:receipt.revision}}
 }
 return activity
}
function fromMatch(match:ConversationMatch,previous?:ResumeActivityInput):ResumeActivityInput|undefined{
 const event=match.event,turn=match.location.kind==='step'||match.location.kind==='turn'?match.location.turn.turn:undefined
 if(event.type==='tool/call')return{callId:String(event.data.callId),rootCallId:String(event.data.callId),name:event.data.name,argsRaw:event.data.arguments,startSeq:event.seq,seq:event.seq,turn:event.data.turn}
 if(event.type==='tool/result'){
  if(!previous)return
  const text=event.data.message.content.filter(part=>part.type==='text').map(part=>part.text).join('\n')
  return{...previous,seq:event.seq,result:json(text)??null,isError:event.data.message.isError===true,meta:event.data.meta}
 }
 if(event.type==='tool/ptc-dispatch-start'||event.type==='tool/ptc-dispatch'){
  const data=event.data,base:ResumeActivityInput={callId:String(data.subCallId),rootCallId:String(data.rootCallId??data.parentCallId),name:data.name,argsRaw:JSON.stringify(data.arguments),startSeq:previous?.startSeq??(event.type==='tool/ptc-dispatch-start'?event.seq:-1),seq:event.seq,turn:previous?.turn??turn}
  if(event.type==='tool/ptc-dispatch-start')return base
  const text=event.data.content?.filter(part=>part.type==='text').map(part=>part.text).join('\n')??''
  return{...base,result:json(text)??null,isError:event.data.isError===true,meta:event.data.meta}
 }
 return previous
}
declare module '@deepseek-ai/dsh-client-ui-chat/client' {interface ChatNodeDataMap {'resume-activity':ResumeActivity}}
/** Hidden alongside normal tool rows; original transcript rendering and model input remain unchanged. */
export const resumeActivityDefinition:ConversationNodeDefinition<ResumeActivityInput|undefined>={
 kind:'resume-activity',target:'chat',
 match(event){
  if(event.type==='tool/call')return{id:String(event.data.callId),role:'start'}
  if(event.type==='tool/result')return{id:String(event.data.message.source.callId),role:'update'}
  if(event.type==='tool/ptc-dispatch-start'||event.type==='tool/ptc-dispatch')return{id:String(event.data.subCallId),role:'start'}
  return null
 },
 start:(_context,match)=>fromMatch(match),update:(context,match)=>fromMatch(match,context.state),
 buildViewNode(context){
  if(!context.state)return null
  const data=deriveResumeActivity(context.state);if(!data)return null
  const node:ChatConversationViewNode={key:context.key,id:context.id,kind:'resume-activity',target:'chat',anchorSeq:data.startSeq,location:context.start?.location??{kind:'unresolved'},visibility:'hidden',data}
  return node
 },
}

interface ActivityBatch {navigation:string;blocked:boolean;opened:Set<ResumeId>;feedback:Set<string>}
interface ActivitySession {targetStart:number;watermark:number;seen:Set<string>;eligible:Set<string>;batches:Map<string,ActivityBatch>}
/** Live eligibility is ephemeral. Loaded snapshots and reconnects establish a passive baseline. */
export class ResumeActivityTracker {
 private readonly sessions=new Map<SessionId,ActivitySession>()
 private generation=0
 private readonly statuses=new Map<SessionId,{value:ResumeActivity|undefined;error?:string;failure:{getSnapshot:()=>string|undefined;subscribe:(listener:()=>void)=>()=>void};listeners:Set<()=>void>;source:{getSnapshot:()=>ResumeActivity|undefined;subscribe:(listener:()=>void)=>()=>void}}>()
 /** Latest logged activity for a header; hidden historical nodes remain available to cards.
  * @param sessionId Actual Session identity.
  * @returns Stable observable, updated only when resume activity changes.
  */
 statusSource(sessionId:SessionId){
  let status=this.statuses.get(sessionId)
  if(!status){const record={value:undefined as ResumeActivity|undefined,listeners:new Set<()=>void>()};const subscribe=(listener:()=>void)=>{record.listeners.add(listener);return()=>{record.listeners.delete(listener)}};status={...record,failure:{getSnapshot:()=>this.statuses.get(sessionId)?.error,subscribe},source:{getSnapshot:()=>this.statuses.get(sessionId)?.value,subscribe:listener=>{record.listeners.add(listener);return()=>{record.listeners.delete(listener)}}}};this.statuses.set(sessionId,status)}
  return status.source
 }

 /** Read view failures separately from logged save outcomes.
  * @param sessionId Actual Session identity.
  * @returns Stable local failure source for an explicit retry action.
  */
 failureSource(sessionId:SessionId){this.statusSource(sessionId);return this.statuses.get(sessionId)!.failure}
 constructor(private readonly mounted:()=>SessionId|undefined,private readonly navigation:()=>string,private readonly reveal:(activity:ResumeActivity,valid:()=>boolean)=>Promise<boolean>,private readonly failed:(error:unknown)=>void=()=>{},private readonly changed?:(activity:ResumeActivity,valid:()=>boolean)=>void){}
 /** Invalidate pending opens on reconnect/disposal; the next snapshot is baseline only. */
 reset():void{this.generation++;this.sessions.clear()}
 /** Capture navigation for a public turn before its first resume call; repeated observations preserve suppression.
  * @param sessionId Ready mounted Session with an established passive baseline.
  * @param turn Actual turn number from the public Conversation binding.
  */
 beginTurn(sessionId:SessionId,turn:number):void{
  if(this.mounted()!==sessionId)return
  const state=this.sessions.get(sessionId),key=`turn:${turn}`
  if(state&&!state.batches.has(key))state.batches.set(key,{navigation:this.navigation(),blocked:false,opened:new Set(),feedback:new Set()})
 }
 /** Public tab visibility/close evidence suppresses remaining calls in the current turn.
  * @param sessionId Actual tab Session; a Session switch itself is not a user close.
  */
 hide(sessionId:SessionId):void{if(this.mounted()!==sessionId)return;for(const batch of this.sessions.get(sessionId)?.batches.values()??[])batch.blocked=true}
 /** Forget eligibility before switching away; returning to history never replays a reveal.
  * @param sessionId Departing Session.
  */
 leave(sessionId:SessionId):void{this.sessions.delete(sessionId);this.generation++}
 /** Observe public Chat nodes after target activation.
  * @param sessionId Actual binding identity.
  * @param activities Validated activity nodes in the current loaded window.
  * @param watermark Largest currently loaded node sequence, including unrelated history.
  * @param foreground Whether this ready binding is currently mounted.
  */
 observe(sessionId:SessionId,activities:readonly ResumeActivity[],watermark:number,foreground:boolean):void{
  this.statusSource(sessionId)
  const status=this.statuses.get(sessionId)!,latest=activities.reduce<ResumeActivity|undefined>((chosen,item)=>!chosen||item.seq>chosen.seq?item:chosen,undefined)
  if(latest&&(!status.value||latest.seq>=status.value.seq)&&latest!==status.value){status.value=latest;for(const listener of status.listeners)listener()}
  let state=this.sessions.get(sessionId)
  if(!state){this.sessions.set(sessionId,{targetStart:-1,watermark,seen:new Set(activities.map(a=>a.callId)),eligible:new Set(),batches:new Map()});return}
  state.targetStart=Math.max(state.targetStart,...activities.filter(activity=>activity.target&&state!.eligible.has(activity.callId)).map(activity=>activity.startSeq))
  const previousWatermark=state.watermark;state.watermark=Math.max(state.watermark,watermark)
  for(const activity of activities){
   const batchId=activity.turn===undefined?activity.rootCallId:`turn:${activity.turn}`
   let batch=state.batches.get(batchId)
   if(!state.seen.has(activity.callId)){
    state.seen.add(activity.callId)
    if(foreground&&this.mounted()===sessionId&&activity.startSeq>previousWatermark){
     state.eligible.add(activity.callId)
     if(!batch){batch={navigation:this.navigation(),blocked:false,opened:new Set(),feedback:new Set()};state.batches.set(batchId,batch)}
    }
   }
   if(!batch||!state.eligible.has(activity.callId))continue
   if(!foreground||this.mounted()!==sessionId||batch.navigation!==this.navigation())batch.blocked=true
   const target=activity.target
   if(target)state.targetStart=Math.max(state.targetStart,activity.startSeq)
   if(!batch.blocked&&(activity.sessionId===undefined||activity.sessionId===sessionId)&&target&&activity.receipt&&!batch.feedback.has(activity.callId)&&activity.startSeq>=state.targetStart){
    batch.feedback.add(activity.callId);const owner=batch,generation=this.generation
    this.changed?.(activity,()=>generation===this.generation&&!owner.blocked&&state!.targetStart===activity.startSeq&&this.mounted()===sessionId)
   }
   if(batch.blocked||!target||activity.startSeq<state.targetStart||batch.opened.has(target.resumeId)||(activity.sessionId!==undefined&&activity.sessionId!==sessionId))continue
   if(status.error){status.error=undefined;for(const listener of status.listeners)listener()}
   batch.opened.add(target.resumeId)
   const generation=this.generation,owner=batch,ownerState=state,targetStart=activity.startSeq
   const valid=()=>targetStart===ownerState.targetStart&&generation===this.generation&&!owner.blocked&&this.mounted()===sessionId&&owner.navigation===this.navigation()
   void this.reveal(activity,valid).then(revealed=>{if(generation!==this.generation||owner.blocked||this.mounted()!==sessionId)return;if(revealed&&targetStart===ownerState.targetStart)owner.navigation=this.navigation();else if(owner.navigation!==this.navigation())owner.blocked=true},error=>{owner.blocked=true;const status=this.statuses.get(sessionId)!;status.error=error instanceof Error?error.message:String(error);for(const listener of status.listeners)listener();this.failed(error)})
  }
 }
}

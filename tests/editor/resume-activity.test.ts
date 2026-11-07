import {describe,it,expect} from 'vitest'
import {deriveResumeActivity,resumeActivityDefinition,type ResumeActivityInput} from '../../src/client/resume-activity.ts'
import type {ConversationMatch,ConversationNodeContext} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {SessionEventLike} from '@deepseek-ai/dsh-api-session-controller/client'
const id='11111111-1111-4111-8111-111111111111'
function activity(name:string,args:unknown,result?:unknown){return deriveResumeActivity({callId:'call',rootCallId:'root',name,argsRaw:JSON.stringify(args),startSeq:1,seq:2,turn:1,...(result===undefined?{}:{result,isError:false})})}
describe('logged resume activity',()=>{
 it('uses a bound resolve but never a comparison read as an opening target',()=>{
  const bound={state:'bound',context:{schemaVersion:1,sessionId:'session',resumeId:id,source:'explicit-tool',updatedAt:'2026-11-01T00:00:00.000Z'},revision:2}
  expect(activity('resume_context',{intent:'resolve'},bound)).toMatchObject({phase:'ready',target:{resumeId:id,revision:2}})
  expect(activity('resume_context',{intent:'resolve',id},bound)?.target).toBeUndefined()
  expect(activity('resume_read',{id},{id,revision:2})?.target).toBeUndefined()
 })
 it.each(['missing','deleted','ambiguous'])('keeps %s target unresolved',reason=>{expect(activity('resume_context',{intent:'resolve'},{state:'choose',reason})).toMatchObject({phase:'choose'});expect(activity('resume_context',{intent:'resolve'},{state:'choose',reason})?.target).toBeUndefined()})
 it('preserves exact receipt/request identity and validates legacy result metadata',()=>{
  const receipt={requestId:'request',revision:3,changedElementIds:['element'],createdAt:'2026-11-01T00:00:00.000Z'}
  expect(activity('resume_apply',{id,requestId:'request'},receipt)).toMatchObject({phase:'saved',requestId:'request',target:{resumeId:id,revision:3},receipt})
  expect(activity('resume_apply',{id,requestId:'different'},receipt)).toMatchObject({phase:'unverified'})
  expect(activity('resume_edit',{id,requestId:'request'},{schemaVersion:1,resumeId:id,sessionId:'session',baseRevision:2,receipt,summary:'Changed'})).toMatchObject({phase:'saved',sessionId:'session'})
 })
 it('does not infer target or mutation from partial arguments or proposal previews',()=>{
  expect(deriveResumeActivity({name:'resume_edit',callId:'call',rootCallId:'call',argsRaw:'{"id":',startSeq:1,seq:1,turn:1})).toMatchObject({phase:'applying'})
  expect(activity('resume_propose',{id,requestId:'r'},{id:'proposal'})).toMatchObject({phase:'review'})
  expect(activity('resume_propose',{id,requestId:'r'},{id:'proposal'})?.target).toBeUndefined()
 })
 it('keeps PTC child/root identity and saved raw metadata on a hidden Chat node',()=>{
  const event={type:'tool/ptc-dispatch-start',seq:1,time:0,data:{rootCallId:'root',parentCallId:'parent',subCallId:'child',name:'resume_context',arguments:{intent:'resolve'}}} as SessionEventLike
  const match={event,role:'start',location:{kind:'unresolved'}} as ConversationMatch
  const context={key:'key',kind:'resume-activity',id:'child',matches:[match],start:match,current:new Map(),state:undefined} as ConversationNodeContext<ResumeActivityInput|undefined>
  const state=resumeActivityDefinition.start(context,match as Extract<ConversationMatch,{role:'start'}>,{previous:()=>undefined})
  expect(state).toMatchObject({callId:'child',rootCallId:'root'})
  expect(resumeActivityDefinition.buildViewNode?.({...context,state})).toMatchObject({target:'chat',visibility:'hidden',data:{callId:'child',rootCallId:'root'}})
 })
})

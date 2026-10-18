import {resumeIdSchema,resumeRevisionSchema} from '../../src/identity.ts'
const rid=resumeIdSchema.parse.bind(resumeIdSchema),rv=resumeRevisionSchema.parse.bind(resumeRevisionSchema)
import {describe,it,expect,vi} from 'vitest'
import {sendResumePrompt} from '../../src/editor/assistant-flow.ts'
import type {ResumeSnapshot} from '../../src/types.ts'
const snapshot=(revision:number):ResumeSnapshot=>({id:rid('a'),revision:rv(revision),documentJson:'{}',title:'A',pageCount:1,updatedAt:'now'})
function deferred<T>(){let resolve!:(v:T)=>void;const promise=new Promise<T>(r=>{resolve=r});return{resolve,promise}}
describe('Session association before a logged prompt',()=>{
 it('waits for the acknowledged association revision before a prompt can immediately apply an agent edit',async()=>{
  const gate=deferred<ResumeSnapshot>(),order:string[]=[],save=vi.fn(async()=>{order.push('associate');return gate.promise})
  let currentRevision=1
  const prompt=vi.fn(async r=>{order.push('prompt');expect(r.revision).toBe(currentRevision);currentRevision++;return{sessionId:'session'}})
  const pending=sendResumePrompt({snapshot:snapshot(1),text:'Improve',selectedIds:['text']},{createSession:async()=>({sessionId:'session'}),associate:save,prompt,onSession:()=>order.push('session')})
  await Promise.resolve();await Promise.resolve();expect(prompt).not.toHaveBeenCalled()
  currentRevision=2;gate.resolve(snapshot(2));await pending
  expect(order).toEqual(['session','associate','prompt']);expect(currentRevision).toBe(3);expect(save).toHaveBeenCalledTimes(1)
 })
 it('retains the associated Session before a prompt failure so configuration can open that conversation',async()=>{
  let retained='';const failure=Error('Model selection required')
  await expect(sendResumePrompt({snapshot:snapshot(1),text:'Improve',selectedIds:[]},{createSession:async()=>({sessionId:'configured-later'}),associate:async()=>snapshot(2),prompt:async()=>{throw failure},onSession:id=>{retained=id}})).rejects.toBe(failure)
  expect(retained).toBe('configured-later')
 })
})

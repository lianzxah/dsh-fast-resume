import {expect,it,vi} from 'vitest'
import {brandString} from '@deepseek-ai/dsh-brand'
import type {SessionId} from '@deepseek-ai/dsh-session/types'
import type {ResumeUiMutationRequest,ResumeUiMutationResult} from '../../src/types.ts'
import {ResumeActions} from '../../src/client/resume-actions.ts'
import {resumeIdSchema,proposalIdSchema,resumeRevisionSchema} from '../../src/identity.ts'
const sessionId=brandString<SessionId>('A'),id=resumeIdSchema.parse('doc'),proposalId=proposalIdSchema.parse('proposal')
it('keeps identical retry inputs after a lost response and treats association failure as committed',async()=>{
 const mutate=vi.fn(async(request:ResumeUiMutationRequest):Promise<ResumeUiMutationResult>=>{if(mutate.mock.calls.length===1)throw Error('Response lost');return{resumeId:id,sessionId,receipt:{requestId:request.request.requestId,proposalId,revision:resumeRevisionSchema.parse(2),changedElementIds:[],createdAt:'now'},association:'failed',editor:'released'}})
 const actions=new ResumeActions(mutate,()=>sessionId),action=actions.create({sessionId,kind:'apply',id,proposalId})
 await action.run();expect(action.getSnapshot().state).toBe('unknown');await action.run();expect(action.getSnapshot()).toMatchObject({state:'committed',result:{association:'failed'}})
 expect(mutate.mock.calls[1][0]).toEqual(mutate.mock.calls[0][0]);await action.run();expect(mutate).toHaveBeenCalledTimes(2);await actions.dispose()
})
it('fences inactive Sessions and drains cancellation without forgetting unknown outcomes',async()=>{
 let mounted:SessionId|undefined=sessionId,finish!:()=>void
 const mutate=vi.fn((_request:ResumeUiMutationRequest,signal:AbortSignal)=>new Promise<never>((_resolve,reject)=>{signal.addEventListener('abort',()=>{finish=()=>reject(Error('Unknown transport outcome'))})}))
 const actions=new ResumeActions(mutate,()=>mounted),action=actions.create({sessionId,kind:'apply',id,proposalId})
 mounted=undefined;await action.run();expect(mutate).not.toHaveBeenCalled();mounted=sessionId
 const pending=action.run();expect(action.getSnapshot().state).toBe('pending');const disposed=actions.dispose();finish();await Promise.all([disposed,pending]);expect(action.getSnapshot().state).toBe('unknown');await expect(action.run()).rejects.toThrow('closed')
})
it('retains a committed action across card remounts and coalesces pending card/sidebar retries',async()=>{
 let finish!:()=>void
 const mutate=vi.fn((request:ResumeUiMutationRequest)=>new Promise<ResumeUiMutationResult>(resolve=>{finish=()=>resolve({resumeId:id,sessionId,receipt:{requestId:request.request.requestId,proposalId,revision:resumeRevisionSchema.parse(2),changedElementIds:[],createdAt:'now'},association:'bound',editor:'released'})}))
 const actions=new ResumeActions(mutate,()=>sessionId),input={sessionId,kind:'apply' as const,id,proposalId},first=actions.create(input),pending=first.run()
 expect(actions.create(input)).toBe(first);const duplicate=first.run();expect(mutate).toHaveBeenCalledOnce();finish();await Promise.all([pending,duplicate]);expect(actions.create(input)).toBe(first);await actions.create(input).run();expect(mutate).toHaveBeenCalledOnce();await actions.dispose()
})

it('exposes retained actions to both mounted consumers without allocating a new intent',async()=>{
 const {ResumeActions}=await import('../../src/client/resume-actions.ts'),sessionId=brandString<SessionId>('visible-session'),id=resumeIdSchema.parse(crypto.randomUUID()),proposalId=proposalIdSchema.parse(crypto.randomUUID())
 const actions=new ResumeActions(async()=>{throw Error('offline')},()=>sessionId),input={sessionId,id,proposalId,kind:'apply' as const},listener=vi.fn()
 const stop=actions.subscribe(listener)
 expect(actions.find(input)).toBeUndefined();const action=actions.create(input);expect(actions.find(input)).toBe(action);await action.run();expect(actions.find(input)?.getSnapshot().state).toBe('unknown');expect(listener).toHaveBeenCalled();stop();await actions.dispose()
})

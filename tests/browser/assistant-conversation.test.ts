import {it,expect,vi} from 'vitest'
import {ResumeActivityTracker,type ResumeActivity} from '../../src/client/resume-activity.ts'
import {resumeIdSchema,resumeRevisionSchema} from '../../src/identity.ts'
import type {SessionId} from '@deepseek-ai/dsh-session/types'
const session='session' as SessionId,id=resumeIdSchema.parse('11111111-1111-4111-8111-111111111111')
function call(seq=1,turn=1):ResumeActivity{return{callId:`call${seq}`,rootCallId:`call${seq}`,name:'resume_edit',argsRaw:'{}',startSeq:seq,seq,turn,phase:'applying'}}
function saved(c=call()):ResumeActivity{return{...c,seq:c.seq+1,phase:'saved',target:{resumeId:id,revision:resumeRevisionSchema.parse(2)}}}
function setup(){let current:SessionId|undefined=session,navigation='closed';const reveal=vi.fn(async(_a:ResumeActivity,valid:()=>boolean)=>{if(!valid())return false;navigation='resume';return true}),tracker=new ResumeActivityTracker(()=>current,()=>navigation,reveal);return{tracker,reveal,switch:()=>{current='other' as SessionId},navigate:(value:string)=>{navigation=value}}}
it('initial history and reconnect are passive, new foreground results reveal once even before a header paints',async()=>{const h=setup();h.tracker.observe(session,[saved()],2,true);expect(h.reveal).not.toHaveBeenCalled();h.tracker.observe(session,[saved(),saved(call(3,2))],4,true);await Promise.resolve();expect(h.reveal).toHaveBeenCalledOnce();h.tracker.observe(session,[saved(),saved(call(3,2))],4,true);expect(h.reveal).toHaveBeenCalledOnce();h.tracker.reset();h.tracker.observe(session,[saved(call(5,3))],6,true);expect(h.reveal).toHaveBeenCalledOnce()})
it('does not promote historical running calls, prepended pages, background results or comparison reads',()=>{const h=setup();h.tracker.observe(session,[call()],10,true);h.tracker.observe(session,[saved()],11,true);h.tracker.observe(session,[saved(call(2))],11,true);expect(h.reveal).not.toHaveBeenCalled();h.tracker.observe(session,[saved(call(12))],13,false);expect(h.reveal).not.toHaveBeenCalled()})
it('suppresses the whole turn after a close or later resource choice and permits a new turn',async()=>{const h=setup();h.tracker.observe(session,[],0,true);h.tracker.observe(session,[call()],1,true);h.navigate('other');h.tracker.observe(session,[saved()],2,true);expect(h.reveal).not.toHaveBeenCalled();h.tracker.observe(session,[saved(),saved(call(3))],4,true);expect(h.reveal).not.toHaveBeenCalled();h.tracker.observe(session,[saved(call(5,2))],6,true);await Promise.resolve();expect(h.reveal).toHaveBeenCalledOnce();h.tracker.hide(session);h.tracker.observe(session,[saved(call(7,2))],8,true);expect(h.reveal).toHaveBeenCalledOnce()})
it('invalidates queued work when Session switches before async completion',async()=>{let finish=()=>{};let current:SessionId|undefined=session;const opened=vi.fn(),tracker=new ResumeActivityTracker(()=>current,()=>'',async(_activity,valid)=>{await new Promise<void>(resolve=>{finish=resolve});if(!valid())return false;opened();return true});tracker.observe(session,[],0,true);tracker.observe(session,[saved()],2,true);current='other' as SessionId;finish();await Promise.resolve();expect(opened).not.toHaveBeenCalled()})
it('a delayed old commit cannot navigate after a newer successful target selection even when its read is still pending',async()=>{
 let navigation='',finishOld=()=>{};const opened:string[]=[],tracker=new ResumeActivityTracker(()=>session,()=>navigation,async(activity,valid)=>{if(activity.callId==='call1')await new Promise<void>(resolve=>{finishOld=resolve});if(valid()){navigation=activity.target!.resumeId;opened.push(navigation);return true}return false})
 tracker.observe(session,[],0,true);tracker.observe(session,[call()],1,true)
 const newer={...saved(call(3)),name:'resume_context',target:{resumeId:resumeIdSchema.parse('22222222-2222-4222-8222-222222222222'),revision:resumeRevisionSchema.parse(1)}}
 tracker.observe(session,[saved()],2,true);tracker.observe(session,[saved(),newer],4,true);finishOld();await Promise.resolve();await Promise.resolve()
 expect(opened).toEqual([newer.target.resumeId])
})
it('keeps a late older call passive when a newer explicit selection result arrived first',async()=>{
 const h=setup();h.tracker.observe(session,[],0,true);h.tracker.observe(session,[call()],1,true)
 const newer={...saved(call(3)),name:'resume_context',target:{resumeId:resumeIdSchema.parse('22222222-2222-4222-8222-222222222222'),revision:resumeRevisionSchema.parse(1)}}
 h.tracker.observe(session,[call(),newer],4,true);await Promise.resolve();h.tracker.observe(session,[{...saved(),seq:5},newer],5,true);expect(h.reveal).toHaveBeenCalledOnce()
})
it('keeps saved status independent of a failed view request',async()=>{const tracker=new ResumeActivityTracker(()=>session,()=>'',async()=>{throw Error('Context unavailable')});tracker.observe(session,[],0,true);tracker.observe(session,[saved()],2,true);await Promise.resolve();expect(tracker.statusSource(session).getSnapshot()?.phase).toBe('saved');expect(tracker.failureSource(session).getSnapshot()).toBe('Context unavailable')})
it('does not adopt a later user navigation after an async reveal declines to open',async()=>{
 let navigation='closed',finish=()=>{};const reveal=vi.fn(async(_activity:ResumeActivity,valid:()=>boolean)=>{await new Promise<void>(done=>{finish=done});return valid()}),tracker=new ResumeActivityTracker(()=>session,()=>navigation,reveal)
 tracker.observe(session,[],0,true);tracker.observe(session,[saved()],2,true);navigation='user-resource';finish();await Promise.resolve();await Promise.resolve()
 tracker.observe(session,[saved(),{...saved(call(3)),target:{resumeId:resumeIdSchema.parse('22222222-2222-4222-8222-222222222222'),revision:resumeRevisionSchema.parse(1)}}],4,true)
 expect(reveal).toHaveBeenCalledOnce()
})
it.each(['close','resource-choice'] as const)('respects %s during thinking before the first resume call and allows the next turn',async choice=>{
 const h=setup();h.navigate('existing-resume');h.tracker.observe(session,[],0,true);h.tracker.beginTurn(session,1)
 h.navigate(choice==='close'?'closed':'other-resource');if(choice==='close')h.tracker.hide(session)
 h.tracker.beginTurn(session,1)
 h.tracker.observe(session,[saved(call(2,1))],3,true);await Promise.resolve();expect(h.reveal).not.toHaveBeenCalled()
 h.tracker.beginTurn(session,2);h.tracker.observe(session,[saved(call(5,2))],6,true);await Promise.resolve();expect(h.reveal).toHaveBeenCalledOnce()
})

it('emits fresh feedback once and never animates replayed receipts or results after close',()=>{
 const changed=vi.fn(),tracker=new ResumeActivityTracker(()=>session,()=>'',async()=>true,undefined,changed)
 const receipt={requestId:'r',revision:resumeRevisionSchema.parse(2),changedElementIds:['e'],createdAt:''},old={...saved(),receipt}
 tracker.observe(session,[old],2,true);expect(changed).not.toHaveBeenCalled()
 tracker.beginTurn(session,2);tracker.observe(session,[{...saved(call(3,2)),receipt}],4,true);expect(changed).toHaveBeenCalledOnce()
 tracker.observe(session,[{...saved(call(3,2)),receipt}],4,true);expect(changed).toHaveBeenCalledOnce()
 tracker.hide(session);expect(changed.mock.calls[0][1]()).toBe(false)
 tracker.observe(session,[{...saved(call(5,2)),receipt}],6,true);expect(changed).toHaveBeenCalledOnce()
})
it('does not animate a receipt whose output belongs to another Session',()=>{const changed=vi.fn(),tracker=new ResumeActivityTracker(()=>session,()=>'',async()=>true,undefined,changed);tracker.observe(session,[],0,true);tracker.observe(session,[{...saved(),sessionId:'other-session' as SessionId,receipt:{requestId:'r',revision:resumeRevisionSchema.parse(2),changedElementIds:['e'],createdAt:''}}],2,true);expect(changed).not.toHaveBeenCalled()})

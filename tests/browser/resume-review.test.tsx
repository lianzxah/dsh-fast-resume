// @vitest-environment jsdom
import React,{act} from 'react'
import {createRoot,type Root} from 'react-dom/client'
import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {Context} from '@deepseek-ai/cordis'
import {brandString} from '@deepseek-ai/dsh-brand'
import type {SessionId} from '@deepseek-ai/dsh-session/types'
import {FastResumeService} from '../../src/host/index.ts'
import {Changes,TargetChooser,ResumeToolCard,type ReviewFace} from '../../src/client/resume-review-ui.tsx'
import {ResumeActions} from '../../src/client/resume-actions.ts'
import {EditorViews} from '../../src/client/editor-views.ts'
import {en} from '../../src/client/locales.tsx'
import {paintFeedback} from '../../upstream/editor/src/lib/canvas-feedback.ts'
import type {PropsLocale} from '@deepseek-ai/dsh-client-ui-slots'
const session=brandString<SessionId>('review-session'),t=((key:keyof typeof en)=>en[key]) as PropsLocale<'fastResume'>['t']
const work=new Set<Promise<unknown>>()
function track<T>(pending:Promise<T>):Promise<T>{work.add(pending);void pending.then(()=>work.delete(pending),()=>work.delete(pending));return pending}
let root:Root|undefined,ctx:Context,dir:string,actions:ResumeActions
beforeEach(()=>{vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);vi.stubGlobal('matchMedia',()=>({matches:false}));Object.defineProperty(document,'hidden',{configurable:true,value:false})})
afterEach(async()=>{await act(async()=>root?.unmount());await actions?.dispose();if(ctx)await ctx.fiber.dispose();if(dir)await rm(dir,{recursive:true,force:true});document.body.innerHTML='';vi.useRealTimers();vi.unstubAllGlobals()})
async function fixture(lost=false){dir=await mkdtemp(join(tmpdir(),'review-ui-'));ctx=new Context();ctx.provide('profileContext',{dir});const service=new FastResumeService(ctx,{storageDir:dir}),snapshot=await service.create({title:'Candidate',templateId:'template-modern'}),page=JSON.parse(snapshot.documentJson).pages[0]
 const proposal=await service.propose({id:snapshot.id,expectedRevision:snapshot.revision,requestId:'propose',summary:'A calm page',operationsJson:JSON.stringify([{type:'page.update',pageId:page.id,config:{backgroundColor:'#eeeeee'}}])})
 actions=new ResumeActions(async(request,signal)=>{const result=await track(service.uiMutation(request,signal));if(lost){lost=false;throw Error('Lost response')}return result},()=>session)
 const views=new EditorViews(async()=>{throw Error('No frame')},async()=>true,()=> 'en',undefined,()=> '')
 const face:ReviewFace={reviewSession:session,actions,views,read:async id=>track(service.read(id)),history:async id=>track(service.history(id)),list:async()=>track(service.list()),context:async()=>track(service.readContext({sessionId:session})),select:vi.fn(async target=>{await track(service.bindAssistantContext({sessionId:session,resumeId:target.id,expectedRevision:target.revision,requestId:crypto.randomUUID()}))}),open:vi.fn()}
 return{service,snapshot,proposal,face}
}
async function mount(node:React.ReactNode){const el=document.createElement('div');document.body.append(el);root=createRoot(el);await act(async()=>root!.render(node));await settle()}
async function settle(){do{await act(async()=>{await Promise.allSettled([...work])})}while(work.size)}
async function button(text:string){const el=[...document.querySelectorAll('button')].find(b=>b.textContent?.includes(text));expect(el).toBeTruthy();await act(async()=>el!.click());await settle()}
it('reviews without mutation, applies through the shared action, and reconciles Undo after a full remount',async()=>{
 const h=await fixture();await mount(<Changes id={h.snapshot.id} face={h.face} t={t}/>);expect((await h.service.read(h.snapshot.id)).revision).toBe(1)
 const apply=[...document.querySelectorAll('button')].find(b=>b.textContent===en.applyProposal)!;expect(apply.disabled).toBe(true)
 await button(en.reviewChanges);await button(en.applyProposal);await act(async()=>{await vi.waitFor(async()=>expect((await h.service.read(h.snapshot.id)).revision).toBe(2))});await settle()
 await act(async()=>root!.unmount());root=undefined;await h.face.actions.dispose();actions=new ResumeActions((request,signal)=>track(h.service.uiMutation(request,signal)),()=>session)
 const manual=await h.service.read(h.snapshot.id),doc=JSON.parse(manual.documentJson);doc.metadata.title='Later manual title';await h.service.save({id:manual.id,expectedRevision:manual.revision,documentJson:JSON.stringify(doc)})
 await mount(<Changes id={manual.id} face={{...h.face,actions}} t={t}/>);expect(document.body.textContent).not.toContain(en.applyProposal);expect(document.body.textContent).toContain(en.savedEarlier)
 await button(en.undoBatch);await act(async()=>{await vi.waitFor(async()=>expect((await h.service.read(manual.id)).revision).toBe(4))});expect((await h.service.read(manual.id)).title).toBe('Later manual title');expect((await h.service.history(manual.id)).changes.filter(c=>c.revertedProposalId===h.proposal.id)).toHaveLength(1)
})
it('retains an unknown action and checks its original identity after a lost committed response',async()=>{const h=await fixture(true);await mount(<Changes id={h.snapshot.id} face={h.face} t={t}/>);await button(en.reviewChanges);await button(en.applyProposal);await act(async()=>{await vi.waitFor(()=>expect(document.body.textContent).toContain(en.unknownAction))});await button(en.checkOutcome);await act(async()=>{await vi.waitFor(()=>expect(document.body.textContent).not.toContain(en.unknownAction))});expect((await h.service.history(h.snapshot.id)).changes).toHaveLength(1)})
it('comparison uses public navigation without selecting a target; explicit editing selects',async()=>{const h=await fixture(),close=vi.fn();await mount(<TargetChooser face={h.face} t={t} close={close}/>);await button(en.compare);expect(h.face.open).toHaveBeenCalledWith(h.snapshot.id);expect(h.face.select).not.toHaveBeenCalled();expect((await h.service.readContext({sessionId:session})).state).toBe('choose');await button(en.useResume);expect((await h.service.readContext({sessionId:session})).state).toBe('bound')})
it('outlines precise DOM bounds for 1.2 seconds without stealing focus and stops hidden/reduced motion',()=>{vi.useFakeTimers();const page=document.createElement('div'),input=document.createElement('input');document.body.append(page,input);input.focus();const owner=new AbortController();paintFeedback(page,[{id:'element',x:10,y:20,width:100,height:30}],owner.signal);expect(page.firstElementChild?.getAttribute('style')).toContain('left: 10px');expect(document.activeElement).toBe(input);vi.advanceTimersByTime(1200);expect(page.children).toHaveLength(0);vi.stubGlobal('matchMedia',()=>({matches:true}));paintFeedback(page,[{id:'page',x:0,y:0,width:500,height:700}],owner.signal);expect((page.firstElementChild as HTMLElement).style.animation).toBe('none');Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));expect(page.children).toHaveLength(0);paintFeedback(page,[],owner.signal);expect(page.children).toHaveLength(0)})

it('renders a historical public toolview without applying, selecting, navigating or animating',async()=>{
 const h=await fixture();const receipt=await h.service.uiMutation({sessionId:session,actionId:brandString<import('../../src/types.ts').ResumeUiActionId>(crypto.randomUUID()),kind:'apply',request:{id:h.snapshot.id,proposalId:h.proposal.id,requestId:'apply'}})
 const props={phase:'result',toolName:'resume_apply',callId:'old-call',block:{kind:'tool-result',seq:2,time:0,callId:'old-call',name:'resume_apply',call:{name:'resume_apply',argsRaw:JSON.stringify({id:h.snapshot.id,proposalId:h.proposal.id,requestId:'apply'})},callTime:0,content:[{type:'text',text:JSON.stringify(receipt.receipt)}],isError:false,subCalls:[]},review:h.face,t} as React.ComponentProps<typeof ResumeToolCard>
 const feedback=vi.spyOn(h.face.views,'feedback');await mount(<ResumeToolCard {...props}/>);expect(document.body.textContent).toContain('Candidate');expect(document.body.textContent).toContain(en.undoBatch);expect(h.face.open).not.toHaveBeenCalled();expect(h.face.select).not.toHaveBeenCalled();expect(feedback).not.toHaveBeenCalled();expect((await h.service.history(h.snapshot.id)).changes).toHaveLength(1)
})
it('keeps an overlap conflict visible and preserves the current document without partial Undo',async()=>{
 const h=await fixture();await mount(<Changes id={h.snapshot.id} face={h.face} t={t}/>);await button(en.reviewChanges);await button(en.applyProposal)
 const current=await h.service.read(h.snapshot.id),doc=JSON.parse(current.documentJson);doc.pages[0].config.backgroundColor='#111111';const saved=await h.service.save({id:current.id,expectedRevision:current.revision,documentJson:JSON.stringify(doc)})
 await button(en.refresh);await button(en.undoBatch);expect(document.body.textContent).toContain(en.actionConflict);expect(await h.service.read(current.id)).toEqual(saved);expect((await h.service.history(current.id)).changes).toHaveLength(1)
})

it('keeps a committed action remount passive even when its exact revision is loaded',async()=>{
 const h=await fixture(),action=actions.create({sessionId:session,id:h.snapshot.id,proposalId:h.proposal.id,kind:'apply'});await action.run()
 const saved=await h.service.read(h.snapshot.id),loaded=[{sessionId:session,resumeId:saved.id,revision:saved.revision}]
 vi.spyOn(h.face.views,'loadedSnapshot').mockReturnValue(loaded);const feedback=vi.spyOn(h.face.views,'feedback')
 await mount(<Changes id={saved.id} face={h.face} t={t}/>);expect(document.body.textContent).toContain(en.loaded);expect(feedback).not.toHaveBeenCalled()
})

it('offers a chooser on an unbound public context card before any editor resource exists',async()=>{
 const h=await fixture(),props={phase:'result',toolName:'resume_context',callId:'context',block:{kind:'tool-result',seq:2,time:0,callId:'context',name:'resume_context',call:{name:'resume_context',argsRaw:JSON.stringify({intent:'resolve'})},callTime:0,content:[{type:'text',text:JSON.stringify({state:'choose',reason:'missing'})}],isError:false,subCalls:[]},review:h.face,t} as React.ComponentProps<typeof ResumeToolCard>
 await mount(<ResumeToolCard {...props}/>);await button(en.choose);expect(document.querySelector('[role="dialog"]')?.textContent).toContain('Candidate');expect(h.face.open).not.toHaveBeenCalled();expect(h.face.select).not.toHaveBeenCalled();await button(en.useResume);expect(h.face.open).toHaveBeenCalledWith(h.snapshot.id)
})

it('shows a later external Undo revision while retaining the original UI apply action owner',async()=>{
 const h=await fixture();await mount(<Changes id={h.snapshot.id} face={h.face} t={t}/>);await button(en.reviewChanges);expect(document.body.textContent).toContain(en.reviewHint);await button(en.applyProposal)
 const action=actions.find({sessionId:session,id:h.snapshot.id,proposalId:h.proposal.id,kind:'apply'})!;expect(action.getSnapshot()).toMatchObject({state:'committed',result:{receipt:{revision:2}}})
 expect(document.body.textContent).not.toContain(en.reviewHint)
 const saved=await h.service.read(h.snapshot.id),undone=await h.service.uiMutation({sessionId:brandString<SessionId>('external-session'),actionId:brandString<import('../../src/types.ts').ResumeUiActionId>(crypto.randomUUID()),kind:'revert',request:{id:saved.id,expectedRevision:saved.revision,proposalId:h.proposal.id,requestId:'external-undo'}})
 const loaded=[{sessionId:session,resumeId:saved.id,revision:undone.receipt.revision}];vi.spyOn(h.face.views,'loadedSnapshot').mockReturnValue(loaded)
 await button(en.refresh);expect(actions.find({sessionId:session,id:saved.id,proposalId:h.proposal.id,kind:'apply'})).toBe(action)
 expect(document.querySelector('.fr-card .fr-status')?.textContent).toBe(`${en.undone} · ${en.revision} 3`);expect(document.body.textContent).not.toContain(en.reviewHint)
 expect(document.body.textContent).not.toContain(en.undoBatch);expect(document.body.textContent).not.toContain(en.applyProposal)
})

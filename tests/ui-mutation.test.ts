import {afterEach,expect,it,vi} from 'vitest'
import {Context} from '@deepseek-ai/cordis'
import {brandString} from '@deepseek-ai/dsh-brand'
import type {SessionId} from '@deepseek-ai/dsh-session/types'
import {mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {randomUUID} from 'node:crypto'
import {FastResumeService} from '../src/host/index.ts'
import {SaveCoordinator} from '../src/editor/persistence.ts'
import {ResumeStore} from '../src/host/store.ts'
import type {EditorOwnerId,EditorIncarnationId,ResumeUiActionId} from '../src/types.ts'
const resources:Array<{ctx:Context;root:string}>=[]
afterEach(async()=>{vi.restoreAllMocks();for(const{ctx,root}of resources.splice(0)){await ctx.fiber.dispose();await rm(root,{recursive:true,force:true})}})
async function fixture(){const root=await mkdtemp(join(tmpdir(),'resume-ui-write-')),ctx=new Context();resources.push({ctx,root});ctx.provide('profileContext',{dir:root});const service=new FastResumeService(ctx,{storageDir:root,editorPollIntervalMs:5}),snapshot=await service.create({title:'Candidate',templateId:'template-modern'}),sessionId=brandString<SessionId>('session-a');return{service,snapshot,sessionId}}
const register=(service:FastResumeService,id:Parameters<FastResumeService['read']>[0])=>service.editorRegister({resumeId:id,ownerId:brandString<EditorOwnerId>(randomUUID()),incarnationId:brandString<EditorIncarnationId>(randomUUID()),recoveryPending:false})
it('keeps proposal review nonmutating and recovers an explicit apply receipt offline',async()=>{
 const{service,snapshot,sessionId}=await fixture(),proposal=await service.propose({id:snapshot.id,expectedRevision:snapshot.revision,requestId:'proposal',operationsJson:JSON.stringify([{type:'page.update',pageId:JSON.parse(snapshot.documentJson).pages[0].id,config:{backgroundColor:'#eeeeee'}}]),summary:'Page color'})
 expect((await service.read(snapshot.id)).revision).toBe(1)
 const request={sessionId,actionId:brandString<ResumeUiActionId>(randomUUID()),kind:'apply' as const,request:{id:snapshot.id,proposalId:proposal.id,requestId:'ui-apply'}}
 const receipt=await service.uiMutation(request,new AbortController().signal)
 const owner=await register(service,snapshot.id);await service.editorDisconnect(snapshot.id,owner.token)
 expect(await service.uiMutation(request,new AbortController().signal)).toEqual({...receipt,editor:'not-required'})
 expect((await service.history(snapshot.id)).changes).toHaveLength(1)
 expect(await service.readContext({sessionId})).toMatchObject({context:{resumeId:snapshot.id}})
})
it('flushes a dirty editor without deadlocking its Session save and rejects the stale UI proposal',async()=>{
 const{service,snapshot,sessionId}=await fixture(),other=await service.create({title:'Other'});await service.bindContext({sessionId,resumeId:other.id,expectedRevision:other.revision,requestId:'other'})
 const proposal=await service.propose({id:snapshot.id,expectedRevision:snapshot.revision,requestId:'proposal',operationsJson:JSON.stringify([{type:'template.apply',templateId:'template-classic'}]),summary:'Template'}),owner=await register(service,snapshot.id)
 const pending=service.uiMutation({sessionId,actionId:brandString<ResumeUiActionId>(randomUUID()),kind:'apply',request:{id:snapshot.id,proposalId:proposal.id,requestId:'ui-apply'}},new AbortController().signal)
 const rejected=expect(pending).rejects.toMatchObject({details:{code:'conflict'}})
 const job=await vi.waitFor(async()=>{const job=await service.editorPoll(snapshot.id,owner.token);expect(job).not.toBeNull();return job!})
 let saved!:Awaited<ReturnType<FastResumeService['saveInSession']>>
 const coordinator=new SaveCoordinator(snapshot,async save=>{saved=await service.saveInSession({contextSessionId:sessionId,save,token:owner.token});return saved.snapshot})
 const dirty=JSON.parse(snapshot.documentJson);dirty.metadata.title='Dirty editor';coordinator.edit(JSON.stringify(dirty));await coordinator.prepare();expect(coordinator.state.dirty).toBe(false);coordinator.dispose()
 expect(saved).toMatchObject({snapshot:{revision:2},association:'bound'})
 await service.editorAcknowledge({resumeId:snapshot.id,token:owner.token,preparationId:job.id,revision:saved.snapshot.revision,clean:true});await rejected
 expect(await service.readContext({sessionId})).toMatchObject({context:{resumeId:snapshot.id}})
 expect((await service.history(snapshot.id)).changes).toHaveLength(0)
})
it('preserves newer explicit selection after a manual save and does not repurpose its legacy Session association',async()=>{
 const{service,snapshot,sessionId}=await fixture(),other=await service.create({title:'Comparison'}),owner=await register(service,snapshot.id),original=ResumeStore.prototype.save
 vi.spyOn(ResumeStore.prototype,'save').mockImplementationOnce(async function(this:ResumeStore,request,guard){const saved=await original.call(this,request,guard);await service.bindContext({sessionId,resumeId:other.id,expectedRevision:other.revision,requestId:'new-choice'});return saved})
 const result=await service.saveInSession({contextSessionId:sessionId,save:{id:snapshot.id,expectedRevision:snapshot.revision,documentJson:snapshot.documentJson,sessionId:'legacy-document-session'},token:owner.token})
 expect(result).toMatchObject({association:'superseded',snapshot:{revision:2,sessionId:'legacy-document-session'}})
 expect(await service.readContext({sessionId})).toMatchObject({context:{resumeId:other.id}})
})
it('returns the acknowledged manual snapshot separately when association storage fails',async()=>{
 const{service,snapshot,sessionId}=await fixture(),owner=await register(service,snapshot.id)
 const {SessionContextStore}=await import('../src/host/session-context.ts')
 vi.spyOn(SessionContextStore.prototype,'finishManualSave').mockRejectedValueOnce(Error('Context disk unavailable'))
 const result=await service.saveInSession({contextSessionId:sessionId,save:{id:snapshot.id,expectedRevision:snapshot.revision,documentJson:snapshot.documentJson},token:owner.token})
 expect(result).toMatchObject({association:'failed',snapshot:{revision:2}})
 expect((await service.read(snapshot.id)).revision).toBe(2)
})
it.each(['unrelated','overlap'] as const)('selectively undoes a UI batch after a later %s manual edit',async mode=>{
 const{service,snapshot,sessionId}=await fixture(),doc=JSON.parse(snapshot.documentJson),text=doc.pages.flatMap((p:{elements:Array<{type:string;id:string}>})=>p.elements).find((e:{type:string})=>e.type==='text')!
 const proposal=await service.propose({id:snapshot.id,expectedRevision:snapshot.revision,requestId:'proposal',operationsJson:JSON.stringify([{type:'text.replace',elementId:text.id,content:'AI text'}]),summary:'Rewrite'})
 const applied=await service.uiMutation({sessionId,actionId:brandString<ResumeUiActionId>(randomUUID()),kind:'apply',request:{id:snapshot.id,proposalId:proposal.id,requestId:'apply'}})
 const current=await service.read(snapshot.id),manual=JSON.parse(current.documentJson)
 if(mode==='overlap')manual.pages.flatMap((p:{elements:Array<{type:string;id:string;content?:string}>})=>p.elements).find((e:{id:string})=>e.id===text.id).content='Later manual text'
 else manual.metadata.title='Later manual title'
 const saved=await service.save({id:snapshot.id,expectedRevision:current.revision,documentJson:JSON.stringify(manual)})
 const request={sessionId,actionId:brandString<ResumeUiActionId>(randomUUID()),kind:'revert' as const,request:{id:snapshot.id,proposalId:proposal.id,expectedRevision:saved.revision,requestId:'undo'}}
 if(mode==='overlap'){await expect(service.uiMutation(request)).rejects.toMatchObject({details:{code:'conflict'}});expect(await service.read(snapshot.id)).toEqual(saved);expect((await service.history(snapshot.id)).changes).toHaveLength(1)}
 else{const undone=await service.uiMutation(request);expect(undone.receipt).toMatchObject({revertedProposalId:proposal.id,revision:4});const result=JSON.parse((await service.read(snapshot.id)).documentJson);expect(result.metadata.title).toBe('Later manual title');expect(result.pages.flatMap((p:{elements:unknown[]})=>p.elements).find((e:{id:string})=>e.id===text.id).content).toBe(text.content);expect(applied.receipt.revision).toBe(2);expect(await service.uiMutation(request)).toEqual({...undone,editor:'not-required'})}
})
it('returns committed receipt after target failure and repairs it on an identical offline retry',async()=>{
 const{service,snapshot,sessionId}=await fixture(),{SessionContextStore}=await import('../src/host/session-context.ts')
 const proposal=await service.propose({id:snapshot.id,expectedRevision:snapshot.revision,requestId:'p',operationsJson:JSON.stringify([{type:'template.apply',templateId:'template-classic'}]),summary:'Template'})
 const request={sessionId,actionId:brandString<ResumeUiActionId>(randomUUID()),kind:'apply' as const,request:{id:snapshot.id,proposalId:proposal.id,requestId:'apply'}}
 vi.spyOn(SessionContextStore.prototype,'finishCommit').mockRejectedValueOnce(Error('Context disk unavailable'))
 const result=await service.uiMutation(request);expect(result).toMatchObject({receipt:{revision:2},association:'failed'})
 const owner=await register(service,snapshot.id);await service.editorDisconnect(snapshot.id,owner.token)
 const recovered=await service.uiMutation(request);expect(recovered).toMatchObject({receipt:result.receipt,association:'bound',editor:'not-required'});expect((await service.history(snapshot.id)).changes).toHaveLength(1)
})
it('checks cancelled admission and recovers a committed result even when its retry is cancelled',async()=>{
 const{service,snapshot,sessionId}=await fixture(),cancelled=new AbortController();cancelled.abort()
 const proposal=await service.propose({id:snapshot.id,expectedRevision:snapshot.revision,requestId:'p',operationsJson:JSON.stringify([{type:'template.apply',templateId:'template-classic'}]),summary:'Template'}),request={sessionId,actionId:brandString<ResumeUiActionId>(randomUUID()),kind:'apply' as const,request:{id:snapshot.id,proposalId:proposal.id,requestId:'apply'}}
 await expect(service.uiMutation(request,cancelled.signal)).rejects.toMatchObject({details:{code:'edit-cancelled'}});expect((await service.read(snapshot.id)).revision).toBe(1)
 const committed=await service.uiMutation(request);expect((await service.uiMutation(request,cancelled.signal)).receipt).toEqual(committed.receipt)
})
it('still saves when selection capture fails and requires the current editor capability',async()=>{
 const{service,snapshot,sessionId}=await fixture(),owner=await register(service,snapshot.id),{SessionContextStore}=await import('../src/host/session-context.ts')
 vi.spyOn(SessionContextStore.prototype,'captureManualSave').mockRejectedValueOnce(Error('Context read failed'))
 const request={contextSessionId:sessionId,save:{id:snapshot.id,expectedRevision:snapshot.revision,documentJson:snapshot.documentJson},token:owner.token}
 expect(await service.saveInSession(request)).toMatchObject({snapshot:{revision:2},association:'failed'})
 await expect(service.saveInSession({...request,save:{...request.save,expectedRevision:(await service.read(snapshot.id)).revision},token:brandString<import('../src/types.ts').EditorToken>(randomUUID())})).rejects.toMatchObject({details:{code:'editor-unavailable'}})
})
it('settles an admitted UI write after caller cancellation and never invents a failed save',async()=>{
 const{service,snapshot,sessionId}=await fixture(),controller=new AbortController(),original=ResumeStore.prototype.apply
 const proposal=await service.propose({id:snapshot.id,expectedRevision:snapshot.revision,requestId:'p',operationsJson:JSON.stringify([{type:'template.apply',templateId:'template-classic'}]),summary:'Template'}),request={sessionId,actionId:brandString<ResumeUiActionId>(randomUUID()),kind:'apply' as const,request:{id:snapshot.id,proposalId:proposal.id,requestId:'apply'}}
 vi.spyOn(ResumeStore.prototype,'apply').mockImplementationOnce(async function(this:ResumeStore,input,guard){const receipt=await original.call(this,input,guard);controller.abort();return receipt})
 const result=await service.uiMutation(request,controller.signal);expect(result).toMatchObject({receipt:{revision:2},association:'bound'});expect((await service.uiMutation(request)).receipt).toEqual(result.receipt);expect((await service.history(snapshot.id)).changes).toHaveLength(1)
})
it('preserves later explicit selection when recovering a committed UI association failure',async()=>{
 const{service,snapshot,sessionId}=await fixture(),{SessionContextStore}=await import('../src/host/session-context.ts'),other=await service.create({title:'Later choice'})
 const proposal=await service.propose({id:snapshot.id,expectedRevision:snapshot.revision,requestId:'p',operationsJson:JSON.stringify([{type:'template.apply',templateId:'template-classic'}]),summary:'Template'}),request={sessionId,actionId:brandString<ResumeUiActionId>(randomUUID()),kind:'apply' as const,request:{id:snapshot.id,proposalId:proposal.id,requestId:'apply'}}
 vi.spyOn(SessionContextStore.prototype,'finishCommit').mockRejectedValueOnce(Error('Context unavailable'))
 const original=await service.uiMutation(request);await service.bindContext({sessionId,resumeId:other.id,expectedRevision:other.revision,requestId:'later-choice'})
 const result=await service.uiMutation(request);expect(result).toMatchObject({receipt:original.receipt,association:'superseded'});expect(await service.readContext({sessionId})).toMatchObject({context:{resumeId:other.id}});expect((await service.history(snapshot.id)).changes).toHaveLength(1)
})
it('reports historical receipt association ambiguity without adopting or repeating the write',async()=>{
 const{service,snapshot,sessionId}=await fixture(),other=await service.create({title:'Selected'})
 await service.bindContext({sessionId,resumeId:other.id,expectedRevision:other.revision,requestId:'selected'})
 const proposal=await service.propose({id:snapshot.id,expectedRevision:snapshot.revision,requestId:'p',operationsJson:JSON.stringify([{type:'template.apply',templateId:'template-classic'}]),summary:'Template'}),request={sessionId,actionId:brandString<ResumeUiActionId>(randomUUID()),kind:'apply' as const,request:{id:snapshot.id,proposalId:proposal.id,requestId:'old-apply'}},receipt=await service.applyProposal(request.request)
 expect(await service.uiMutation(request)).toMatchObject({receipt,association:'ambiguous'});expect(await service.uiMutation(request)).toMatchObject({receipt,association:'ambiguous'});expect(await service.readContext({sessionId})).toMatchObject({context:{resumeId:other.id}});expect((await service.history(snapshot.id)).changes).toHaveLength(1)
})
it('flushes a later manual draft before UI Undo and requires a fresh reviewed revision',async()=>{
 const{service,snapshot,sessionId}=await fixture(),doc=JSON.parse(snapshot.documentJson),text=doc.pages.flatMap((p:{elements:Array<{type:string;id:string}>})=>p.elements).find((e:{type:string})=>e.type==='text')!
 const proposal=await service.propose({id:snapshot.id,expectedRevision:snapshot.revision,requestId:'p',operationsJson:JSON.stringify([{type:'text.replace',elementId:text.id,content:'AI text'}]),summary:'Rewrite'})
 const applied=await service.uiMutation({sessionId,actionId:brandString<ResumeUiActionId>(randomUUID()),kind:'apply',request:{id:snapshot.id,proposalId:proposal.id,requestId:'apply'}}),current=await service.read(snapshot.id),owner=await register(service,snapshot.id)
 const request={sessionId,actionId:brandString<ResumeUiActionId>(randomUUID()),kind:'revert' as const,request:{id:snapshot.id,proposalId:proposal.id,expectedRevision:applied.receipt.revision,requestId:'stale-undo'}},pending=service.uiMutation(request),rejected=expect(pending).rejects.toMatchObject({details:{code:'conflict'}})
 const preparation=await vi.waitFor(async()=>{const job=await service.editorPoll(snapshot.id,owner.token);expect(job).not.toBeNull();return job!})
 const coordinator=new SaveCoordinator(current,async save=>(await service.saveInSession({contextSessionId:sessionId,save,token:owner.token})).snapshot),manual=JSON.parse(current.documentJson);manual.metadata.title='Later manual title';coordinator.edit(JSON.stringify(manual));const saved=await coordinator.prepare();coordinator.dispose()
 await service.editorAcknowledge({resumeId:snapshot.id,token:owner.token,preparationId:preparation.id,revision:saved.revision,clean:true});await rejected
 const retry=service.uiMutation({...request,actionId:brandString<ResumeUiActionId>(randomUUID()),request:{...request.request,expectedRevision:saved.revision,requestId:'fresh-undo'}})
 const next=await vi.waitFor(async()=>{const job=await service.editorPoll(snapshot.id,owner.token);expect(job).not.toBeNull();return job!});await service.editorAcknowledge({resumeId:snapshot.id,token:owner.token,preparationId:next.id,revision:saved.revision,clean:true})
 expect(await retry).toMatchObject({receipt:{revision:4,revertedProposalId:proposal.id}});const result=JSON.parse((await service.read(snapshot.id)).documentJson);expect(result.metadata.title).toBe('Later manual title');expect(result.pages.flatMap((p:{elements:unknown[]})=>p.elements).find((e:{id:string})=>e.id===text.id).content).toBe(text.content)
})
it('refuses a second apply or Undo identity across concurrent Sessions after a lost UI lifetime',async()=>{
 const{service,snapshot,sessionId}=await fixture(),proposal=await service.propose({id:snapshot.id,expectedRevision:snapshot.revision,requestId:'p',operationsJson:JSON.stringify([{type:'template.apply',templateId:'template-classic'}]),summary:'Template'})
 const attempts=[sessionId,brandString<SessionId>('reloaded-session')].map((sessionId,index)=>({sessionId,actionId:brandString<ResumeUiActionId>(randomUUID()),kind:'apply' as const,request:{id:snapshot.id,proposalId:proposal.id,requestId:`apply-${index}`}}))
 const results=await Promise.allSettled(attempts.map(request=>service.uiMutation(request)));expect(results.filter(result=>result.status==='fulfilled')).toHaveLength(1);expect(results.filter(result=>result.status==='rejected')).toHaveLength(1)
 const current=await service.read(snapshot.id),undo=attempts.map((request,index)=>({...request,kind:'revert' as const,request:{...request.request,expectedRevision:current.revision,requestId:`undo-${index}`}})),undone=await Promise.allSettled(undo.map(request=>service.uiMutation(request)))
 expect(undone.filter(result=>result.status==='fulfilled')).toHaveLength(1);expect(undone.filter(result=>result.status==='rejected')).toHaveLength(1)
 const history=await service.history(snapshot.id);expect(history.proposals.find(p=>p.id===proposal.id)?.status).toBe('applied');expect(history.changes.filter(c=>c.proposalId===proposal.id)).toHaveLength(1);expect(history.changes.filter(c=>c.revertedProposalId===proposal.id)).toHaveLength(1);expect((await service.read(snapshot.id)).revision).toBe(3)
})

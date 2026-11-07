import {expect,it,vi} from 'vitest'
import {Context} from '@deepseek-ai/cordis'
import {brandString} from '@deepseek-ai/dsh-brand'
import type {SessionId} from '@deepseek-ai/dsh-session/types'
import {mkdtemp,rm} from 'node:fs/promises'
import {setImmediate} from 'node:timers/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {randomUUID} from 'node:crypto'
import {FastResumeService} from '../src/host/index.ts'
import {SessionContextStore} from '../src/host/session-context.ts'
import {EditorCoordinator} from '../src/host/editor-coordinator.ts'
import {ResumeStore,resolveConfig} from '../src/host/store.ts'
import type {EditorOwnerId,EditorIncarnationId} from '../src/types.ts'

function barrier(){let release!:()=>void;const promise=new Promise<void>(resolve=>{release=resolve});return{promise,release}}
async function fixture(){
 const root=await mkdtemp(join(tmpdir(),'resume-host-lifetime-')),ctx=new Context()
 ctx.provide('profileContext',{dir:root})
 const fiber=ctx.plugin(FastResumeService,{storageDir:root,editorPollIntervalMs:5});await fiber
 const service=ctx.fastResume,snapshot=await service.create({title:'Lifetime fixture'}),sessionId=brandString<SessionId>('lifetime-session')
 const owner=await service.editorRegister({resumeId:snapshot.id,ownerId:brandString<EditorOwnerId>(randomUUID()),incarnationId:brandString<EditorIncarnationId>(randomUUID()),recoveryPending:false})
 const contexts:SessionContextStore=Reflect.get(service,'contexts'),editors:EditorCoordinator=Reflect.get(service,'editors')
 const disk=new ResumeStore(resolveConfig(root,{storageDir:root})),durableContexts=new SessionContextStore(disk)
 return{root,ctx,fiber,service,snapshot,sessionId,owner,contexts,editors,disk,durableContexts}
}

it.each(['provider','owner'] as const)('drains a conversation save before its writer during %s disposal',async mode=>{await saveBarrier(mode,'capture')})
it.each(['provider','owner'] as const)('drains a conversation save before its final association during %s disposal',async mode=>{await saveBarrier(mode,'association')})
async function saveBarrier(mode:'provider'|'owner',point:'capture'|'association'){
 const f=await fixture(),entered=barrier(),gate=barrier(),closing=barrier()
 const capture=f.contexts.captureManualSave.bind(f.contexts),finish=f.contexts.finishManualSave.bind(f.contexts),disposeEditors=f.editors.dispose.bind(f.editors)
 const spy=point==='capture'?vi.spyOn(f.contexts,'captureManualSave').mockImplementationOnce(async id=>{const result=await capture(id);entered.release();await gate.promise;return result}):vi.spyOn(f.contexts,'finishManualSave').mockImplementationOnce(async(...args)=>{entered.release();await gate.promise;return finish(...args)})
 const cleanup=vi.spyOn(f.editors,'dispose').mockImplementation(async()=>{closing.release();await disposeEditors()})
 let pending:Promise<unknown>|undefined,disposal:Promise<unknown>|undefined,disposed=false,terminal=false
 try{
  const request={contextSessionId:f.sessionId,token:f.owner.token,save:{id:f.snapshot.id,expectedRevision:f.snapshot.revision,documentJson:f.snapshot.documentJson}}
  const save=f.service.saveInSession(request);pending=save.then(value=>{terminal=true;return value});await entered.promise
  disposal=(mode==='provider'?f.fiber.dispose():f.ctx.fiber.dispose()).then(()=>{disposed=true;expect(terminal).toBe(true)})
  void disposal.catch(()=>{})
  await closing.promise
  // Flush this event-loop turn after both actual Cordis cleanup and the controlled write have started.
  await setImmediate()
  expect(disposed).toBe(false)
  await expect(f.service.saveInSession(request)).rejects.toMatchObject({details:{code:'disposed'}})
  expect((await f.disk.read(f.snapshot.id)).revision).toBe(point==='capture'?1:2)
  gate.release()
  expect(await pending).toMatchObject({snapshot:{revision:2},association:'bound'})
  expect(await f.durableContexts.resolve(f.sessionId)).toMatchObject({state:'bound',context:{resumeId:f.snapshot.id},revision:2})
  await disposal
  expect(disposed).toBe(true)
 }finally{gate.release();await Promise.allSettled([pending,disposal]);spy.mockRestore();cleanup.mockRestore();await f.ctx.fiber.dispose();await rm(f.root,{recursive:true,force:true})}
}

it.each(['bind','begin','record'] as const)('drains an accepted %s context write and rejects new context admission',async kind=>{
 const f=await fixture(),entered=barrier(),gate=barrier(),closing=barrier()
 const begin={resumeId:f.snapshot.id,expectedRevision:f.snapshot.revision,requestId:brandString<import('../src/types.ts').AssistantHandoffId>(randomUUID()),workspaceId:brandString<import('../src/types.ts').AssistantWorkspaceId>('lifetime-workspace')}
 if(kind==='record')await f.service.beginAssistantHandoff(begin)
 const bind=f.contexts.bind.bind(f.contexts),allocate=f.contexts.beginAssistantHandoff.bind(f.contexts),record=f.contexts.recordAssistantSession.bind(f.contexts)
 const pause=async()=>{entered.release();await gate.promise}
 const spy=kind==='bind'?vi.spyOn(f.contexts,'bind').mockImplementationOnce(async request=>{await pause();return bind(request)}):kind==='begin'?vi.spyOn(f.contexts,'beginAssistantHandoff').mockImplementationOnce(async request=>{await pause();return allocate(request)}):vi.spyOn(f.contexts,'recordAssistantSession').mockImplementationOnce(async request=>{await pause();return record(request)})
 const original=f.editors.dispose.bind(f.editors),cleanup=vi.spyOn(f.editors,'dispose').mockImplementation(async()=>{closing.release();await original()})
 let pending:Promise<unknown>|undefined,disposal:Promise<unknown>|undefined,disposed=false
 try{
  pending=kind==='bind'?f.service.bindAssistantContext({sessionId:f.sessionId,resumeId:f.snapshot.id,expectedRevision:f.snapshot.revision,requestId:'selection'}):kind==='begin'?f.service.beginAssistantHandoff(begin):f.service.recordAssistantSession({requestId:begin.requestId,sessionId:f.sessionId})
  await entered.promise;disposal=f.fiber.dispose().then(()=>{disposed=true});await closing.promise;await setImmediate();expect(disposed).toBe(false)
  await expect(f.service.beginAssistantHandoff({...begin,requestId:brandString<import('../src/types.ts').AssistantHandoffId>(randomUUID())})).rejects.toMatchObject({details:{code:'disposed'}})
  gate.release();await pending;await disposal
  if(kind==='bind')expect(await f.durableContexts.resolve(f.sessionId)).toMatchObject({state:'bound',context:{resumeId:f.snapshot.id}})
  else expect(await f.durableContexts.readAssistantHandoff(begin)).toMatchObject({requestId:begin.requestId,...(kind==='record'?{sessionId:f.sessionId}:{})})
 }finally{gate.release();await Promise.allSettled([pending,disposal]);spy.mockRestore();cleanup.mockRestore();await f.ctx.fiber.dispose();await rm(f.root,{recursive:true,force:true})}
})

it.each(['register','reconcile'] as const)('retains an accepted %s owner write until its durable result',async kind=>{
 const f=await fixture(),entered=barrier(),gate=barrier(),closing=barrier(),store:ResumeStore=Reflect.get(f.service,'store')
 const read=store.read.bind(store),dispose=f.editors.dispose.bind(f.editors)
 const spy=vi.spyOn(store,'read').mockImplementationOnce(async id=>{const result=await read(id);entered.release();await gate.promise;return result})
 const cleanup=vi.spyOn(f.editors,'dispose').mockImplementation(async()=>{closing.release();await dispose()})
 let pending:Promise<unknown>|undefined,disposal:Promise<unknown>|undefined,disposed=false
 try{
  pending=kind==='register'?f.service.editorRegister({resumeId:f.snapshot.id,ownerId:brandString<EditorOwnerId>(randomUUID()),incarnationId:brandString<EditorIncarnationId>(randomUUID()),recoveryPending:false}):f.service.editorReconcile({resumeId:f.snapshot.id,token:f.owner.token,expectedRevision:f.snapshot.revision})
  await entered.promise;disposal=f.ctx.fiber.dispose().then(()=>{disposed=true});await closing.promise;await setImmediate();expect(disposed).toBe(false)
  await expect(f.service.editorReconcile({resumeId:f.snapshot.id,token:f.owner.token,expectedRevision:f.snapshot.revision})).rejects.toMatchObject({details:{code:'disposed'}})
  gate.release();const result=await pending;await disposal
  const {readFile}=await import('node:fs/promises'),owner=JSON.parse(await readFile(join(f.root,'owners-v1',`${f.snapshot.id}.json`),'utf8'))
  expect(result).toMatchObject({token:owner.token,uncertain:owner.uncertain})
 }finally{gate.release();await Promise.allSettled([pending,disposal]);spy.mockRestore();cleanup.mockRestore();await f.ctx.fiber.dispose();await rm(f.root,{recursive:true,force:true})}
})

it('keeps completion callbacks usable and drains callbacks admitted during shutdown after cleanup failure',async()=>{
 const f=await fixture(),entered=barrier(),gate=barrier(),closing=barrier(),completionEntered=barrier(),completionGate=barrier()
 const capture=f.contexts.captureManualSave.bind(f.contexts),disconnect=f.editors.disconnect.bind(f.editors),disposeEditors=f.editors.dispose.bind(f.editors),disposeContexts=f.contexts.dispose.bind(f.contexts)
 const saveSpy=vi.spyOn(f.contexts,'captureManualSave').mockImplementationOnce(async id=>{const value=await capture(id);entered.release();await gate.promise;return value})
 const cleanup=vi.spyOn(f.editors,'dispose').mockImplementation(async()=>{await disposeEditors();throw Error('Injected editor cleanup failure')})
 const remaining=vi.spyOn(f.contexts,'dispose').mockImplementation(async()=>{await disposeContexts();closing.release()})
 const callback=vi.spyOn(f.editors,'disconnect').mockImplementationOnce(async(...args)=>{completionEntered.release();await completionGate.promise;return disconnect(...args)})
 const report=vi.spyOn(f.fiber.ctx.logger,'error').mockImplementation(()=>{})
 let pending:Promise<unknown>|undefined,completion:Promise<unknown>|undefined,disposal:Promise<unknown>|undefined,disposed=false
 try{
  pending=f.service.saveInSession({contextSessionId:f.sessionId,token:f.owner.token,save:{id:f.snapshot.id,expectedRevision:f.snapshot.revision,documentJson:f.snapshot.documentJson}})
  await entered.promise;disposal=f.fiber.dispose().then(()=>{disposed=true});await closing.promise
  expect(await f.service.editorPoll(f.snapshot.id,f.owner.token)).toBeNull()
  completion=f.service.editorDisconnect(f.snapshot.id,f.owner.token,true);await completionEntered.promise
  gate.release();expect(await pending).toMatchObject({snapshot:{revision:2},association:'bound'})
  await setImmediate();expect(disposed).toBe(false)
  completionGate.release();expect(await completion).toBe(true);await disposal
  expect(remaining).toHaveBeenCalledOnce();expect(report).toHaveBeenCalled()
  expect(String(report.mock.calls[0]?.[0])).toContain('Resume service cleanup failed after operation settlement')
  await expect(f.service.editorPoll(f.snapshot.id,f.owner.token)).rejects.toMatchObject({details:{code:'disposed'}})
  const {readFile}=await import('node:fs/promises');expect(JSON.parse(await readFile(join(f.root,'owners-v1',`${f.snapshot.id}.json`),'utf8'))).toMatchObject({detached:true,uncertain:true})
  expect(await f.durableContexts.resolve(f.sessionId)).toMatchObject({state:'bound',revision:2})
 }finally{gate.release();completionGate.release();await Promise.allSettled([pending,completion,disposal]);saveSpy.mockRestore();cleanup.mockRestore();remaining.mockRestore();callback.mockRestore();report.mockRestore();await f.ctx.fiber.dispose();await rm(f.root,{recursive:true,force:true})}
})

it('reports an admitted model commit and its association before provider disposal completes',async()=>{
 const f=await fixture(),entered=barrier(),gate=barrier(),closing=barrier(),store:ResumeStore=Reflect.get(f.service,'store')
 const edit=store.edit.bind(store),dispose=f.editors.dispose.bind(f.editors)
 const spy=vi.spyOn(store,'edit').mockImplementationOnce(async(...args)=>{const receipt=await edit(...args);entered.release();await gate.promise;return receipt})
 const cleanup=vi.spyOn(f.editors,'dispose').mockImplementation(async()=>{closing.release();await dispose()})
 let pending:ReturnType<FastResumeService['edit']>|undefined,disposal:Promise<unknown>|undefined,disposed=false
 try{
  const request={id:f.snapshot.id,expectedRevision:f.snapshot.revision,requestId:'accepted-edit',summary:'Template',operationsJson:JSON.stringify([{type:'template.apply',templateId:'template-classic'}])},execution={sessionId:f.sessionId,callId:brandString<import('../src/host/index.ts').ResumeExecution['callId']>('accepted-call'),signal:new AbortController().signal}
  pending=f.service.edit(request,execution)
  const preparation=await vi.waitFor(async()=>{const value=await f.service.editorPoll(f.snapshot.id,f.owner.token);expect(value).not.toBeNull();return value!})
  await f.service.editorAcknowledge({resumeId:f.snapshot.id,token:f.owner.token,preparationId:preparation.id,revision:f.snapshot.revision,clean:true})
  await entered.promise;disposal=f.fiber.dispose().then(()=>{disposed=true});await closing.promise
  expect((await f.disk.read(f.snapshot.id)).revision).toBe(2);expect(disposed).toBe(false)
  await expect(f.service.edit({...request,requestId:'fresh'},execution)).rejects.toMatchObject({code:'disposed'})
  gate.release();expect(await pending).toMatchObject({receipt:{revision:2},summary:'Template'});await disposal
  expect(await f.durableContexts.resolve(f.sessionId)).toMatchObject({state:'bound',revision:2})
  expect(await f.disk.history(f.snapshot.id)).toMatchObject({changes:[{requestId:'accepted-edit',revision:2}]})
 }finally{gate.release();await Promise.allSettled([pending,disposal]);spy.mockRestore();cleanup.mockRestore();await f.ctx.fiber.dispose();await rm(f.root,{recursive:true,force:true})}
})

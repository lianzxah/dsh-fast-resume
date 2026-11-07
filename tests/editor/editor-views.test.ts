// @vitest-environment jsdom
import {setImmediate as settleTurn} from 'node:timers/promises'
import {afterEach,expect,it,vi} from 'vitest'
import {brandString} from '@deepseek-ai/dsh-brand'
import {PortBridge} from '../../src/editor/bridge.ts'
import type {EditorReadyHandle} from '../../src/client/editor-handoff.ts'
import {EditorViews} from '../../src/client/editor-views.ts'
import {editorDestination,type RetainedEditorHandoff} from '../../src/client/editor-handoff.ts'
import {resumeIdSchema,resumeRevisionSchema} from '../../src/identity.ts'
import type {EditorOwnerId,EditorCheckpointId,EditorTransferId} from '../../src/types.ts'
const connect=vi.hoisted(()=>vi.fn<typeof import('../../src/client/frame.tsx').connectFrame>(()=>()=>{}))
vi.mock('../../src/client/frame.tsx',()=>({connectFrame:connect}))
const instances:EditorViews[]=[],bridges:PortBridge[]=[]
afterEach(()=>{for(const views of instances.splice(0))views.dispose();for(const bridge of bridges.splice(0))bridge.close();sessionStorage.clear();vi.restoreAllMocks();connect.mockReset();connect.mockImplementation(()=>()=>{})})
function pendingEditorViews(...args:ConstructorParameters<typeof EditorViews>){const[assets,dispatch,...rest]=args;return new EditorViews(assets,(method,values,signal)=>method==='editorTransferRead'?Promise.resolve({state:'pending',revision:1,currentRevision:1}):dispatch(method,values,signal),...rest)}
it('requires explicit recovery and retains a fresh designation after cancellation without mounting a late target',async()=>{
 const resumeId=resumeIdSchema.parse(crypto.randomUUID()),handoff:RetainedEditorHandoff={resumeId,revision:resumeRevisionSchema.parse(1),target:editorDestination(brandString<EditorOwnerId>(crypto.randomUUID())),checkpointId:brandString<EditorCheckpointId>(crypto.randomUUID()),transferId:brandString<EditorTransferId>(crypto.randomUUID())}
 const assets={html:'editor',autosaveDelayMs:2000,maxImportBytes:100000,maxDocumentBytes:100000,frameConnectTimeoutMs:15000,bridgeTimeoutMs:45000,rendererPollIntervalMs:1000,wheelZoomDirection:'auto' as const,maxAssistantCheckpointBytes:67108864,editorPollIntervalMs:1000,refreshIntervalMs:2000}
 let finish!:(value:unknown)=>void
 const dispatch=vi.fn(()=>new Promise<unknown>(resolve=>finish=resolve)),views=pendingEditorViews(async()=>assets,dispatch,()=> 'en',sessionStorage,()=> 'Moved')
 instances.push(views);views.retain(handoff)
 const face=views.face({resumeId,source:'conversation'}),error=vi.fn(),frame=document.createElement('iframe')
 let close=face.connect(frame,assets,error)
 await vi.waitFor(()=>expect(error).toHaveBeenCalled());expect(dispatch).not.toHaveBeenCalled();expect(connect).not.toHaveBeenCalled();close()
 close=face.connect(frame,assets,error)
 await vi.waitFor(()=>expect(dispatch).toHaveBeenCalledOnce())
 expect(JSON.parse(sessionStorage.getItem(`fast-resume:handoff:v1:${resumeId}`)!).recoveryTarget).toBeDefined()
 close();finish({revision:1});await Promise.resolve();await Promise.resolve();await Promise.resolve()
 expect(connect).not.toHaveBeenCalled();expect(sessionStorage.getItem(`fast-resume:handoff:v1:${resumeId}`)).not.toBeNull();views.dispose()
})

const assets={html:'editor',autosaveDelayMs:2000,maxImportBytes:100000,maxDocumentBytes:100000,frameConnectTimeoutMs:15000,bridgeTimeoutMs:45000,rendererPollIntervalMs:1000,wheelZoomDirection:'auto' as const,maxAssistantCheckpointBytes:67108864,editorPollIntervalMs:1000,refreshIntervalMs:2000}
function descriptor():RetainedEditorHandoff{return{resumeId:resumeIdSchema.parse(crypto.randomUUID()),revision:resumeRevisionSchema.parse(1),target:editorDestination(brandString<EditorOwnerId>(crypto.randomUUID())),checkpointId:brandString<EditorCheckpointId>(crypto.randomUUID()),transferId:brandString<EditorTransferId>(crypto.randomUUID())}}
function deferred<T>(){let resolve!:(value:T)=>void,reject!:(error:Error)=>void;const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no});return{promise,resolve,reject}}
function mountedHandle(target=editorDestination(brandString<EditorOwnerId>(crypto.randomUUID()))):EditorReadyHandle{
 const bridge=new PortBridge({addEventListener:()=>{},removeEventListener:()=>{},start:()=>{},close:()=>{},postMessage:()=>{}},1000);bridges.push(bridge)
 vi.spyOn(bridge,'call').mockImplementation(async method=>method==='editorLoad'?{revision:1}:true)
 return{...target,bridge}
}
function mountTarget(){connect.mockImplementation((_frame,_assets,_locale,_mode,_dispatch,_report,_renderer,options)=>{options?.onEditorReady?.(mountedHandle(options.identity));return()=>{}})}
it.each(['clear','replace','reject'] as const)('does not resurrect canceled recovery after a newer retry completes and journal is %s',async ending=>{
 const old=descriptor(),late=deferred<unknown>(),dispatch=vi.fn().mockImplementationOnce(()=>late.promise).mockResolvedValue({revision:1})
 const views=pendingEditorViews(async()=>assets,dispatch,()=> 'en',sessionStorage,()=> 'Moved');instances.push(views);views.retain(old);mountTarget()
 const face=views.face({resumeId:old.resumeId,source:'conversation'}),frame=document.createElement('iframe'),report=vi.fn(),key=`fast-resume:handoff:v1:${old.resumeId}`
 const closeInitial=face.connect(frame,assets,report);await vi.waitFor(()=>expect(report).toHaveBeenCalledOnce());closeInitial()
 const closeA=face.connect(frame,assets,report);await vi.waitFor(()=>expect(dispatch).toHaveBeenCalledOnce());closeA()
 face.connect(frame,assets,report);await vi.waitFor(()=>expect(sessionStorage.getItem(key)).toBeNull())
 if(ending!=='clear')views.retain({...descriptor(),resumeId:old.resumeId})
 const expected=sessionStorage.getItem(key)
 try{
  if(ending==='reject')late.reject(Error('Lost recovery reply'));else late.resolve({revision:1})
  // One event-loop turn drains the already-settled Remote continuation and its promise handlers.
  await settleTurn()
  expect(sessionStorage.getItem(key)).toBe(expected);expect(connect).toHaveBeenCalledOnce()
 }finally{late.resolve({revision:1});await settleTurn()}
})
it.each(['different','identical'] as const)('does not remove a newer %s journal record when an older target acknowledges loading',async replacement=>{
 const old=descriptor(),loading=deferred<unknown>(),handle=mountedHandle(old.target)
 vi.spyOn(handle.bridge,'call').mockImplementation(async method=>method==='editorLoad'?loading.promise:true)
 connect.mockImplementation((_f,_a,_l,_m,_d,_e,_r,options)=>{options?.onEditorReady?.(handle);return()=>{}})
 const views=pendingEditorViews(async()=>assets,async()=>null,()=> 'en',sessionStorage,()=> 'Moved');instances.push(views)
 views.face({resumeId:old.resumeId,source:'conversation'},old).connect(document.createElement('iframe'),assets,vi.fn())
 await vi.waitFor(()=>expect(handle.bridge.call).toHaveBeenCalledWith('editorLoad',expect.any(Array),expect.any(AbortSignal)))
 views.retain(replacement==='identical'?old:{...descriptor(),resumeId:old.resumeId})
 const expected=sessionStorage.getItem(`fast-resume:handoff:v1:${old.resumeId}`)
 try{loading.resolve({revision:1});await settleTurn();expect(sessionStorage.getItem(`fast-resume:handoff:v1:${old.resumeId}`)).toBe(expected)}finally{loading.resolve({revision:1});await settleTurn()}
})
it.each(['absent','read-denied'] as const)('opens an ordinary resource without %s journal storage',async mode=>{
 const unavailable:Storage={getItem:()=>{throw new DOMException('Denied','SecurityError')},setItem:()=>{},removeItem:()=>{},clear:()=>{},key:()=>null,length:0}
 const views=pendingEditorViews(async()=>assets,async()=>null,()=> 'en',mode==='absent'?undefined:unavailable,()=> 'Moved');instances.push(views)
 const error=vi.fn();views.face({resumeId:descriptor().resumeId,source:'conversation'}).connect(document.createElement('iframe'),assets,error)
 await vi.waitFor(()=>expect(connect).toHaveBeenCalledOnce());expect(error).not.toHaveBeenCalled()
})
it.each(['read-denied','write-denied','write-ignored'] as const)('keeps a source usable when transfer journal is %s',async mode=>{
 const original=descriptor(),handle=mountedHandle(),released=vi.fn();let fenced=false
 vi.spyOn(handle.bridge,'call').mockImplementation(async method=>{if(method==='editorCapture'){fenced=true;return{revision:1}}if(method==='editorResume')fenced=false;return true})
 connect.mockImplementation((_f,_a,_l,_m,dispatch,_e,_r,options)=>{options?.onEditorReady?.(handle);void dispatch('editorRegister',[{resumeId:original.resumeId,...handle,recoveryPending:false}]);return released})
 const unavailable:Storage={getItem:()=>{if(mode==='read-denied')throw new DOMException('Denied','SecurityError');return null},setItem:()=>{if(mode!=='write-ignored')throw new DOMException('Full','QuotaExceededError')},removeItem:()=>{},clear:()=>{},key:()=>null,length:0}
 const views=pendingEditorViews(async()=>assets,async()=>null,()=> 'en',unavailable,()=> 'Moved');instances.push(views)
 const source=views.face();source.connect(document.createElement('iframe'),assets,vi.fn());await vi.waitFor(()=>expect(views.source(original.resumeId)).toBe(handle))
 const error=vi.fn();views.face({resumeId:original.resumeId,source:'conversation'}).connect(document.createElement('iframe'),assets,error)
 await vi.waitFor(()=>expect(error).toHaveBeenCalledOnce());expect(fenced).toBe(false);expect(released).not.toHaveBeenCalled();expect(views.source(original.resumeId)).toBe(handle);expect(connect).toHaveBeenCalledOnce()
})

it('retains a newer journal and rolls back the source when capture finishes after replacement',async()=>{
 const original=descriptor(),capture=deferred<unknown>(),handle=mountedHandle(),released=vi.fn();let fenced=false
 vi.spyOn(handle.bridge,'call').mockImplementation(async method=>{if(method==='editorCapture'){fenced=true;return capture.promise}if(method==='editorResume')fenced=false;return true})
 connect.mockImplementation((_f,_a,_l,_m,dispatch,_e,_r,options)=>{options?.onEditorReady?.(handle);void dispatch('editorRegister',[{resumeId:original.resumeId,...handle,recoveryPending:false}]);return released})
 const views=pendingEditorViews(async()=>assets,async()=>null,()=> 'en',sessionStorage,()=> 'Moved');instances.push(views)
 views.face().connect(document.createElement('iframe'),assets,vi.fn());await vi.waitFor(()=>expect(views.source(original.resumeId)).toBe(handle))
 const error=vi.fn();views.face({resumeId:original.resumeId,source:'conversation'}).connect(document.createElement('iframe'),assets,error)
 await vi.waitFor(()=>expect(fenced).toBe(true));views.retain({...descriptor(),resumeId:original.resumeId})
 const expected=sessionStorage.getItem(`fast-resume:handoff:v1:${original.resumeId}`)
 try{
  capture.resolve({revision:1});await vi.waitFor(()=>expect(error).toHaveBeenCalledOnce())
  expect(sessionStorage.getItem(`fast-resume:handoff:v1:${original.resumeId}`)).toBe(expected);expect(fenced).toBe(false);expect(released).not.toHaveBeenCalled();expect(connect).toHaveBeenCalledOnce()
 }finally{capture.resolve({revision:1});await settleTurn()}
})

it.each(['same','different'] as const)('a rollback cleanup cannot erase a newer %s retained descriptor generation',async replacement=>{
 const old=descriptor(),views=pendingEditorViews(async()=>assets,async()=>null,()=> 'en',sessionStorage,()=> 'Moved');instances.push(views)
 const clear=views.retain(old);views.retain(replacement==='same'?old:{...descriptor(),resumeId:old.resumeId})
 const key=`fast-resume:handoff:v1:${old.resumeId}`,newer=sessionStorage.getItem(key)
 expect(clear).toThrow('newer recovery record');expect(sessionStorage.getItem(key)).toBe(newer)
})

it('acknowledges an exact installed revision only for the current visible view and clears it on hide/disposal',async()=>{
 const resumeId=descriptor().resumeId,sessionId=brandString<import('@deepseek-ai/dsh-session/types').SessionId>('loaded-session')
 const dispatch=vi.fn(async()=>true),views=pendingEditorViews(async()=>assets,dispatch,()=> 'en',sessionStorage,()=> 'Moved');instances.push(views)
 const face=views.face({resumeId,sessionId,source:'conversation'}),close=face.connect(document.createElement('iframe'),assets,vi.fn())
 await vi.waitFor(()=>expect(connect).toHaveBeenCalledOnce())
 const execute=connect.mock.calls[0]![4]
 expect(views.loadedSnapshot()).toEqual([])
 await execute('editorInstalled',[{resumeId,revision:2}],new AbortController().signal)
 expect(views.loadedSnapshot()).toEqual([{resumeId,sessionId,revision:2}]);expect(dispatch).not.toHaveBeenCalled()
 await expect(execute('editorInstalled',[{resumeId:descriptor().resumeId,revision:2}],new AbortController().signal)).rejects.toThrow()
 face.setVisible(false);expect(views.loadedSnapshot()).toEqual([])
 close();await expect(execute('editorInstalled',[{resumeId,revision:3}],new AbortController().signal)).rejects.toThrow();expect(views.loadedSnapshot()).toEqual([])
})
it('fences conversation saves to the parent-owned Session, current document and view lifetime',async()=>{
 const resumeId=resumeIdSchema.parse(crypto.randomUUID()),sessionId=brandString<import('@deepseek-ai/dsh-session/types').SessionId>('save-session'),dispatch=vi.fn(async()=>true),views=pendingEditorViews(async()=>assets,dispatch,()=> 'en',sessionStorage,()=> 'Moved');instances.push(views)
 const close=views.face({source:'conversation',resumeId,sessionId}).connect(document.createElement('iframe'),assets,vi.fn());await vi.waitFor(()=>expect(connect).toHaveBeenCalledOnce())
 const call=connect.mock.calls[0][4],owner=editorDestination(brandString<EditorOwnerId>(crypto.randomUUID()))
 await call('editorRegister',[{resumeId,ownerId:owner.ownerId,incarnationId:owner.incarnationId,recoveryPending:false}])
 const request={contextSessionId:sessionId,save:{id:resumeId,expectedRevision:1,documentJson:'{}'},token:crypto.randomUUID()}
 await call('saveInSession',[request]);expect(dispatch).toHaveBeenCalledTimes(2)
 await expect(call('saveInSession',[{...request,contextSessionId:'different-session'}])).rejects.toThrow('target differs')
 await expect(call('saveInSession',[{...request,save:{...request.save,id:crypto.randomUUID()}}])).rejects.toThrow('target differs')
 close();await expect(call('saveInSession',[request])).rejects.toThrow();expect(dispatch).toHaveBeenCalledTimes(2)
})
it.each(['new-registration','reconciled'] as const)('keeps the recovered view identity after an older detached response with %s',async ending=>{
 const{MessageChannel}=await import('node:worker_threads'),resumeId=resumeIdSchema.parse(crypto.randomUUID()),sessionId=brandString<import('@deepseek-ai/dsh-session/types').SessionId>('recovered-session'),old=deferred<unknown>(),disconnectEntered=deferred<void>(),token=crypto.randomUUID()
 const dispatch=vi.fn(async(method:string)=>{if(method==='editorDisconnect'){disconnectEntered.resolve();return old.promise}if(method==='editorRegister'||method==='editorReconcile')return{token,uncertain:false};return true})
 const views=pendingEditorViews(async()=>assets,dispatch,()=> 'en',sessionStorage,()=> 'Moved');instances.push(views)
 views.face({source:'conversation',resumeId,sessionId}).connect(document.createElement('iframe'),assets,vi.fn());await vi.waitFor(()=>expect(connect).toHaveBeenCalledOnce())
 const execute=connect.mock.calls[0][4],{port1,port2}=new MessageChannel(),generation=crypto.randomUUID(),parent=new PortBridge(port1,1000,{generation,role:'parent',handle:execute}),child=new PortBridge(port2,1000,{generation,role:'editor',handle:async()=>true});bridges.push(parent,child)
 const registration={resumeId,ownerId:brandString<EditorOwnerId>(crypto.randomUUID()),incarnationId:brandString<import('../../src/types.ts').EditorIncarnationId>(crypto.randomUUID()),recoveryPending:false}
 try{
  await child.call('editorRegister',[registration]);const detached=child.call('editorDisconnect',[resumeId,brandString<import('../../src/types.ts').EditorToken>(token),true]);await disconnectEntered.promise
  if(ending==='new-registration')await child.call('editorRegister',[{...registration,acquisition:'recover'}]);else await child.call('editorReconcile',[{resumeId,token:brandString<import('../../src/types.ts').EditorToken>(token),expectedRevision:resumeRevisionSchema.parse(1)}])
  await child.call('editorInstalled',[{resumeId,revision:resumeRevisionSchema.parse(1)}]);old.resolve(true);await detached
  expect(views.loadedSnapshot()).toEqual([{sessionId,resumeId,revision:1}])
  await expect(child.call('editorInstalled',[{resumeId,revision:resumeRevisionSchema.parse(1)}])).resolves.toBe(true)
  await expect(child.call('saveInSession',[{contextSessionId:sessionId,save:{id:resumeId,expectedRevision:resumeRevisionSchema.parse(1),documentJson:'{}'},token:brandString<import('../../src/types.ts').EditorToken>(token)}])).resolves.toBe(true)
  expect(views.loadedSnapshot()).toEqual([{sessionId,resumeId,revision:1}])
 }finally{old.resolve(true)}
})
it('invalidates loaded evidence without forgetting a still-mounted uncertain editor',async()=>{
 const resumeId=resumeIdSchema.parse(crypto.randomUUID()),sessionId=brandString<import('@deepseek-ai/dsh-session/types').SessionId>('uncertain-session'),views=pendingEditorViews(async()=>assets,async()=>true,()=> 'en',sessionStorage,()=> 'Moved');instances.push(views)
 views.face({source:'conversation',resumeId,sessionId}).connect(document.createElement('iframe'),assets,vi.fn());await vi.waitFor(()=>expect(connect).toHaveBeenCalledOnce());const call=connect.mock.calls[0][4]
 await call('editorInstalled',[{resumeId,revision:1}]);await call('editorDisconnect',[resumeId,crypto.randomUUID()]);expect(views.loadedSnapshot()).toEqual([])
 await expect(call('saveInSession',[{contextSessionId:sessionId,save:{id:resumeId,expectedRevision:1,documentJson:'{}'},token:crypto.randomUUID()}])).resolves.toBe(true)
})

it('routes feedback only to the exact visible Session/document/revision acknowledgement',async()=>{
 const record=descriptor(),handle=mountedHandle(),sessionId=brandString<import('@deepseek-ai/dsh-session/types').SessionId>('feedback-session')
 let dispatch!:import('../../src/client/frame.tsx').Dispatch
 connect.mockImplementation((_f,_a,_l,_m,run,_e,_r,options)=>{dispatch=run;options?.onEditorReady?.(handle);return()=>{}})
 const views=pendingEditorViews(async()=>assets,async()=>true,()=> 'en',undefined,()=> 'Moved');instances.push(views)
 const face=views.face({resumeId:record.resumeId,source:'conversation',sessionId});face.connect(document.createElement('iframe'),assets,vi.fn());await settleTurn()
 await expect(views.feedback(sessionId,record.resumeId,record.revision,['e'])).rejects.toThrow('Exact saved revision')
 await dispatch('editorInstalled',[{resumeId:record.resumeId,revision:record.revision}]);await views.feedback(sessionId,record.resumeId,record.revision,['e'],true)
 expect(handle.bridge.call).toHaveBeenCalledWith('editorFeedback',[{resumeId:record.resumeId,revision:record.revision,ids:['e'],locate:true}])
 await expect(views.feedback(sessionId,record.resumeId,resumeRevisionSchema.parse(2),['e'])).rejects.toThrow('Exact saved revision')
 await Promise.all([views.feedback(sessionId,record.resumeId,record.revision,['e']),views.feedback(sessionId,record.resumeId,record.revision,['e'])]);expect(vi.mocked(handle.bridge.call).mock.calls.filter(([method])=>method==='editorFeedback')).toHaveLength(2)
 face.setVisible(false);await expect(views.feedback(sessionId,record.resumeId,record.revision,['e'])).rejects.toThrow('Exact saved revision')
})


it.each(['unknown','malformed','failed','wrong-revision','pending-newer'] as const)('preserves the retained checkpoint when disposition is %s',async mode=>{
 const old=descriptor(),dispatch=vi.fn(async()=>{if(mode==='failed')throw Error('Read failed');return mode==='unknown'?{state:'unknown'}:mode==='malformed'?{state:'active'}:mode==='wrong-revision'?{state:'active',revision:2,currentRevision:2}:{state:'pending',revision:1,currentRevision:2}})
 const views=new EditorViews(async()=>assets,dispatch,()=> 'en',sessionStorage,()=> 'Moved');instances.push(views);views.retain(old);const key=`fast-resume:handoff:v1:${old.resumeId}`,before=sessionStorage.getItem(key),error=vi.fn(),consumed=vi.fn()
 views.face({resumeId:old.resumeId,source:'conversation'},old,undefined,consumed).connect(document.createElement('iframe'),assets,error)
 await vi.waitFor(()=>expect(error).toHaveBeenCalledOnce());expect(sessionStorage.getItem(key)).toBe(before);expect(connect).not.toHaveBeenCalled();expect(consumed).not.toHaveBeenCalled()
})
it.each(['absent','read-denied'] as const)('never interprets %s storage as a consumed incoming handoff',async mode=>{
 const old=descriptor(),denied:Storage={getItem:()=>{throw Error('Denied')},setItem:()=>{},removeItem:()=>{},clear:()=>{},key:()=>null,length:0},dispatch=vi.fn(async()=>({state:'active',revision:1,currentRevision:2})),views=new EditorViews(async()=>assets,dispatch,()=> 'en',mode==='absent'?undefined:denied,()=> 'Moved');instances.push(views);const error=vi.fn()
 views.face({resumeId:old.resumeId,source:'conversation'},old).connect(document.createElement('iframe'),assets,error);await vi.waitFor(()=>expect(error).toHaveBeenCalledOnce());expect(dispatch).not.toHaveBeenCalled();expect(connect).not.toHaveBeenCalled()
})
it('does not overwrite a newer retained checkpoint with stale incoming navigation',async()=>{
 const old=descriptor(),newer={...descriptor(),resumeId:old.resumeId},dispatch=vi.fn(async()=>({state:'active',revision:1,currentRevision:2})),views=new EditorViews(async()=>assets,dispatch,()=> 'en',sessionStorage,()=> 'Moved');instances.push(views);views.retain(newer)
 const key=`fast-resume:handoff:v1:${old.resumeId}`,before=sessionStorage.getItem(key),error=vi.fn();views.face({resumeId:old.resumeId,source:'conversation'},old).connect(document.createElement('iframe'),assets,error)
 await vi.waitFor(()=>expect(error).toHaveBeenCalledOnce());expect(sessionStorage.getItem(key)).toBe(before);expect(dispatch).not.toHaveBeenCalled();expect(connect).not.toHaveBeenCalled()
})
it.each(['same-journal','new-journal','cancelled'] as const)('a delayed consumed disposition cannot change %s recovery ownership',async ending=>{
 const old=descriptor(),lookup=deferred<unknown>(),dispatch=vi.fn(()=>lookup.promise),views=new EditorViews(async()=>assets,dispatch,()=> 'en',sessionStorage,()=> 'Moved');instances.push(views);views.retain(old)
 const key=`fast-resume:handoff:v1:${old.resumeId}`,error=vi.fn(),consumed=vi.fn(),close=views.face({resumeId:old.resumeId,source:'conversation'},old,undefined,consumed).connect(document.createElement('iframe'),assets,error)
 await vi.waitFor(()=>expect(dispatch).toHaveBeenCalledOnce());if(ending==='cancelled')close();else views.retain(ending==='same-journal'?old:{...descriptor(),resumeId:old.resumeId});const before=sessionStorage.getItem(key)
 lookup.resolve({state:'active',revision:1,currentRevision:2});await settleTurn();expect(sessionStorage.getItem(key)).toBe(before);expect(connect).not.toHaveBeenCalled();expect(consumed).not.toHaveBeenCalled();if(ending==='cancelled')expect(error).not.toHaveBeenCalled();else expect(error).toHaveBeenCalledOnce()
})


it.each(['cancelled','newer-journal'] as const)('retains empty-journal incoming identity on Retry after a %s lookup',async ending=>{
 const old=descriptor(),lookup=deferred<unknown>(),dispatch=vi.fn().mockImplementationOnce(()=>lookup.promise).mockResolvedValue({state:'unknown'}),views=new EditorViews(async()=>assets,dispatch,()=> 'en',sessionStorage,()=> 'Moved');instances.push(views)
 const face=views.face({resumeId:old.resumeId,source:'conversation'},old),error=vi.fn(),frame=document.createElement('iframe'),close=face.connect(frame,assets,error)
 await vi.waitFor(()=>expect(dispatch).toHaveBeenCalledOnce());if(ending==='cancelled')close();else views.retain({...descriptor(),resumeId:old.resumeId});const key=`fast-resume:handoff:v1:${old.resumeId}`,before=sessionStorage.getItem(key)
 lookup.resolve({state:'active',revision:1,currentRevision:2});await settleTurn();close();const previous=error.mock.calls.length
 face.connect(frame,assets,error);await vi.waitFor(()=>expect(error).toHaveBeenCalledTimes(previous+1));expect(connect).not.toHaveBeenCalled();expect(sessionStorage.getItem(key)).toBe(before);expect(dispatch).toHaveBeenCalledTimes(ending==='cancelled'?2:1)
})
it('does not consume newer incoming parameters when an empty-journal old lookup completes after replacement',async()=>{
 const old=descriptor(),newer={...descriptor(),resumeId:old.resumeId},lookup=deferred<unknown>(),dispatch=vi.fn().mockImplementationOnce(()=>lookup.promise).mockResolvedValue({state:'unknown'}),views=new EditorViews(async()=>assets,dispatch,()=> 'en',sessionStorage,()=> 'Moved');instances.push(views)
 const consumed=vi.fn(),error=vi.fn(),frame=document.createElement('iframe'),close=views.face({resumeId:old.resumeId,source:'conversation'},old,undefined,consumed).connect(frame,assets,error)
 await vi.waitFor(()=>expect(dispatch).toHaveBeenCalledOnce());close();const replacement=views.face({resumeId:newer.resumeId,source:'conversation'},newer,undefined,consumed);const closeReplacement=replacement.connect(frame,assets,error)
 await vi.waitFor(()=>expect(error).toHaveBeenCalledOnce());lookup.resolve({state:'active',revision:1,currentRevision:2});await settleTurn();expect(consumed).not.toHaveBeenCalled();expect(connect).not.toHaveBeenCalled();closeReplacement()
 dispatch.mockResolvedValue({state:'pending',revision:1,currentRevision:1});mountTarget();replacement.connect(frame,assets,error);await vi.waitFor(()=>expect(consumed).toHaveBeenCalledWith(newer));expect(consumed).toHaveBeenCalledOnce();expect(connect).toHaveBeenCalledOnce()
 expect(dispatch).toHaveBeenLastCalledWith('editorTransferRead',[{resumeId:newer.resumeId,transferId:newer.transferId,checkpointId:newer.checkpointId}],expect.any(AbortSignal))
})

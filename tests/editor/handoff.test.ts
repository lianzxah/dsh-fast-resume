// @vitest-environment jsdom
const connect=vi.hoisted(()=>vi.fn<typeof import('../../src/client/frame.tsx').connectFrame>(()=>()=>{}))
vi.mock('../../src/client/frame.tsx',async importOriginal=>({...await importOriginal<typeof import('../../src/client/frame.tsx')>(),connectFrame:connect}))
vi.mock('@resume-editor/canvas-engine',()=>({alignBoxes:vi.fn(),distributeBoxes:vi.fn()}))
import React,{act} from 'react'
import {createRoot} from 'react-dom/client'
import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {MessageChannel} from 'node:worker_threads'
import {once} from 'node:events'
import {mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {brandString} from '@deepseek-ai/dsh-brand'
import {ResumeStore,resolveConfig} from '../../src/host/store.ts'
import {TransferFile} from '../../src/host/editor-transfer.ts'
import {EditorCoordinator} from '../../src/host/editor-coordinator.ts'
import {createTextElement} from '../../upstream/canvas-engine/src/element-factory.ts'
import {useEditorStore} from '../../upstream/editor/src/store/editor-store.ts'
import {PortBridge,type BridgeHandler} from '../../src/editor/bridge.ts'
import {createEditorApi} from '../../src/editor/api.ts'
import {SaveCoordinator} from '../../src/editor/persistence.ts'
import {editorHandoff,type HandoffEditor} from '../../src/editor/handoff.ts'
import {requestSchemas} from '../../src/protocol.ts'
import {prepareEditorHandoff,completeEditorHandoff,rollbackEditorHandoff,editorDestination,releaseEditorHandoff,recoverEditorHandoff} from '../../src/client/editor-handoff.ts'
import {captureViewport,restoreViewport} from '../../upstream/editor/src/lib/viewport-handoff.ts'
import type {EditorOwnerId,EditorIncarnationId,ResumeSnapshot} from '../../src/types.ts'
const cleanup:(()=>Promise<unknown>)[]=[]
beforeEach(()=>{useEditorStore.setState(useEditorStore.getInitialState(),true);sessionStorage.clear();connect.mockReset()})
afterEach(async()=>{const failures:unknown[]=[];for(const fn of cleanup.splice(0).reverse())try{await fn()}catch(error){failures.push(error)}if(failures.length)throw new AggregateError(failures,'Fixture cleanup failed')})
function barrier(){let resolve!:()=>void;const promise=new Promise<void>(r=>resolve=r);return{promise,resolve}}
async function fixture(){
 const root=await mkdtemp(join(tmpdir(),'resume-handoff-'));cleanup.push(()=>rm(root,{recursive:true,force:true}))
 const store=new ResumeStore(resolveConfig(root,{})),host=new EditorCoordinator(store);cleanup.push(()=>host.dispose())
 let snapshot=await store.create({title:'Full history'});useEditorStore.getState().setDocument(JSON.parse(snapshot.documentJson));const s=useEditorStore.getState();s.addPage();s.undo();s.redo();s.addElement(createTextElement({id:'selected-page-two',content:'Second page'}),1);s.setZoom(1.4)
 snapshot=await store.save({id:snapshot.id,expectedRevision:snapshot.revision,documentJson:JSON.stringify(useEditorStore.getState().document)});s.markClean()
 const ownerId=brandString<EditorOwnerId>(crypto.randomUUID())
 const dispatch:BridgeHandler=async(method,args)=>{switch(method){
 case 'editorTransferRead':return host.inspect(...requestSchemas.editorTransferRead.parse(args))
 case 'editorRecover':return host.recover(...requestSchemas.editorRecover.parse(args))
 case 'editorDisconnect':return host.disconnect(...requestSchemas.editorDisconnect.parse(args))
 case 'editorRegister':return host.register(...requestSchemas.editorRegister.parse(args))
 case 'editorTransfer':return host.transfer(...requestSchemas.editorTransfer.parse(args))
 case 'editorClaim':return host.claim(...requestSchemas.editorClaim.parse(args))
 case 'editorActivate':return host.activate(...requestSchemas.editorActivate.parse(args))
 case 'editorRollback':return host.rollback(...requestSchemas.editorRollback.parse(args))
 case 'read':return store.read(...requestSchemas.read.parse(args))
 case 'save':{const [r,token]=requestSchemas.save.parse(args);return store.save(r,host.guard(r.id,token))}
 default:throw Error('Unexpected method '+method)
 }}
 function endpoint(identity=editorDestination(ownerId),checkpointId?:import('../../src/types.ts').EditorCheckpointId,source:'conversation'|'space'='conversation',handler:BridgeHandler=dispatch){
  const {port1,port2}=new MessageChannel(),closed=[once(port1,'close'),once(port2,'close')];let api:ReturnType<typeof createEditorApi>
  const parent=new PortBridge(port1,5000,{generation:identity.incarnationId,role:'parent',handle:handler}),child=new PortBridge(port2,5000,{generation:identity.incarnationId,role:'editor',handle:(...args)=>api.receive(...args)})
  const config={nonce:identity.incarnationId,recoveryOwnerId:identity.ownerId,recoveryOwnerPersistent:true,mode:'editor' as const,locale:'en' as const,...store.config,launch:checkpointId?{resumeId:snapshot.id,source,checkpointId}:undefined}
  api=createEditorApi(child,config)
  const c=new SaveCoordinator(snapshot,api.save),life=new AbortController();let fenced=!!checkpointId
  const container=document.createElement('div'),page=document.createElement('div');Object.defineProperties(container,{clientWidth:{value:300},clientHeight:{value:400}});container.scrollLeft=100;container.scrollTop=200;container.getBoundingClientRect=()=>({left:0,top:0} as DOMRect);page.getBoundingClientRect=()=>({left:-100,top:-200} as DOMRect)
  const restore=vi.fn(async(position:Parameters<typeof restoreViewport>[3])=>{restoreViewport(container,page,useEditorStore.getState().viewport.zoom.level,position,true)})
  const options:HandoffEditor={api,coordinator:()=>c,viewport:()=>({capture:()=>captureViewport(container,page,useEditorStore.getState().viewport.zoom.level),restore}),signal:life.signal,blocked:()=>false,begin:()=>{fenced=true},fence:(value:boolean)=>{fenced=value}}
  const remove=api.onHandoff(editorHandoff(options))
  const close=async()=>{life.abort();remove();c.dispose();parent.close();child.close();await Promise.all(closed)}
  cleanup.push(close)
  return{api,c,close,handle:{...identity,bridge:parent},fenced:()=>fenced,restore,options}
 }
 const source=endpoint();await source.api.register(snapshot.id,false)
 return{store,host,snapshot,source,endpoint,dispatch}
}
it('transfers real full history and DOM viewport only after pending backup drains, then enables exactly the target',async()=>{
 const{store,snapshot,source,endpoint}=await fixture(),backup=barrier();
 useEditorStore.setState({ui:{...useEditorStore.getState().ui,leftPanelVisible:true,rightPanelVisible:true,bottomPanelVisible:true}});source.c.trackBackup(backup.promise)
 const targetId=editorDestination(source.handle.ownerId),pending=prepareEditorHandoff(source.handle,targetId,snapshot.id)
 await vi.waitFor(()=>expect(source.fenced()).toBe(true));backup.resolve();const prepared=await pending
 const original=useEditorStore.getState();const expected={past:original.past,future:original.future,history:original.history,page:original.activePageIndex}
 useEditorStore.getState().setDocument(JSON.parse(snapshot.documentJson));useEditorStore.getState().markClean()
 const target=endpoint(targetId,prepared.checkpointId);await completeEditorHandoff(prepared,target.handle)
 expect(source.fenced()).toBe(true);expect(target.fenced()).toBe(false);expect(useEditorStore.getState().ui).toMatchObject({leftPanelVisible:false,rightPanelVisible:false,bottomPanelVisible:false});expect(target.api.pendingHandoff(snapshot.id)).toBe(false);expect(target.restore).toHaveBeenCalledOnce()
 expect(JSON.parse((await new TransferFile(store.config).read(snapshot.id))!.checkpointJson).ui).toMatchObject({leftPanelVisible:true,rightPanelVisible:true,bottomPanelVisible:true})
 const restored=useEditorStore.getState();expect({past:restored.past,future:restored.future,history:restored.history,page:restored.activePageIndex}).toEqual(expected);expect(restored.viewport.scrollX).toBe(100)
 await expect(source.api.save({id:snapshot.id,expectedRevision:snapshot.revision,documentJson:snapshot.documentJson})).rejects.toThrow()
 await target.api.save({id:snapshot.id,expectedRevision:snapshot.revision,documentJson:snapshot.documentJson})
})
it.each(['backup','capture'] as const)('retains source after %s failure without submitting a transfer',async mode=>{
 const{snapshot,source}=await fixture();if(mode==='backup')source.c.trackBackup(Promise.reject(Error('Backup unavailable')));else source.options.viewport=()=>null
 const spy=vi.spyOn(source.api,'transfer');await expect(prepareEditorHandoff(source.handle,editorDestination(source.handle.ownerId),snapshot.id)).rejects.toThrow();expect(spy).not.toHaveBeenCalled();expect(source.fenced()).toBe(false)
 await source.api.save({id:snapshot.id,expectedRevision:snapshot.revision,documentJson:snapshot.documentJson})
})
it('revokes failed target restore and adopts the fresh rollback token in the existing source API',async()=>{
 const{snapshot,source,endpoint}=await fixture(),targetId=editorDestination(source.handle.ownerId),prepared=await prepareEditorHandoff(source.handle,targetId,snapshot.id)
 useEditorStore.getState().setDocument(JSON.parse(snapshot.documentJson));useEditorStore.getState().markClean()
 const target=endpoint(targetId,prepared.checkpointId);target.restore.mockRejectedValue(Error('Hidden canvas'))
 await expect(completeEditorHandoff(prepared,target.handle)).rejects.toThrow('Hidden canvas');expect(source.fenced()).toBe(false);expect(target.fenced()).toBe(true)
 await rollbackEditorHandoff(prepared)
 await source.api.save({id:snapshot.id,expectedRevision:snapshot.revision,documentJson:snapshot.documentJson})
 await expect(target.api.save({id:snapshot.id,expectedRevision:snapshot.revision,documentJson:snapshot.documentJson})).rejects.toThrow()
})
it('serializes cancellation rollback after a delayed transfer acknowledgement',async()=>{
 const{snapshot,source}=await fixture(),gate=barrier(),entered=barrier(),original=source.api.transfer
 vi.spyOn(source.api,'transfer').mockImplementation(async request=>{const result=await original(request);entered.resolve();await gate.promise;return result})
 const abort=new AbortController(),pending=prepareEditorHandoff(source.handle,editorDestination(source.handle.ownerId),snapshot.id,abort.signal),failure=expect(pending).rejects.toThrow()
 await entered.promise;abort.abort();expect(source.fenced()).toBe(true);gate.resolve();await failure;expect(source.fenced()).toBe(false)
 await source.api.save({id:snapshot.id,expectedRevision:snapshot.revision,documentJson:snapshot.documentJson})
})
it('rolls back an activation whose response is lost after the target was authorized',async()=>{
 const{snapshot,source,endpoint,host}=await fixture(),targetId=editorDestination(source.handle.ownerId),prepared=await prepareEditorHandoff(source.handle,targetId,snapshot.id)
 useEditorStore.getState().setDocument(JSON.parse(snapshot.documentJson));useEditorStore.getState().markClean()
 const target=endpoint(targetId,prepared.checkpointId),activate=host.activate.bind(host)
 vi.spyOn(host,'activate').mockImplementation(async request=>{await activate(request);throw Error('Response lost')})
 await expect(completeEditorHandoff(prepared,target.handle)).rejects.toThrow('Response lost')
 expect(source.fenced()).toBe(false);expect(target.fenced()).toBe(true)
 await source.api.save({id:snapshot.id,expectedRevision:snapshot.revision,documentJson:snapshot.documentJson})
 await expect(target.api.save({id:snapshot.id,expectedRevision:snapshot.revision,documentJson:snapshot.documentJson})).rejects.toThrow()
})
it('recovers a source when its designated target closes before loading',async()=>{
 const{snapshot,source,endpoint}=await fixture(),targetId=editorDestination(source.handle.ownerId),prepared=await prepareEditorHandoff(source.handle,targetId,snapshot.id),target=endpoint(targetId,prepared.checkpointId)
 target.handle.bridge.close()
 await expect(completeEditorHandoff(prepared,target.handle)).rejects.toThrow('closed');expect(source.fenced()).toBe(false)
 await source.api.save({id:snapshot.id,expectedRevision:snapshot.revision,documentJson:snapshot.documentJson})
})

it('unmounts the released source before mounting and completing the conversation target',async()=>{
 const{snapshot,source,endpoint}=await fixture(),targetId=editorDestination(source.handle.ownerId),prepared=await prepareEditorHandoff(source.handle,targetId,snapshot.id),retained=releaseEditorHandoff(prepared)
 const original=useEditorStore.getState().past
 await source.api.disconnect(snapshot.id);await source.close()
 useEditorStore.getState().setDocument(JSON.parse(snapshot.documentJson));useEditorStore.getState().markClean()
 const target=endpoint(targetId,retained.checkpointId)
 await completeEditorHandoff(retained,target.handle)
 expect(useEditorStore.getState().past).toEqual(original);expect(target.fenced()).toBe(false)
 await target.api.save({id:snapshot.id,expectedRevision:snapshot.revision,documentJson:snapshot.documentJson})
})
it('remounts a fresh global recovery editor with exact history after the source is gone and target restore fails',async()=>{
 const{snapshot,source,endpoint,dispatch}=await fixture(),targetId=editorDestination(source.handle.ownerId),prepared=await prepareEditorHandoff(source.handle,targetId,snapshot.id),retained=releaseEditorHandoff(prepared)
 const state=useEditorStore.getState(),history={past:state.past,future:state.future,history:state.history}
 await source.api.disconnect(snapshot.id);await source.close()
 useEditorStore.getState().setDocument(JSON.parse(snapshot.documentJson));useEditorStore.getState().markClean()
 const target=endpoint(targetId,retained.checkpointId);target.restore.mockRejectedValue(Error('Hidden target'))
 await expect(completeEditorHandoff(retained,target.handle)).rejects.toMatchObject({code:'editor-handoff-recovery',handoff:retained})
 const recoveryIdentity=editorDestination(retained.target.ownerId),recovery=await recoverEditorHandoff(retained,recoveryIdentity,(method,args,signal)=>dispatch(method,args,signal??new AbortController().signal))
 await target.close();useEditorStore.getState().setDocument(JSON.parse(snapshot.documentJson));useEditorStore.getState().markClean()
 const global=endpoint(recoveryIdentity,recovery.checkpointId)
 await completeEditorHandoff(recovery,global.handle)
 const restored=useEditorStore.getState();expect({past:restored.past,future:restored.future,history:restored.history}).toEqual(history)
 await global.api.save({id:snapshot.id,expectedRevision:snapshot.revision,documentJson:snapshot.documentJson})
})

it.each(['active','rolledback'] as const)('recovers a failed subsequent handoff while retaining an %s completed checkpoint',async phase=>{
 const{snapshot,source,endpoint,store}=await fixture(),targetId=editorDestination(source.handle.ownerId),first=await prepareEditorHandoff(source.handle,targetId,snapshot.id)
 let current=source
 if(phase==='active'){
  current=endpoint(targetId,first.checkpointId);await completeEditorHandoff(first,current.handle)
 }else await rollbackEditorHandoff(first)
 const history=useEditorStore.getState().history
 const replacement=vi.spyOn(TransferFile.prototype,'write').mockRejectedValueOnce(Object.assign(Error('No space left'),{code:'ENOSPC'}))
 try{
  await expect(prepareEditorHandoff(current.handle,editorDestination(current.handle.ownerId),snapshot.id)).rejects.toThrow()
  expect(current.fenced()).toBe(false);expect(replacement).toHaveBeenCalledOnce()
 }finally{replacement.mockRestore()}
 expect(useEditorStore.getState().history).toEqual(history)
 await current.c.flush('Recovered source')
 expect((await store.read(snapshot.id)).revision).toBe(snapshot.revision+1)
 const next=await prepareEditorHandoff(current.handle,editorDestination(current.handle.ownerId),snapshot.id)
 expect(next.revision).toBe(snapshot.revision+1);await rollbackEditorHandoff(next);expect(current.fenced()).toBe(false)
})

it.each(['known','unknown'] as const)('explicitly recovers the selected global resume after its real source port closes during %s Session creation',async outcome=>{
 const {store,snapshot,source,endpoint,dispatch}=await fixture()
 const {SessionContextStore}=await import('../../src/host/session-context.ts'),{AssistantEntry,SessionHandoff}=await import('../../src/client/session-handoff.ts'),{EditorViews}=await import('../../src/client/editor-views.ts')
 const contexts=new SessionContextStore(store),creating=barrier(),response=barrier(),life=new AbortController(),canonical=brandString<import('@deepseek-ai/dsh-session/types').SessionId>('canonical')
 const create=vi.fn(async()=>{creating.resolve();await response.promise;if(outcome==='unknown')throw Error('Reply lost');return{sessionId:canonical}})
 const flow=new SessionHandoff({workspace:async()=>brandString<import('../../src/types.ts').AssistantWorkspaceId>('workspace'),begin:r=>contexts.beginAssistantHandoff(r),read:r=>contexts.readAssistantHandoff(r),record:r=>contexts.recordAssistantSession(r),bind:r=>contexts.bind(r),create,lookup:async()=>false})
 const assets={html:'',...store.config},fixtureLife=new AbortController()
 const views:import('../../src/client/editor-views.ts').EditorViews=new EditorViews(async()=>assets,(method,args,signal)=>dispatch(method,args,signal??fixtureLife.signal),()=> 'en',sessionStorage,()=> 'Moved',undefined,(launch,handoff,signal)=>entry.ready(launch,handoff,signal));cleanup.push(async()=>{views.dispose();fixtureLife.abort()})
 let liveSource=source.handle
 const entry:import('../../src/client/session-handoff.ts').AssistantEntry=new AssistantEntry(flow,()=>({source:()=>liveSource,retain:h=>views.retain(h)}),sessionStorage,()=>{},async()=>{})
 const state=useEditorStore.getState();state.applyDocumentTransform(d=>({...d,metadata:{...d.metadata,title:'Future edit'}}));state.undo();state.setActivePage(1);state.selectElement('selected-page-two');state.markClean()
 const original=useEditorStore.getState(),expected={past:original.past,future:original.future,history:original.history,page:original.activePageIndex,selection:original.selection}
 expect(expected.past.length).toBeGreaterThan(0);expect(expected.future.length).toBeGreaterThan(0)
 const pending=entry.open(snapshot.id,undefined,life.signal),failure=expect(pending).rejects.toThrow()
 await creating.promise;await source.close();life.abort();response.resolve();await failure
 const key=`fast-resume:handoff:v1:${snapshot.id}`,requestKey=`fast-resume:assistant-entry:v1:${snapshot.id}`,requestId=sessionStorage.getItem(requestKey)
 expect(sessionStorage.getItem(key)).not.toBeNull();expect(requestId).not.toBeNull()
 // Mount a fresh global frame: ordinary registration must fail, and only its explicit recovery action may revoke the abandoned target.
 useEditorStore.getState().setDocument(JSON.parse(snapshot.documentJson));useEditorStore.getState().markClean()
 const mounted:ReturnType<typeof endpoint>[]=[],launches:(import('../../src/types.ts').EditorLaunch|undefined)[]=[]
 connect.mockImplementation((_frame,_assets,_locale,_mode,execute,_report,_renderer,options)=>{
  const peer=endpoint(options?.identity,options?.launch?.checkpointId,options?.launch?.source,(method,args,signal)=>execute(method,args,signal))
  mounted.push(peer);launches.push(options?.launch);options?.onEditorReady?.(peer.handle)
  return()=>{void peer.close()}
 })
 const report=vi.fn(),face=views.face(),close=face.connect(document.createElement('iframe'),assets,report);cleanup.push(async()=>close())
 await vi.waitFor(()=>expect(mounted).toHaveLength(1));const reopened=mounted[0]!
 await expect(reopened.api.register(snapshot.id,false)).rejects.toThrow()
 expect(sessionStorage.getItem(key)).not.toBeNull();expect(mounted).toHaveLength(1)
 // The old port deliberately closes before this reply; the replacement is owned by the same face cleanup.
 const recoveryReply=reopened.api.recoverView(snapshot.id).catch(()=>false)
 await vi.waitFor(()=>expect(mounted).toHaveLength(2));await recoveryReply
 await vi.waitFor(()=>expect(sessionStorage.getItem(key)).toBeNull())
 expect(report).not.toHaveBeenCalled();expect(launches[1]).toMatchObject({resumeId:snapshot.id,source:'space'})
 expect(sessionStorage.getItem(requestKey)).toBe(requestId)
 const restored=useEditorStore.getState();expect({past:restored.past,future:restored.future,history:restored.history,page:restored.activePageIndex,selection:restored.selection}).toEqual(expected)
 const recovered=mounted[1]!;liveSource=recovered.handle
 await recovered.c.flush('Recovered source');expect((await store.read(snapshot.id)).revision).toBe(snapshot.revision+1)
 // A reopened source keeps the same admitted entry: known response binds it; unknown response is never replayed.
 if(outcome==='known'){
  const saved=await contexts.readAssistantHandoff({requestId:brandString<import('../../src/types.ts').AssistantHandoffId>(requestId!)})
  expect(saved?.sessionId).toBe(canonical)
 }
 const next=new AbortController(),retry=entry.open(snapshot.id,undefined,next.signal)
 if(outcome==='known')await expect(retry).resolves.toBe(true);else await expect(retry).rejects.toThrow('unconfirmed')
 expect(create).toHaveBeenCalledOnce();close()
 await expect(recovered.handle.bridge.call('editorVisibility',[true])).rejects.toThrow('closed')
})

it('preserves the completed real history and frame when the same Session resource is revealed without handoff params',async()=>{
 const {store,snapshot,source,endpoint,dispatch}=await fixture(),{EditorViews}=await import('../../src/client/editor-views.ts'),{ResumeTab}=await import('../../src/client/resume-tab.tsx'),{resumeAddress}=await import('../../src/client/resume-resource.ts')
 const state=useEditorStore.getState();state.applyDocumentTransform(d=>({...d,metadata:{...d.metadata,title:'Future title'}}));state.undo();state.markClean()
 const expected={past:useEditorStore.getState().past,future:useEditorStore.getState().future}
 const prepared=await prepareEditorHandoff(source.handle,editorDestination(source.handle.ownerId),snapshot.id),handoff=releaseEditorHandoff(prepared)
 await source.close();useEditorStore.getState().setDocument(JSON.parse(snapshot.documentJson));useEditorStore.getState().markClean()
 const life=new AbortController(),assets={html:'',...store.config},views=new EditorViews(async()=>assets,(method,args,signal)=>dispatch(method,args,signal??life.signal),()=> 'en',sessionStorage,()=> 'Moved')
 cleanup.push(async()=>{views.dispose();life.abort()})
 const peers:ReturnType<typeof endpoint>[]=[]
 connect.mockImplementation((_f,_a,_l,_m,execute,_e,_r,options)=>{const peer=endpoint(options?.identity,options?.launch?.checkpointId,options?.launch?.source,(method,args,signal)=>execute(method,args,signal));peers.push(peer);options?.onEditorReady?.(peer.handle);return()=>{void peer.close()}})
 const sessionId=brandString<import('@deepseek-ai/dsh-session/types').SessionId>('bound-session'),container=document.createElement('div');document.body.append(container);const root=createRoot(container)
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);cleanup.push(async()=>{await act(async()=>root.unmount());container.remove();vi.unstubAllGlobals()})
 const info:ReturnType<import('../../src/client/resume-tab.tsx').ResumeTabProps['useTabInfo']>={sidebar:{expanded:true,fullscreen:false},panel:{id:brandString<import('@deepseek-ai/dsh-client-ui-sidebar-right/client').PaneId>('pane')},tab:{id:brandString<import('@deepseek-ai/dsh-client-ui-sidebar-right/client').TabId>('tab'),kind:'fast-resume.document',title:'Resume',contentId:resumeAddress(snapshot.id),visible:true,navigation:{address:resumeAddress(snapshot.id),params:{fastResume:{handoff}},revision:1},signal:life.signal,actions:{bindCommands:()=>()=>{},openResource:()=>{},openTab:()=>{},close:()=>{}}}}
 const props:import('../../src/client/resume-tab.tsx').ResumeTabProps={sessionId,useTabInfo:()=>info,views,library:()=>{},t:key=>key}
 await act(async()=>root.render(React.createElement(ResumeTab,props)))
 await act(async()=>{await vi.waitFor(()=>{expect(peers).toHaveLength(1);expect(peers[0]!.fenced()).toBe(false);expect(sessionStorage.getItem(`fast-resume:handoff:v1:${snapshot.id}`)).toBeNull()})})
 const frame=container.querySelector('iframe'),peer=peers[0]!
 expect({past:useEditorStore.getState().past,future:useEditorStore.getState().future}).toEqual(expected)
 const revealed={...info,tab:{...info.tab,navigation:{...info.tab.navigation,params:undefined,revision:2}}}
 await act(async()=>root.render(React.createElement(ResumeTab,{...props,useTabInfo:()=>revealed})))
 expect(container.querySelector('iframe')).toBe(frame);expect(peers).toHaveLength(1);await expect(peer.handle.bridge.call('editorVisibility',[true])).resolves.toBe(true)
 useEditorStore.getState().redo();expect(useEditorStore.getState().document.metadata.title).toBe('Future title');useEditorStore.getState().undo();expect(useEditorStore.getState().document.metadata.title).toBe(snapshot.title)
 await peer.c.flush('Same resource after reveal');expect((await store.read(snapshot.id)).revision).toBe(snapshot.revision+1)
})

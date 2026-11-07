// @vitest-environment jsdom
import React,{act,useSyncExternalStore} from 'react'
import * as jsx from 'react/jsx-runtime'
import * as ReactDOM from 'react-dom'
import * as dock from '@deepseek-ai/dsh-client-ui-dockkit'
import * as stores from '@deepseek-ai/dsh-client-store'
import * as zod from 'zod'
import {Context} from '@deepseek-ai/cordis'
import {brandString} from '@deepseek-ai/dsh-brand'
import type {SessionId} from '@deepseek-ai/dsh-session/types'
import type * as SidebarService from '../../node_modules/@deepseek-ai/dsh-client-ui-sidebar-right/lib/types/client/service.js'
import type * as SidebarStore from '../../node_modules/@deepseek-ai/dsh-client-ui-sidebar-right/lib/types/client/stores.js'
import type * as SidebarRegistry from '../../node_modules/@deepseek-ai/dsh-client-ui-sidebar-right/lib/types/client/tab-registry.js'
import type * as TabInfo from '../../node_modules/@deepseek-ai/dsh-client-ui-sidebar-right/lib/types/client/tab-info.js'
import {ResumeTab,revealResume} from '../../src/client/resume-tab.tsx'
import {createRoot,type Root} from 'react-dom/client'
import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {MessageChannel,MessagePort as NodeMessagePort} from 'node:worker_threads'
import {once} from 'node:events'
import {mkdtemp,rm,readFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {App} from '../../src/editor/app.tsx'
import {EditorSurface} from '../../src/client/frame.tsx'
import {EditorViews} from '../../src/client/editor-views.ts'
import {ResumeStore,resolveConfig} from '../../src/host/store.ts'
import {EditorCoordinator} from '../../src/host/editor-coordinator.ts'
import {TransferFile} from '../../src/host/editor-transfer.ts'
import {createEditorApi} from '../../src/editor/api.ts'
import {PortBridge,type BridgeHandler} from '../../src/editor/bridge.ts'
import {bootstrapSchema,requestSchemas,type Bootstrap} from '../../src/protocol.ts'
import {prepareEditorHandoff,releaseEditorHandoff,editorDestination,type RetainedEditorHandoff} from '../../src/client/editor-handoff.ts'
import {useEditorStore} from '../../upstream/editor/src/store/editor-store.ts'
import {createTextElement} from '../../upstream/canvas-engine/src/element-factory.ts'
import {triggerManualSave} from '../../upstream/editor/src/lib/save-bus.ts'
import type {ViewportHandle} from '../../upstream/editor/src/lib/viewport-handoff.ts'
vi.mock('@deepseek-ai/dsh-client-ui-primitives',()=>({Tooltip:({children}:{children:React.ReactNode})=>children,IconCloseFillRegular:()=>null,IconCloseOutlineRegular:()=>null,IconPanelLeftOutlineRegular:()=>null,IconPlusOutlineRegular:()=>null,MenuSurface:()=>null,focusWithoutRing:(element:HTMLElement)=>element.focus(),modalSelector:'[role=dialog]',observeComposition:()=>()=>{}}))
vi.mock('../../src/editor/workspace-panels.tsx',()=>({WorkspacePanels:({onViewport}:{onViewport?:(handle:ViewportHandle|null)=>void})=>{React.useLayoutEffect(()=>{onViewport?.({capture:()=>({scrollX:10,scrollY:20}),restore:async()=>{}});return()=>onViewport?.(null)},[onViewport]);return React.createElement('div',{'data-testid':'canvas'})}}))
vi.mock('../../src/editor/thumbnail.ts',()=>({renderThumbnail:vi.fn(),renderSavedPage:vi.fn()}))
vi.mock('@resume-editor/canvas-engine',()=>({alignBoxes:vi.fn(),distributeBoxes:vi.fn()}))
const cleanup:(()=>Promise<unknown>)[]=[]
let visibleAttribute:string|undefined
beforeEach(()=>{visibleAttribute=document.documentElement.dataset.editorVisible;useEditorStore.setState(useEditorStore.getInitialState(),true);sessionStorage.clear();vi.stubGlobal('IntersectionObserver',class{observe(){}disconnect(){}})})
afterEach(async()=>{const failures:unknown[]=[];for(const fn of cleanup.splice(0).reverse())try{await fn()}catch(error){failures.push(error)}vi.restoreAllMocks();vi.unstubAllGlobals();if(visibleAttribute===undefined)delete document.documentElement.dataset.editorVisible;else document.documentElement.dataset.editorVisible=visibleAttribute;sessionStorage.clear();document.body.replaceChildren();useEditorStore.setState(useEditorStore.getInitialState(),true);if(failures.length)throw new AggregateError(failures,'Fixture cleanup failed')})

async function until(check:()=>unknown|Promise<unknown>){await vi.waitFor(check)}
async function rendered(work:()=>void|Promise<void>){const runtime=globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean},previous=Object.getOwnPropertyDescriptor(runtime,'IS_REACT_ACT_ENVIRONMENT');runtime.IS_REACT_ACT_ENVIRONMENT=true;try{await act(work)}finally{if(previous===undefined)delete runtime.IS_REACT_ACT_ENVIRONMENT;else Object.defineProperty(runtime,'IS_REACT_ACT_ENVIRONMENT',previous)}}
function click(label:string){const button=[...document.querySelectorAll('button')].find(b=>b.textContent===label);if(!button)throw Error('Missing button '+label);button.click()}

async function mountedEditorFixture(hooks:{afterPoll?:()=>Promise<void>;afterActivate?:()=>Promise<void>;afterDisconnect?:()=>Promise<void>;beforeDisconnect?:(detached:boolean)=>Promise<void>;inspect?:()=>Promise<unknown>}={}){
 const directory=await mkdtemp(join(tmpdir(),'resume-global-recovery-'));cleanup.push(()=>rm(directory,{recursive:true,force:true}))
 const store=new ResumeStore(resolveConfig(directory,{editorPollIntervalMs:25,editorLeaseMs:10000,refreshIntervalMs:60000,autosaveDelayMs:60000})),host=new EditorCoordinator(store);cleanup.push(()=>host.dispose())
 const first=await store.create({title:'Recovery fixture'}),calls:{method:string;args:unknown[]}[]=[],completed:string[]=[],inFlight=new Set<Promise<unknown>>()
 cleanup.push(async()=>{await Promise.allSettled(inFlight)})
 const execute:BridgeHandler=async(method,args)=>{switch(method){
 case 'list':return store.list()
 case 'read':return store.read(...requestSchemas.read.parse(args))
 case 'recoveryRead':return []
 case 'recoveryWrite':case 'recoveryRemove':return true
 case 'editorRegister':return host.register(...requestSchemas.editorRegister.parse(args))
 case 'editorDisconnect':{const request=requestSchemas.editorDisconnect.parse(args);await hooks.beforeDisconnect?.(request[2]??false);const result=await host.disconnect(...request);await hooks.afterDisconnect?.();return result}
 case 'editorTransfer':return host.transfer(...requestSchemas.editorTransfer.parse(args))
 case 'editorTransferRead':if(hooks.inspect)return hooks.inspect();return host.inspect(...requestSchemas.editorTransferRead.parse(args))
 case 'editorRecover':return host.recover(...requestSchemas.editorRecover.parse(args))
 case 'editorClaim':return host.claim(...requestSchemas.editorClaim.parse(args))
 case 'editorActivate':{const result=await host.activate(...requestSchemas.editorActivate.parse(args));await hooks.afterActivate?.();return result}
 case 'editorRollback':return host.rollback(...requestSchemas.editorRollback.parse(args))
 case 'editorPoll':try{return await host.poll(...requestSchemas.editorPoll.parse(args))}finally{await hooks.afterPoll?.()}
 case 'editorReconcile':return host.reconcile(...requestSchemas.editorReconcile.parse(args))
 case 'editorAcknowledge':return host.acknowledge(...requestSchemas.editorAcknowledge.parse(args))
 case 'saveInSession':{const [request]=requestSchemas.saveInSession.parse(args);return{snapshot:await store.save(request.save,host.guard(request.save.id,request.token)),association:'bound'}}
 case 'save':{const [request,token]=requestSchemas.save.parse(args);return store.save(request,host.guard(request.id,token))}
 default:throw Error('Unexpected request '+method)
 }}
 const dispatch:BridgeHandler=(method,args,signal)=>{calls.push({method,args});const pending=execute(method,args,signal);inFlight.add(pending);void pending.then(()=>{completed.push(method);inFlight.delete(pending)},()=>inFlight.delete(pending));return pending}
 const assets={...store.config,html:'<script>window.__FAST_RESUME_BOOTSTRAP__="__FAST_RESUME_BOOTSTRAP__"</script>'},lifetime=new AbortController(),views=new EditorViews(async()=>assets,(method,args,signal)=>dispatch(method,args,signal??lifetime.signal),()=> 'en',sessionStorage,()=> 'Moved')
 cleanup.push(async()=>{views.dispose();lifetime.abort()})
 // jsdom's iframe adapter supplies srcdoc execution, pagehide and port transfer; the actual Surface, connectFrame, App and bridges own the lifecycle.
 const apis:ReturnType<typeof createEditorApi>[]=[],children=new Map<HTMLIFrameElement,{root:Root;node:HTMLDivElement;bridge?:PortBridge}>(),boots:Bootstrap[]=[],portsClosed:Promise<unknown>[]=[]
 vi.stubGlobal('MessageChannel',class extends MessageChannel{constructor(){super();portsClosed.push(once(this.port1,'close'),once(this.port2,'close'))}})
 const srcdoc=Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype,'srcdoc')!
 vi.spyOn(HTMLIFrameElement.prototype,'srcdoc','set').mockImplementation(function(this:HTMLIFrameElement,value:string){
  const old=children.get(this);if(old){queueMicrotask(()=>{old.root.unmount();old.bridge?.close();old.node.remove()});children.delete(this)}
  srcdoc.set!.call(this,value)
  if(!value)return
  const config=bootstrapSchema.parse(JSON.parse(value.slice(value.indexOf('=')+1,value.indexOf('</script>'))));boots.push(config)
  const node=document.createElement('div');document.body.append(node);const child={root:createRoot(node),node,bridge:undefined as PortBridge|undefined};children.set(this,child)
  vi.spyOn(this.contentWindow!,'postMessage').mockImplementation((message:unknown,_origin:unknown,transfer?:Transferable[])=>{
   const port=transfer?.[0];if(!(port instanceof NodeMessagePort))throw Error('Missing transferred fixture port')
   let api:ReturnType<typeof createEditorApi>;child.bridge=new PortBridge(port,5000,{generation:config.nonce,role:'editor',handle:(...args)=>api.receive(...args)});api=createEditorApi(child.bridge,config);apis.push(api);child.root.render(React.createElement(App,{api}))
  })
  queueMicrotask(()=>{window.dispatchEvent(new MessageEvent('message',{source:this.contentWindow,data:{kind:'fast-resume-ready',nonce:config.nonce}}));this.dispatchEvent(new Event('load'))})
 })
 cleanup.push(async()=>{for(const child of children.values()){child.root.unmount();child.bridge?.close();child.node.remove()}children.clear();await Promise.all(portsClosed)})
 const waitForDetached=async()=>{const incarnationId=boots.at(-1)!.nonce;await until(async()=>expect(JSON.parse(await readFile(join(store.config.storageDir,'owners-v1',first.id+'.json'),'utf8'))).toMatchObject({incarnationId,detached:true}))}
 return{store,host,first,calls,completed,inFlight,views,boots,apis,waitForDetached}
}

it('restores the checkpoint once through mounted global Surface and App after the source frame closes',async()=>{
 const {store,first,calls,completed,views,boots}=await mountedEditorFixture()
 const container=document.createElement('div');document.body.append(container);let root=createRoot(container)
 cleanup.push(async()=>{root.unmount();container.remove()})
 const face=views.face();root.render(React.createElement(EditorSurface,{...face,t:key=>key}))
 await until(()=>expect([...document.querySelectorAll('button')].some(b=>b.textContent==='Recovery fixture')).toBe(true))
 click('Recovery fixture')
 await until(()=>expect(document.querySelector('[data-testid=canvas]')).not.toBeNull())
 const state=useEditorStore.getState();state.addPage();state.addElement(createTextElement({id:'page-two-selection',content:'Selected text'}),1);triggerManualSave()
 await until(async()=>expect((await store.read(first.id)).revision).toBe(2))
 state.applyDocumentTransform(d=>({...d,metadata:{...d.metadata,title:'Future title'}}));state.undo();triggerManualSave()
 await until(()=>expect(useEditorStore.getState().isDirty).toBe(false))
 state.setActivePage(1);state.selectElement('page-two-selection')
 const original=useEditorStore.getState(),expected={past:original.past,future:original.future,page:original.activePageIndex,selection:original.selection,history:original.history,historyIndex:original.historyIndex,fitMode:original.fitMode}
 const source=views.source(first.id)!,retained=releaseEditorHandoff(await prepareEditorHandoff(source,editorDestination(source.ownerId),first.id));views.retain(retained)
 expect(expected.past.length).toBeGreaterThan(0);expect(expected.future.length).toBeGreaterThan(0)
 root.unmount();root=createRoot(container)
 root.render(React.createElement(EditorSurface,{...views.face(),t:key=>key}))
 await until(()=>expect([...document.querySelectorAll('button')].some(b=>b.textContent==='Recovery fixture')).toBe(true))
 click('Recovery fixture')
 await until(()=>expect([...document.querySelectorAll('button')].some(b=>b.textContent==='Recover editor')).toBe(true))
 click('Recover editor')
 await until(()=>expect(sessionStorage.getItem(`fast-resume:handoff:v1:${first.id}`)).toBeNull())
 const activation=completed.lastIndexOf('editorActivate');expect(activation).toBeGreaterThanOrEqual(0)
 await until(()=>expect(completed.slice(activation+1)).toContain('editorPoll'))
 const restored=useEditorStore.getState();expect({past:restored.past,future:restored.future,page:restored.activePageIndex,selection:restored.selection,history:restored.history,historyIndex:restored.historyIndex,fitMode:restored.fitMode}).toEqual(expected)
 expect(restored.viewport).toMatchObject({scrollX:10,scrollY:20})
 expect(boots).toHaveLength(3);expect(calls.filter(c=>c.method==='editorRegister')).toHaveLength(2)
 const transfer=await new TransferFile(store.config).read(first.id);expect(transfer?.phase).toBe('active');expect(boots.at(-1)?.nonce).toBe(transfer?.targetIncarnationId)
 expect(document.body.textContent).not.toContain('Acknowledge saved revision')
 state.redo();triggerManualSave()
 await until(async()=>expect((await store.read(first.id)).title).toBe('Future title'))
 await until(async()=>expect(views.loadedSnapshot()).toEqual([{sessionId:undefined,resumeId:first.id,revision:(await store.read(first.id)).revision}]))
})

it.each(['ownership','missing','read','transport','malformed','registration-storage'] as const)('classifies %s startup failure without unrelated ownership recovery',async mode=>{
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true)
 const directory=await mkdtemp(join(tmpdir(),'resume-startup-'));cleanup.push(()=>rm(directory,{recursive:true,force:true}))
 const store=new ResumeStore(resolveConfig(directory,{editorPollIntervalMs:25,editorLeaseMs:10000,refreshIntervalMs:60000,autosaveDelayMs:60000})),host=new EditorCoordinator(store);cleanup.push(()=>host.dispose())
 const snapshot=await store.create({title:'Startup fixture'})
 const {brandString}=await import('@deepseek-ai/dsh-brand'),{ResumeError}=await import('../../src/host/errors.ts')
 if(mode==='missing')await store.remove(snapshot.id,snapshot.revision)
 if(mode==='ownership')await host.register({resumeId:snapshot.id,ownerId:brandString<import('../../src/types.ts').EditorOwnerId>(crypto.randomUUID()),incarnationId:brandString<import('../../src/types.ts').EditorIncarnationId>(crypto.randomUUID()),recoveryPending:false})
 const channel=new MessageChannel(),closed=[once(channel.port1,'close'),once(channel.port2,'close')],nonce=crypto.randomUUID(),registration=vi.fn(async(args:unknown[])=>{if(mode==='registration-storage')throw new ResumeError('storage-failure','Fixture storage failure');return host.register(...requestSchemas.editorRegister.parse(args))})
 const parent=new PortBridge(channel.port1,5000,{generation:nonce,role:'parent',handle:async(method,args)=>{switch(method){
 case 'read':if(mode==='read')throw new ResumeError('storage-failure','Fixture read failure');if(mode==='malformed')return{...snapshot,documentJson:'{'};return store.read(...requestSchemas.read.parse(args))
 case 'recoveryRead':return []
 case 'editorRegister':return registration(args)
 case 'editorDisconnect':return host.disconnect(...requestSchemas.editorDisconnect.parse(args))
 default:throw Error('Unexpected startup request '+method)
 }}})
 let api:ReturnType<typeof createEditorApi>;const editor=new PortBridge(channel.port2,5000,{generation:nonce,role:'editor',handle:(...args)=>api.receive(...args)})
 api=createEditorApi(editor,{...store.config,nonce,recoveryOwnerId:crypto.randomUUID(),recoveryOwnerPersistent:true,mode:'editor',locale:'en',launch:{resumeId:snapshot.id,source:'space'}})
 if(mode==='transport')editor.close('Fixture transport closed')
 cleanup.push(async()=>{parent.close();editor.close();await Promise.all(closed)})
 const pending=new Set<Promise<unknown>>(),track=<T,>(promise:Promise<T>)=>{pending.add(promise);void promise.then(()=>pending.delete(promise),()=>pending.delete(promise));return promise}
 const observed={...api,read:(...args:Parameters<typeof api.read>)=>track(api.read(...args)),recovery:(...args:Parameters<typeof api.recovery>)=>track(api.recovery(...args)),register:(...args:Parameters<typeof api.register>)=>track(api.register(...args))}
 const container=document.createElement('div');document.body.append(container);const root=createRoot(container);cleanup.push(async()=>{await React.act(async()=>root.unmount());await Promise.allSettled(pending)})
 await React.act(async()=>root.render(React.createElement(App,{api:observed})));do{await React.act(async()=>{await Promise.allSettled([...pending])})}while(pending.size)
 const buttons=[...document.querySelectorAll('button')].map(b=>b.textContent)
 expect(buttons).toContain('Retry');expect(buttons).toContain('Resume space');expect(document.body.textContent).not.toContain('Loading…')
 if(mode==='ownership'){expect(buttons).toContain('Recover editor');expect(document.body.textContent).toContain('Another editor may hold unsaved work');expect(registration).toHaveBeenCalledOnce()}
 else{expect(buttons).not.toContain('Recover editor');expect(document.body.textContent).not.toContain('Another editor may hold unsaved work');expect(document.body.textContent).toContain(mode==='missing'?'This resume is unavailable':'The saved resume could not be loaded');expect(document.body.textContent).not.toContain('Fixture');expect(registration).toHaveBeenCalledTimes(mode==='registration-storage'?1:0)}
})

async function publicResumeTab(id:import('../../src/types.ts').ResumeId,handoff?:RetainedEditorHandoff){
 const dependencies:Record<string,unknown>={'react':React,'react/jsx-runtime':jsx,'react-dom':ReactDOM,'zod':zod,'@deepseek-ai/dsh-client-ui-dockkit':dock,'@deepseek-ai/dsh-client-store':stores,'@deepseek-ai/dsh-client-ui-primitives':{}}
 type Published={createSidebarRightController:typeof SidebarService.createSidebarRightController;createSidebarRightStore:typeof SidebarStore.createSidebarRightStore;SidebarRightTabRegistry:typeof SidebarRegistry.SidebarRightTabRegistry;bindTabInfo:(sessionId:SessionId,context:TabInfo.TabHookContext)=>ReturnType<typeof TabInfo.tabInfoFactory>}
 let published:Published|undefined
 const bundle=await readFile('node_modules/@deepseek-ai/dsh-client-ui-sidebar-right/lib/client.js','utf8')
 const instrumented=bundle.replace('return module.exports;','return {createSidebarRightController,createSidebarRightStore,SidebarRightTabRegistry,bindTabInfo:(sessionId,context)=>tabInfoFactory({sessionId},context)};')
 new Function('window',instrumented)({__ModuleLoader__:{load:({factory}:{factory:(require:(id:string)=>unknown)=>Published})=>{published=factory(id=>{if(!(id in dependencies))throw Error(id);return dependencies[id]})}}})
 if(!published)throw Error('Published factory missing')
 const ctx=new Context(),registry=new published.SidebarRightTabRegistry(ctx),session=brandString<SessionId>('hidden-editor-session')
 registry.register({id:'resume',kind:'resume',patterns:['dsh-resource://fast-resume/document/**'],keepMounted:true,title:()=> 'Resume'})
 const {controller,adopt,show}=published.createSidebarRightController(registry,()=>{},{autoFullscreen:()=>false,openWithFocus:(_id,open)=>{open()},closeWithFocus:(_s,_p,close)=>close()})
 const sidebar=published.createSidebarRightStore(()=>({kind:'guide',title:'Guide'})).create(),release=adopt(session,sidebar)
 cleanup.push(async()=>{release();controller.tabDomain.dispose();await ctx.fiber.dispose()});show(session);revealResume(controller,session,id,handoff)
 const tab=controller.active()!,occurrence=controller.tabDomain.occurrence(session,tab)
 const useStore:TabInfo.TabHookContext['useStore']=selector=>selector(useSyncExternalStore(sidebar.subscribe,sidebar.getSnapshot))
 const useTabNavigation=((_key:string,selector?:(value:ReturnType<typeof occurrence.navigation.getSnapshot>)=>unknown)=>{const navigation=useSyncExternalStore(occurrence.navigation.subscribe,occurrence.navigation.getSnapshot);return selector?selector(navigation):navigation}) as TabInfo.TabHookContext['useTabNavigation']
 const useTabInfo=published.bindTabInfo(session,{tabId:tab.id,title:false,fullscreen:false,active:true,signal:occurrence.signal,actions:occurrence.tabActions,useStore,useTabNavigation,shortcuts:[]})
 return{controller,session,useTabInfo,show,occurrence}
}

it.each(['settled','pending'] as const)('retains acknowledged ownership after a %s rejected poll through public tab collapse beyond the lease and automatic reveal',async mode=>{
 const hooks:{afterPoll?:()=>Promise<void>;afterActivate?:()=>Promise<void>;inspect?:()=>Promise<unknown>}={}
 const {store,host,first,calls,completed,views,boots}=await mountedEditorFixture(hooks)
 const {controller,session,useTabInfo}=await publicResumeTab(first.id)
 let tick:()=>void=()=>{throw Error('Preparation poll not mounted')};const interval=globalThis.setInterval
 vi.spyOn(globalThis,'setInterval').mockImplementation((handler,ms,...args)=>{if(ms===store.config.editorPollIntervalMs){tick=()=>{if(typeof handler==='function')handler(...args)};return interval(()=>{},60000)}return interval(handler,ms,...args)})
 const container=document.createElement('div');document.body.append(container);const root=createRoot(container);cleanup.push(async()=>{root.unmount();container.remove()})
 root.render(React.createElement(ResumeTab,{sessionId:session,useTabInfo,views,library:()=>{},t:key=>key}))
 await until(()=>expect(views.loadedSnapshot()).toEqual([{sessionId:session,resumeId:first.id,revision:first.revision}]))
 const ownerSchema=zod.object({token:zod.string().transform(brandString<import('../../src/types.ts').EditorToken>),incarnationId:zod.string(),uncertain:zod.boolean(),seenAt:zod.number()})
 const owner=async()=>ownerSchema.parse(JSON.parse(await readFile(join(store.config.storageDir,'owners-v1',first.id+'.json'),'utf8')))
 const initial=await owner();await host.disconnect(first.id,initial.token)
 tick();await until(()=>expect(document.body.textContent).toContain('Acknowledge saved revision'))
 await until(()=>expect(completed).toContain('editorDisconnect'))
 if(mode==='pending'){
  let resume!:()=>void,observed!:()=>void;const held=new Promise<void>(resolve=>{resume=resolve}),started=new Promise<void>(resolve=>{observed=resolve})
  hooks.afterPoll=async()=>{observed();await held};tick();await started
  try{click('Acknowledge saved revision');await views.source(first.id)!.bridge.call('editorVisibility',[true]);expect(calls.filter(call=>call.method==='editorReconcile')).toHaveLength(0);expect([...document.querySelectorAll('button')].find(b=>b.textContent==='Acknowledge saved revision')?.disabled).toBe(true)}finally{hooks.afterPoll=undefined;resume()}
 }else click('Acknowledge saved revision')
 await until(()=>expect(document.body.textContent).not.toContain('Acknowledge saved revision'));expect((await owner()).uncertain).toBe(false)
 controller.toggleExpanded();await until(()=>expect(document.documentElement.dataset.editorVisible).toBe('false'));expect(views.loadedSnapshot()).toEqual([])
 const start=Date.now();let now=start;vi.spyOn(Date,'now').mockImplementation(()=>now)
 for(let step=0;step<3;step++){now+=store.config.editorLeaseMs/2;const count=completed.filter(method=>method==='editorPoll').length;tick();await until(()=>expect(completed.filter(method=>method==='editorPoll')).toHaveLength(count+1));expect(await owner()).toMatchObject({incarnationId:initial.incarnationId,token:initial.token,uncertain:false,seenAt:now})}
 expect(now-start).toBeGreaterThan(store.config.editorLeaseMs);expect(boots).toHaveLength(1);expect(calls.filter(c=>c.method==='editorRegister')).toHaveLength(1)
 const abort=new AbortController();cleanup.push(async()=>abort.abort())
 const preparing=host.prepare({resumeId:first.id,expectedRevision:first.revision,mutationId:'hidden-then-revealed',signal:abort.signal});void preparing.catch(()=>{})
 await until(async()=>expect(JSON.parse(await readFile(join(store.config.storageDir,'owners-v1',first.id+'.json'),'utf8')).preparation).toBeDefined())
 const hiddenPolls=completed.filter(method=>method==='editorPoll').length;tick();await until(()=>expect(completed.filter(method=>method==='editorPoll')).toHaveLength(hiddenPolls+1));expect(calls.filter(call=>call.method==='editorAcknowledge')).toHaveLength(0)
 revealResume(controller,session,first.id);await until(()=>expect(document.documentElement.dataset.editorVisible).toBe('true'));await until(()=>expect(views.loadedSnapshot()).toHaveLength(1))
 tick();const permit=await preparing;const saved=await store.rename(first.id,first.revision,'After automatic reveal',permit.guard);await permit.release();expect(saved.revision).toBe(2)
 expect((await owner()).uncertain).toBe(false);expect(document.body.textContent).not.toContain('Acknowledge saved revision');expect(boots).toHaveLength(1)
 now+=store.config.editorLeaseMs+1;tick();await until(()=>expect(document.body.textContent).toContain('Acknowledge saved revision'));expect((await owner()).uncertain).toBe(true);await expect(host.prepare({resumeId:first.id,expectedRevision:saved.revision,mutationId:'expired',signal:abort.signal})).rejects.toMatchObject({code:'editor-unavailable'})
})


it.each(['same-revision','newer-revision','resurrected-journal','later-transfer'] as const)('reopens a completed explicit handoff after Session unmount with %s evidence',async mode=>{
 const {store,first,calls,views,boots,waitForDetached}=await mountedEditorFixture()
 const container=document.createElement('div');document.body.append(container);let root=createRoot(container)
 cleanup.push(async()=>{root.unmount();container.remove()})
 const sourceFace=views.face();root.render(React.createElement(EditorSurface,{...sourceFace,t:key=>key}))
 await until(()=>expect([...document.querySelectorAll('button')].some(b=>b.textContent==='Recovery fixture')).toBe(true));click('Recovery fixture')
 await until(()=>expect(views.loadedSnapshot()).toHaveLength(1))
 useEditorStore.getState().applyDocumentTransform(d=>({...d,metadata:{...d.metadata,title:'Entry revision'}}));triggerManualSave()
 await until(async()=>expect((await store.read(first.id)).revision).toBe(2))
 const source=views.source(first.id)!,handoff=releaseEditorHandoff(await prepareEditorHandoff(source,editorDestination(source.ownerId),first.id));views.retain(handoff)
 root.unmount();root=createRoot(container)
 const {controller,session,useTabInfo,show,occurrence}=await publicResumeTab(first.id,handoff)
 const render=()=>root.render(React.createElement(ResumeTab,{sessionId:session,useTabInfo,views,library:()=>{},t:key=>key}))
 render();await until(()=>expect(sessionStorage.getItem(`fast-resume:handoff:v1:${first.id}`)).toBeNull())
 expect((await new TransferFile(store.config).read(first.id))?.phase).toBe('active')
 await until(()=>expect(occurrence.navigation.getSnapshot().params?.fastResume?.handoff).toBeUndefined());expect(boots).toHaveLength(2)
 if(mode!=='same-revision'){useEditorStore.getState().applyDocumentTransform(d=>({...d,metadata:{...d.metadata,title:'Current revision'}}));triggerManualSave()
 await until(async()=>expect((await store.read(first.id)).revision).toBe(3))}const before=await store.read(first.id)
 let later:RetainedEditorHandoff|undefined
 if(mode==='later-transfer'){const target=views.source(first.id)!;later=releaseEditorHandoff(await prepareEditorHandoff(target,editorDestination(target.ownerId),first.id));views.retain(later)}
 // React unmount closes the port before the Host persists the frame's detached ownership.
 show(undefined);root.unmount();await waitForDetached();root=createRoot(container)
 if(later){root.render(React.createElement(EditorSurface,{...views.face({source:'space',resumeId:first.id},later),t:key=>key}));await until(()=>expect(sessionStorage.getItem(`fast-resume:handoff:v1:${first.id}`)).toBeNull());expect((await new TransferFile(store.config).read(first.id))?.transferId).toBe(later.transferId);root.unmount();await waitForDetached();root=createRoot(container)}
 show(session)
 if(mode!=='later-transfer')revealResume(controller,session,first.id,handoff)
 if(mode==='resurrected-journal')views.retain(handoff)
 const reopenedAt=calls.length
 render();await until(()=>expect(document.body.textContent).toContain('Recover editor'))
 expect(container.textContent).not.toContain('connectionError');expect(boots.at(-1)?.launch?.checkpointId).toBeUndefined();expect(await store.read(first.id)).toEqual(before)
 click('Recover editor');await until(()=>expect(document.body.textContent).toContain('Acknowledge saved revision'));await until(()=>expect(views.loadedSnapshot()).toEqual([{sessionId:session,resumeId:first.id,revision:before.revision}]));const loadedUpdates:number[][]=[],stopLoaded=views.subscribeLoaded(()=>loadedUpdates.push(views.loadedSnapshot().map(value=>value.revision)));cleanup.push(async()=>stopLoaded());click('Acknowledge saved revision')
 await until(()=>expect(calls.filter(call=>call.method==='editorReconcile')).toHaveLength(1));await until(()=>expect(document.body.textContent).not.toContain('Acknowledge saved revision'));await until(()=>expect(views.loadedSnapshot()).toEqual([{sessionId:session,resumeId:first.id,revision:before.revision}]))
 expect(loadedUpdates[0]).toEqual([]);expect(loadedUpdates.at(-1)).toEqual([before.revision])
 revealResume(controller,session,first.id);expect(calls.filter(call=>call.method==='editorClaim')).toHaveLength(later?2:1);expect(await store.read(first.id)).toEqual(before)
 expect(occurrence.navigation.getSnapshot().params?.fastResume?.handoff).toBeUndefined();if(later)expect(calls.slice(reopenedAt).filter(call=>call.method==='editorTransferRead')).toEqual([])
})


it('retains an active same-revision checkpoint after a lost activation reply until explicit recovery',async()=>{
 let lose=true;const {store,first,calls,views}=await mountedEditorFixture({afterActivate:async()=>{if(lose){lose=false;throw Error('Fixture activation response lost')}}})
 const container=document.createElement('div');document.body.append(container);let root=createRoot(container);cleanup.push(async()=>{root.unmount();container.remove()})
 root.render(React.createElement(EditorSurface,{...views.face(),t:key=>key}));await until(()=>expect([...document.querySelectorAll('button')].some(b=>b.textContent==='Recovery fixture')).toBe(true));click('Recovery fixture');await until(()=>expect(views.loadedSnapshot()).toHaveLength(1))
 const source=views.source(first.id)!,handoff=releaseEditorHandoff(await prepareEditorHandoff(source,editorDestination(source.ownerId),first.id));views.retain(handoff);root.unmount();root=createRoot(container)
 const {session,useTabInfo,show,occurrence}=await publicResumeTab(first.id,handoff),render=()=>root.render(React.createElement(ResumeTab,{sessionId:session,useTabInfo,views,library:()=>{},t:key=>key}))
 render();await until(()=>expect(container.textContent).toContain('connectionError'));expect((await new TransferFile(store.config).read(first.id))?.phase).toBe('active')
 const journal=sessionStorage.getItem(`fast-resume:handoff:v1:${first.id}`);expect(journal).not.toBeNull()
 show(undefined);root.unmount();root=createRoot(container);show(session);render();await until(()=>expect(container.textContent).toContain('connectionError'))
 expect(sessionStorage.getItem(`fast-resume:handoff:v1:${first.id}`)).toBe(journal);expect(calls.filter(call=>call.method==='editorRecover')).toHaveLength(0);expect(occurrence.navigation.getSnapshot().params?.fastResume?.handoff).toEqual(handoff)
 click('retry');await until(()=>expect(sessionStorage.getItem(`fast-resume:handoff:v1:${first.id}`)).toBeNull());await until(()=>expect(occurrence.navigation.getSnapshot().params?.fastResume?.handoff).toBeUndefined())
 expect(calls.filter(call=>call.method==='editorRecover')).toHaveLength(1);expect(await store.read(first.id)).toEqual(first)
})


it.each(['failed','unknown','malformed'] as const)('keeps empty-journal incoming handoff blocked across two %s lookups before a valid Retry',async mode=>{
 const hooks:{inspect?:()=>Promise<unknown>}={}, {store,first,calls,views,boots}=await mountedEditorFixture(hooks)
 const container=document.createElement('div');document.body.append(container);let root=createRoot(container);cleanup.push(async()=>{root.unmount();container.remove()})
 root.render(React.createElement(EditorSurface,{...views.face(),t:key=>key}));await until(()=>expect([...document.querySelectorAll('button')].some(b=>b.textContent==='Recovery fixture')).toBe(true));click('Recovery fixture');await until(()=>expect(views.loadedSnapshot()).toHaveLength(1))
 const source=views.source(first.id)!,handoff=releaseEditorHandoff(await prepareEditorHandoff(source,editorDestination(source.ownerId),first.id));root.unmount();root=createRoot(container)
 hooks.inspect=async()=>{if(mode==='failed')throw Error('Fixture inspection failed');return mode==='unknown'?{state:'unknown'}:{state:'active'}}
 const {session,useTabInfo,occurrence}=await publicResumeTab(first.id,handoff),key=`fast-resume:handoff:v1:${first.id}`,registrations=calls.filter(call=>call.method==='editorRegister').length
 expect(sessionStorage.getItem(key)).toBeNull();root.render(React.createElement(ResumeTab,{sessionId:session,useTabInfo,views,library:()=>{},t:key=>key}))
 for(let attempt=1;attempt<=2;attempt++){
  await until(()=>expect(calls.filter(call=>call.method==='editorTransferRead')).toHaveLength(attempt));await until(()=>expect(container.textContent).toContain('connectionError'))
  expect(boots).toHaveLength(1);expect(container.querySelector('iframe')?.srcdoc).toBe('');expect(calls.filter(call=>call.method==='editorRegister')).toHaveLength(registrations);expect(sessionStorage.getItem(key)).toBeNull();expect(occurrence.navigation.getSnapshot().params?.fastResume?.handoff).toEqual(handoff)
  if(attempt===1)click('retry')
 }
 hooks.inspect=undefined;click('retry');await until(()=>expect(calls.filter(call=>call.method==='editorTransferRead')).toHaveLength(3));await until(()=>expect((views.loadedSnapshot()[0]?.revision)).toBe(first.revision));await until(()=>expect(sessionStorage.getItem(key)).toBeNull());await until(()=>expect(occurrence.navigation.getSnapshot().params?.fastResume?.handoff).toBeUndefined())
 expect(boots).toHaveLength(2);expect(boots.at(-1)?.launch?.checkpointId).toBe(handoff.checkpointId);expect(calls.filter(call=>call.method==='editorRegister')).toHaveLength(registrations);expect(calls.filter(call=>call.method==='editorClaim')).toHaveLength(1);expect(await store.read(first.id)).toEqual(first)
})


it('keeps a recovered rendered revision observable across uncertain ownership heartbeats before acknowledgement',async()=>{
 const {store,host,first,calls,views,boots,apis}=await mountedEditorFixture()
 const old=await host.register({resumeId:first.id,ownerId:brandString<import('../../src/types.ts').EditorOwnerId>(crypto.randomUUID()),incarnationId:brandString<import('../../src/types.ts').EditorIncarnationId>(crypto.randomUUID()),recoveryPending:false})
 await host.disconnect(first.id,old.token,true)
 let tick:()=>void=()=>{throw Error('Preparation poll not mounted')};const interval=globalThis.setInterval
 vi.spyOn(globalThis,'setInterval').mockImplementation((handler,ms,...args)=>{if(ms===store.config.editorPollIntervalMs){tick=()=>{if(typeof handler==='function')handler(...args)};return interval(()=>{},60000)}return interval(handler,ms,...args)})
 const sessionId=brandString<SessionId>('recovery-heartbeat-session'),container=document.createElement('div');document.body.append(container);const root=createRoot(container);cleanup.push(async()=>{root.unmount();container.remove()})
 root.render(React.createElement(EditorSurface,{...views.face({source:'conversation',sessionId,resumeId:first.id}),t:key=>key}))
 await until(()=>expect(document.body.textContent).toContain('Recover editor'));click('Recover editor')
 await until(()=>expect(document.body.textContent).toContain('Acknowledge saved revision'))
 const expected=[{sessionId,resumeId:first.id,revision:first.revision}]
 await until(()=>expect(views.loadedSnapshot()).toEqual(expected))
 expect(boots).toHaveLength(1);expect(document.querySelectorAll('[data-testid=canvas]')).toHaveLength(1)
 const poll=vi.spyOn(apis[0],'poll'),disconnect=vi.spyOn(apis[0],'disconnect')
 for(let heartbeat=1;heartbeat<=3;heartbeat++){
  await rendered(async()=>{tick();await expect(poll.mock.results.at(-1)!.value).rejects.toMatchObject({code:'editor-unavailable'})})
  expect(poll).toHaveBeenCalledTimes(heartbeat);expect(disconnect).not.toHaveBeenCalled();expect(views.loadedSnapshot()).toEqual(expected)
 }
 expect(calls.filter(call=>call.method==='editorReconcile')).toHaveLength(0)
 expect(await store.read(first.id)).toEqual(first)
})


it('reports a failed heartbeat revision only after disconnect settles and two rendered frames',async()=>{
 const hooks:{afterDisconnect?:()=>Promise<void>}={}, {store,host,first,calls,views,apis}=await mountedEditorFixture(hooks)
 let tick:()=>void=()=>{throw Error('Preparation poll not mounted')};const interval=globalThis.setInterval
 vi.spyOn(globalThis,'setInterval').mockImplementation((handler,ms,...args)=>{if(ms===store.config.editorPollIntervalMs){tick=()=>{if(typeof handler==='function')handler(...args)};return interval(()=>{},60000)}return interval(handler,ms,...args)})
 let serial=0;const frames=new Map<number,FrameRequestCallback>()
 vi.stubGlobal('requestAnimationFrame',(callback:FrameRequestCallback)=>{frames.set(++serial,callback);return serial});vi.stubGlobal('cancelAnimationFrame',(id:number)=>frames.delete(id))
 const paint=()=>rendered(()=>{const pending=[...frames.values()];frames.clear();for(const callback of pending)callback(performance.now())})
 const sessionId=brandString<SessionId>('failed-heartbeat-session'),container=document.createElement('div');document.body.append(container);const root=createRoot(container);cleanup.push(async()=>{root.unmount();container.remove()})
 await rendered(()=>root.render(React.createElement(EditorSurface,{...views.face({source:'conversation',sessionId,resumeId:first.id}),t:key=>key})))
 await until(()=>expect(frames.size).toBeGreaterThan(0));expect(views.loadedSnapshot()).toEqual([])
 await paint();expect(views.loadedSnapshot()).toEqual([]);await paint()
 const expected=[{sessionId,resumeId:first.id,revision:first.revision}];await until(()=>expect(views.loadedSnapshot()).toEqual(expected))
 const ownerSchema=zod.object({token:zod.string().transform(brandString<import('../../src/types.ts').EditorToken>)})
 const owner=ownerSchema.parse(JSON.parse(await readFile(join(store.config.storageDir,'owners-v1',first.id+'.json'),'utf8')))
 await host.disconnect(first.id,owner.token)
 let release!:()=>void,entered!:()=>void;const held=new Promise<void>(resolve=>{release=resolve}),started=new Promise<void>(resolve=>{entered=resolve})
 hooks.afterDisconnect=async()=>{entered();await held}
 const disconnect=vi.spyOn(apis[0],'disconnect')
 try{
  await rendered(async()=>{tick();await started})
  expect(disconnect).toHaveBeenCalledOnce();expect(views.loadedSnapshot()).toEqual([])
  await paint();await paint();expect(views.loadedSnapshot()).toEqual([])
  await rendered(async()=>{hooks.afterDisconnect=undefined;release();await disconnect.mock.results[0].value})
  expect(document.body.textContent).toContain('Acknowledge saved revision');expect(views.loadedSnapshot()).toEqual([])
  await paint();expect(views.loadedSnapshot()).toEqual([]);await paint();await until(()=>expect(views.loadedSnapshot()).toEqual(expected))
  expect(calls.filter(call=>call.method==='editorReconcile')).toHaveLength(0)
  const poll=vi.spyOn(apis[0],'poll');await rendered(async()=>{tick();await expect(poll.mock.results[0].value).rejects.toMatchObject({code:'editor-unavailable'})})
  expect(disconnect).toHaveBeenCalledOnce();expect(views.loadedSnapshot()).toEqual(expected)
  const loadedUpdates:number[][]=[],stop=views.subscribeLoaded(()=>loadedUpdates.push(views.loadedSnapshot().map(value=>value.revision)));cleanup.push(async()=>stop())
  const reconcile=vi.spyOn(apis[0],'reconcile');await rendered(async()=>{click('Acknowledge saved revision');await until(()=>expect(reconcile).toHaveBeenCalledOnce());await reconcile.mock.results[0].value})
  expect(document.body.textContent).not.toContain('Acknowledge saved revision');expect(loadedUpdates).toEqual([[]]);expect(views.loadedSnapshot()).toEqual([])
  await paint();expect(views.loadedSnapshot()).toEqual([]);await paint();await until(()=>expect(views.loadedSnapshot()).toEqual(expected))
  expect(loadedUpdates).toEqual([[],[first.revision]]);expect(await store.read(first.id)).toEqual(first)
 }finally{hooks.afterDisconnect=undefined;release()}
})


it('retries an unknown disconnect before a recovered transport can acknowledge model preparation',async()=>{
 const {store,host,first,calls,views,apis}=await mountedEditorFixture()
 let tick:()=>void=()=>{throw Error('Preparation poll not mounted')};const interval=globalThis.setInterval
 vi.spyOn(globalThis,'setInterval').mockImplementation((handler,ms,...args)=>{if(ms===store.config.editorPollIntervalMs){tick=()=>{if(typeof handler==='function')handler(...args)};return interval(()=>{},60000)}return interval(handler,ms,...args)})
 const sessionId=brandString<SessionId>('unknown-heartbeat-session'),container=document.createElement('div');document.body.append(container);const root=createRoot(container);cleanup.push(async()=>{root.unmount();container.remove()})
 root.render(React.createElement(EditorSurface,{...views.face({source:'conversation',sessionId,resumeId:first.id}),t:key=>key}))
 const expected=[{sessionId,resumeId:first.id,revision:first.revision}];await until(()=>expect(views.loadedSnapshot()).toEqual(expected))
 const poll=vi.spyOn(apis[0],'poll').mockRejectedValueOnce(Error('Fixture poll transport unavailable')),disconnect=vi.spyOn(apis[0],'disconnect').mockRejectedValueOnce(Error('Fixture disconnect transport unavailable'))
 await rendered(async()=>{tick();await expect(poll.mock.results[0].value).rejects.toThrow('Fixture poll')})
 await until(()=>expect(views.loadedSnapshot()).toEqual([]));expect(disconnect).toHaveBeenCalledOnce();expect(document.body.textContent).toContain('Acknowledge saved revision')
 const owner=async()=>JSON.parse(await readFile(join(store.config.storageDir,'owners-v1',first.id+'.json'),'utf8')) as {uncertain:boolean;preparation?:unknown}
 expect((await owner()).uncertain).toBe(false)
 const abort=new AbortController();cleanup.push(async()=>abort.abort())
 const preparing=host.prepare({resumeId:first.id,expectedRevision:first.revision,mutationId:'after-transport-failure',signal:abort.signal});void preparing.catch(()=>{})
 await until(async()=>expect((await owner()).preparation).toBeDefined())
 await rendered(async()=>{tick();await disconnect.mock.results[1]?.value})
 expect(disconnect).toHaveBeenCalledTimes(2);expect(poll).toHaveBeenCalledOnce();expect(calls.filter(call=>call.method==='editorAcknowledge')).toHaveLength(0)
 await expect(preparing).rejects.toMatchObject({code:'editor-unavailable'});expect((await owner()).uncertain).toBe(true)
 await until(()=>expect(views.loadedSnapshot()).toEqual(expected))
 await rendered(async()=>{tick();await expect(poll.mock.results[1].value).rejects.toMatchObject({code:'editor-unavailable'})})
 expect(disconnect).toHaveBeenCalledTimes(2);expect(views.loadedSnapshot()).toEqual(expected)
 expect(calls.filter(call=>call.method==='editorReconcile')).toHaveLength(0);expect(await store.read(first.id)).toEqual(first)
})


it('keeps recovery blocked until the closing frame disconnect is durable',async()=>{
 const hooks:{beforeDisconnect?:(detached:boolean)=>Promise<void>}={}, {store,first,calls,completed,views}=await mountedEditorFixture(hooks)
 const sessionId=brandString<SessionId>('closing-frame-session'),container=document.createElement('div');document.body.append(container);let root=createRoot(container);cleanup.push(async()=>{root.unmount();container.remove()})
 const render=()=>root.render(React.createElement(EditorSurface,{...views.face({source:'conversation',sessionId,resumeId:first.id}),t:key=>key}))
 render();await until(()=>expect(views.loadedSnapshot()).toHaveLength(1))
 let release!:()=>void,entered!:()=>void;const held=new Promise<void>(resolve=>{release=resolve}),started=new Promise<void>(resolve=>{entered=resolve})
 hooks.beforeDisconnect=async detached=>{if(detached){entered();await held}}
 try{
  root.unmount();root=createRoot(container);await started;render()
  await until(()=>expect(document.body.textContent).toContain('Recover editor'));const before=calls.filter(call=>call.method==='editorRegister').length;click('Recover editor')
  await until(()=>expect(calls.filter(call=>call.method==='editorRegister')).toHaveLength(before+1));await until(()=>expect(document.body.textContent).toContain('Recover editor'))
  expect(document.querySelector('[data-testid=canvas]')).toBeNull();expect(views.loadedSnapshot()).toEqual([])
  expect(JSON.parse(await readFile(join(store.config.storageDir,'owners-v1',first.id+'.json'),'utf8')).detached).not.toBe(true)
  hooks.beforeDisconnect=undefined;release();await until(()=>expect(completed).toContain('editorDisconnect'))
  click('Recover editor');await until(()=>expect(document.body.textContent).toContain('Acknowledge saved revision'));await until(()=>expect(views.loadedSnapshot()).toEqual([{sessionId,resumeId:first.id,revision:first.revision}]))
  expect(await store.read(first.id)).toEqual(first)
 }finally{hooks.beforeDisconnect=undefined;release()}
})

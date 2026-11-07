// @vitest-environment jsdom
/** Published public opening preserves external composition through mounted tab paint. */
import React,{act,useSyncExternalStore} from 'react'
import {createRoot} from 'react-dom/client'
import * as jsx from 'react/jsx-runtime'
import * as ReactDOM from 'react-dom'
import * as dock from '@deepseek-ai/dsh-client-ui-dockkit'
import * as stores from '@deepseek-ai/dsh-client-store'
const primitives={}
import * as zod from 'zod'
import {Context} from '@deepseek-ai/cordis'
import {readFile} from 'node:fs/promises'
import {it,expect,vi} from 'vitest'
vi.mock('@deepseek-ai/dsh-client-ui-primitives',()=>({Tooltip:({children}:{children:React.ReactNode})=>children,IconCloseFillRegular:()=>null,IconCloseOutlineRegular:()=>null,IconPanelLeftOutlineRegular:()=>null,IconPlusOutlineRegular:()=>null,MenuSurface:()=>null,focusWithoutRing:(element:HTMLElement)=>element.focus(),modalSelector:'[role=dialog]',observeComposition:()=>()=>{}}))
import type {SessionId} from '@deepseek-ai/dsh-session/types'
import type * as Service from '../../node_modules/@deepseek-ai/dsh-client-ui-sidebar-right/lib/types/client/service.js'
import type * as Store from '../../node_modules/@deepseek-ai/dsh-client-ui-sidebar-right/lib/types/client/stores.js'
import type * as Registry from '../../node_modules/@deepseek-ai/dsh-client-ui-sidebar-right/lib/types/client/tab-registry.js'

it('keeps ordinary composer focus, selection and IME events through public openResource and post-paint',async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true,ResizeObserver:class {observe(){} disconnect(){} unobserve(){}}})
 const dependencies:Record<string,unknown>={'react':React,'react/jsx-runtime':jsx,'react-dom':ReactDOM,'zod':zod,'@deepseek-ai/dsh-client-ui-dockkit':dock,'@deepseek-ai/dsh-client-store':stores,'@deepseek-ai/dsh-client-ui-primitives':primitives}
 type Published={createSidebarRightController:typeof Service.createSidebarRightController;createSidebarRightStore:typeof Store.createSidebarRightStore;SidebarRightTabRegistry:typeof Registry.SidebarRightTabRegistry}
 let published:Published|undefined
 const bundle=await readFile('node_modules/@deepseek-ai/dsh-client-ui-sidebar-right/lib/client.js','utf8')
 const instrumented=bundle.replace('return module.exports;', 'return {createSidebarRightController,createSidebarRightStore,SidebarRightTabRegistry};')
 new Function('window',instrumented)({__ModuleLoader__:{load:({factory}:{factory:(require:(id:string)=>unknown)=>Published})=>{published=factory(id=>{if(!(id in dependencies))throw Error(id);return dependencies[id]})}}})
 if(!published)throw Error('Published factory missing')
 const ctx=new Context(),registry=new published.SidebarRightTabRegistry(ctx),session='focus-session' as SessionId
 registry.register({id:'resume',kind:'resume',patterns:['dsh-resource://fast-resume/document/**'],title:()=> 'Resume'})
 const focus=vi.fn((_id:SessionId,open:()=>unknown)=>{open();document.querySelector<HTMLElement>('[data-pane]')?.focus()})
 const {controller,adopt,show}=published.createSidebarRightController(registry,()=>{},{autoFullscreen:()=>false,openWithFocus:focus,closeWithFocus:(_s,_p,close)=>close()})
 const store=published.createSidebarRightStore(()=>({kind:'guide',title:'Guide'})).create(),release=adopt(session,store)
 show(session)
 const container=document.createElement('div');document.body.append(container);const root=createRoot(container)
 function Surface(){const state=useSyncExternalStore(store.subscribe,store.getSnapshot);return <><textarea aria-label="Ordinary composer" defaultValue="Draft"/><section data-pane tabIndex={-1}>{state.bySession[session]&&<dock.DockLayout state={state.bySession[session]!.layout} canSplit={false} intents={new Proxy({},{get:()=>()=>{}}) as dock.DockIntents} labels={new Proxy({},{get:()=> 'Action'}) as dock.DockLabels} renderTab={()=> <iframe title="Resume editor"/>}/>}</section></>}
 try{
  await act(async()=>root.render(<Surface/>));const composer=container.querySelector('textarea')!;composer.focus();composer.setSelectionRange(2,4)
  const end=vi.fn();composer.addEventListener('compositionend',end);composer.dispatchEvent(new CompositionEvent('compositionstart',{data:'简'}))
  await act(async()=>{controller.openResource('dsh-resource://fast-resume/document/one')})
  await act(async()=>{await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()))})
  expect(document.activeElement).toBe(composer);expect([composer.selectionStart,composer.selectionEnd]).toEqual([2,4]);expect(focus).not.toHaveBeenCalled()
  composer.dispatchEvent(new CompositionEvent('compositionend',{data:'简历'}));expect(end).toHaveBeenCalledOnce()
  await act(async()=>{controller.openResource('dsh-resource://fast-resume/document/one')});expect(container.querySelectorAll('iframe')).toHaveLength(1);expect(document.activeElement).toBe(composer)
 }finally{await act(async()=>root.unmount());release();controller.tabDomain.dispose();await ctx.fiber.dispose();container.remove()}
})

// @vitest-environment jsdom
/** The real canvas command listener must never receive keyboard actions owned by history. */
import React,{act} from 'react'
import {createRoot,type Root} from 'react-dom/client'
import {DndProvider} from 'react-dnd'
import {HTML5Backend} from 'react-dnd-html5-backend'
import {afterEach,beforeEach,it,expect,vi} from 'vitest'
import {MessageChannel} from 'node:worker_threads'
import {CanvasWorkspace} from '../../upstream/editor/src/components/layout/CanvasWorkspace.tsx'
import {useEditorStore} from '../../upstream/editor/src/store/editor-store.ts'
import {createShapeElement} from '../../upstream/canvas-engine/src/element-factory.ts'
import {Versions} from '../../src/editor/versions.tsx'
import {createEditorApi} from '../../src/editor/api.ts'
import {PortBridge} from '../../src/editor/bridge.ts'
import {en} from '../../src/editor/locales.ts'
import {resumeIdSchema,resumeRevisionSchema,versionIdSchema} from '../../src/identity.ts'
vi.mock('../../src/editor/thumbnail.ts',()=>({renderSavedPage:vi.fn(async()=>'data:image/png;base64,page')}))
vi.mock('@resume-editor/canvas-engine',async()=>({ResumeCanvas:()=>null,alignBoxes:vi.fn(),distributeBoxes:vi.fn(),getPageMetrics:(await import('../../upstream/canvas-engine/src/core/page-metrics.ts')).getPageMetrics}))
let root:Root|undefined
const initial=useEditorStore.getState()
beforeEach(()=>{vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);vi.stubGlobal('IntersectionObserver',class{observe(){}disconnect(){}})})
afterEach(async()=>{if(root)await act(async()=>root?.unmount());root=undefined;useEditorStore.setState(initial);document.body.replaceChildren();vi.unstubAllGlobals()})
function key(target:Element,name:string,extra:KeyboardEventInit={}){const event=new KeyboardEvent('keydown',{key:name,bubbles:true,cancelable:true,...extra});target.dispatchEvent(event);return event}
function button(label:string){const node=Array.from(document.querySelectorAll('button')).find(item=>item.getAttribute('aria-label')===label||item.textContent===label);if(!node)throw Error(`Missing ${label}`);return node}
it('isolates history select/buttons/root and pending mutations while preserving native input, Tab, Escape and canvas commands after close',async()=>{
 const{port1,port2}=new MessageChannel(),bridge=new PortBridge(port1,1000),api=createEditorApi(bridge,{nonce:'test',recoveryOwnerId:'test',recoveryOwnerPersistent:true,mode:'editor',locale:'en',autosaveDelayMs:2000,maxImportBytes:100000,maxDocumentBytes:100000,frameConnectTimeoutMs:15000,bridgeTimeoutMs:45000,rendererPollIntervalMs:1000,refreshIntervalMs:2000})
 const element=createShapeElement('rectangle',{id:'selected-live-layer',left:10,top:20}),doc={...initial.document,pages:[{...initial.document.pages[0],elements:[element]}]}
 useEditorStore.getState().setDocument(doc);useEditorStore.getState().selectMultiple([element.id])
 const snapshot={id:resumeIdSchema.parse('history'),revision:resumeRevisionSchema.parse(4),title:'Synthetic',documentJson:JSON.stringify(doc),pageCount:2,updatedAt:'2026-10-18T00:00:00Z'}
 vi.spyOn(api,'history').mockResolvedValue({versions:[{id:versionIdSchema.parse('v1'),revision:resumeRevisionSchema.parse(4),name:'Two pages',createdAt:snapshot.updatedAt}],proposals:[],changes:[]});vi.spyOn(api,'version').mockResolvedValue(snapshot)
 let finishSave!:()=>void;const save=vi.fn(()=>new Promise<void>(resolve=>{finishSave=resolve})),refresh=vi.fn(async()=>{}),state={snapshot,draft:snapshot.documentJson,dirty:false,saving:false,error:null}
 const close=vi.fn(()=>{open=false;render()});let open=false
 const container=document.createElement('div');document.body.append(container);root=createRoot(container)
 const render=()=>root?.render(React.createElement(DndProvider,{backend:HTML5Backend},React.createElement('button',{'data-canvas-trigger':true},'Canvas focus'),React.createElement(CanvasWorkspace),open?React.createElement(Versions,{api,state,current:()=>state,copy:en,close,save,blocked:false,refresh}):null))
 const current=()=>useEditorStore.getState().document.pages[0].elements
 try{
  await act(async()=>render());const trigger=document.querySelector<HTMLButtonElement>('[data-canvas-trigger]')!;trigger.focus()
  await act(async()=>{expect(key(trigger,'ArrowDown').defaultPrevented).toBe(true)});expect(current()[0].top).toBe(21)
  await act(async()=>{useEditorStore.getState().setDocument(doc);useEditorStore.getState().selectMultiple([element.id]);open=true;render()})
  const savedDocument=useEditorStore.getState().document,select=document.querySelector('select')!,dialog=document.querySelector<HTMLElement>('[role="dialog"]')!
  select.focus();await act(async()=>{for(const arrow of ['ArrowDown','ArrowUp','ArrowLeft','ArrowRight'])expect(key(select,arrow).defaultPrevented).toBe(false)})
  await act(async()=>{select.value='1';select.dispatchEvent(new Event('change',{bubbles:true}))});expect(select.value).toBe('1')
  button(en.restore).focus();await act(async()=>{for(const command of ['Delete','Backspace','t'])expect(key(button(en.restore),command).defaultPrevented).toBe(false);expect(key(button(en.restore),'d',{ctrlKey:true}).defaultPrevented).toBe(false)})
  dialog.focus();await act(async()=>key(dialog,'Delete'));expect(useEditorStore.getState().document).toBe(savedDocument)
  const input=document.querySelector('input')!;input.focus();await act(async()=>{expect(key(input,'ArrowLeft').defaultPrevented).toBe(false);expect(key(input,'a').defaultPrevented).toBe(false);Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set?.call(input,'Named with keyboard');input.dispatchEvent(new Event('input',{bubbles:true}))})
  expect(input.value).toBe('Named with keyboard');button(en.restore).focus();await act(async()=>key(button(en.restore),'Tab'));expect(document.activeElement).toBe(button(en.close));await act(async()=>key(button(en.close),'Tab',{shiftKey:true}));expect(document.activeElement).toBe(button(en.restore))
  await act(async()=>document.querySelector('form')?.requestSubmit());expect(save).toHaveBeenCalledExactlyOnceWith('Named with keyboard');expect(button(en.close).disabled).toBe(true)
  dialog.focus();await act(async()=>{key(dialog,'Delete');key(dialog,'ArrowDown');key(dialog,'Escape')});expect(close).not.toHaveBeenCalled();expect(useEditorStore.getState().document).toBe(savedDocument)
  await act(async()=>finishSave());await act(async()=>key(dialog,'Escape'));expect(close).toHaveBeenCalledTimes(1);expect(document.querySelector('[role="dialog"]')).toBeNull()
  trigger.focus();await act(async()=>key(trigger,'ArrowDown'));expect(current()[0].top).toBe(21);await act(async()=>key(trigger,'Delete'));expect(current()).toHaveLength(0)
 }finally{finishSave?.();bridge.close();port2.close()}
})

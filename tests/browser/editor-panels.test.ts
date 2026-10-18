// @vitest-environment jsdom
import React,{act} from 'react'
import {createRoot,type Root} from 'react-dom/client'
import {afterEach,beforeEach,it,expect,vi} from 'vitest'
import {MessageChannel} from 'node:worker_threads'
import {App} from '../../src/editor/app.tsx'
import {createEditorApi} from '../../src/editor/api.ts'
import {PortBridge} from '../../src/editor/bridge.ts'
import {useEditorStore} from '../../upstream/editor/src/store/editor-store.ts'
import {en} from '../../src/editor/locales.ts'
import {createShapeElement} from '../../upstream/canvas-engine/src/element-factory.ts'
import {resumeIdSchema,resumeRevisionSchema} from '../../src/identity.ts'
vi.mock('../../upstream/editor/src/components/layout/LeftPanel.tsx',()=>({LeftPanel:()=>React.createElement('input',{'aria-label':'Left local state',defaultValue:'left draft'})}))
vi.mock('../../upstream/editor/src/components/layout/RightPanel.tsx',()=>({RightPanel:()=>React.createElement('input',{'aria-label':'Right local state',defaultValue:'right draft'})}))
vi.mock('../../upstream/editor/src/components/layout/StatusBar.tsx',()=>({StatusBar:()=>null}))
vi.mock('../../src/editor/assistant.tsx',()=>({Assistant:()=>null}))
vi.mock('../../src/editor/thumbnail.ts',()=>({renderThumbnail:vi.fn(),renderSavedPage:vi.fn()}))
vi.mock('@resume-editor/canvas-engine',async()=>({ResumeCanvas:()=>null,alignBoxes:vi.fn(),distributeBoxes:vi.fn(),getPageMetrics:(await import('../../upstream/canvas-engine/src/core/page-metrics.ts')).getPageMetrics}))
// Vite's Node condition selects the SSR build; interaction coverage needs the shipped browser build.
vi.mock('react-resizable-panels',()=>vi.importActual<typeof import('react-resizable-panels')>('../../node_modules/react-resizable-panels/dist/react-resizable-panels.browser.esm.js'))
let root:Root|undefined,close=()=>{}
const initial=useEditorStore.getState()
function workspace(){return document.querySelector<HTMLElement>('[data-panel-group-direction="horizontal"]')!}
function panels(){return Array.from(workspace().children).filter((item):item is HTMLElement=>item.hasAttribute('data-panel'))}
function handles(){return Array.from(workspace().querySelectorAll<HTMLElement>('[data-panel-resize-handle-id]'))}
function size(index:number){return Number(panels()[index]?.style.flexGrow??0)}
function button(label:string){return Array.from(document.querySelectorAll('button')).find(item=>item.getAttribute('aria-label')===label||item.textContent===label)!}
async function key(handle:HTMLElement,key:string){await act(async()=>{handle.dispatchEvent(new KeyboardEvent('keydown',{key,bubbles:true,cancelable:true}))})}
async function drag(handle:HTMLElement,to:number){const from=handle.getBoundingClientRect().x;await act(async()=>{handle.dispatchEvent(new PointerEvent('pointerdown',{clientX:from,clientY:200,isPrimary:true,buttons:1,bubbles:true,cancelable:true}))});await act(async()=>{handle.dispatchEvent(new PointerEvent('pointermove',{clientX:to,clientY:200,isPrimary:true,buttons:1,bubbles:true,cancelable:true}))});await act(async()=>{handle.dispatchEvent(new PointerEvent('pointerup',{clientX:to,clientY:200,isPrimary:true,bubbles:true,cancelable:true}))})}
beforeEach(()=>{
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);vi.stubGlobal('IntersectionObserver',class{observe(){}disconnect(){}})
 // jsdom has no layout; only geometry is supplied, while the real library owns drag thresholds and keyboard resizing.
 vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockImplementation(function(this:HTMLElement){
  let x=0,width=1000
  if(this.hasAttribute('data-panel-resize-handle-id')){width=4;for(const sibling of Array.from(this.parentElement!.children)){if(sibling===this)break;x+=sibling.hasAttribute('data-panel')?Number((sibling as HTMLElement).style.flexGrow)*10:4}}
  return {x,y:0,width,height:500,left:x,right:x+width,top:0,bottom:500,toJSON(){return {}}}
 })
})
afterEach(async()=>{if(root)await act(async()=>root?.unmount());root=undefined;close();useEditorStore.setState(initial);document.body.replaceChildren();vi.restoreAllMocks();vi.unstubAllGlobals()})
async function mount(left=true,right=true){
 useEditorStore.setState({ui:{...initial.ui,leftPanelVisible:left,rightPanelVisible:right}})
 const{port1,port2}=new MessageChannel(),bridge=new PortBridge(port1,1000),api=createEditorApi(bridge,{nonce:'test',recoveryOwnerId:'test',recoveryOwnerPersistent:true,mode:'editor',locale:'en',autosaveDelayMs:2000,maxImportBytes:100000,maxDocumentBytes:100000,frameConnectTimeoutMs:15000,bridgeTimeoutMs:45000,rendererPollIntervalMs:1000,refreshIntervalMs:200000});close=()=>{bridge.close();port2.close()}
 const doc={...initial.document,id:'panels',metadata:{...initial.document.metadata,title:'Synthetic panels'}}
 const snapshot={id:resumeIdSchema.parse('panels'),revision:resumeRevisionSchema.parse(4),title:'Synthetic panels',documentJson:JSON.stringify(doc),pageCount:doc.pages.length,updatedAt:'2026-10-18T00:00:00Z'}
 vi.spyOn(api,'list').mockResolvedValue([snapshot]);vi.spyOn(api,'read').mockResolvedValue(snapshot);vi.spyOn(api,'recovery').mockResolvedValue([])
 const save=vi.spyOn(api,'save'),backup=vi.spyOn(api,'backup')
 const container=document.createElement('div');document.body.append(container);root=createRoot(container)
 await act(async()=>root?.render(React.createElement(App,{api})));await act(async()=>button('Synthetic panels').click())
 return {save,backup}
}
it('snaps either sidebar closed through native pointer resizing and restores its last expanded size from the toolbar',async()=>{
 const{save,backup}=await mount(),documentBefore=useEditorStore.getState().document,selectionBefore=useEditorStore.getState().selection
 const leftInput=document.querySelector<HTMLInputElement>('[aria-label="Left local state"]')!;leftInput.value='kept draft'
 await drag(handles()[0]!,300);expect(size(0)).toBeCloseTo(30)
 await drag(handles()[0]!,40);expect(size(0)).toBe(0);expect(useEditorStore.getState().ui.leftPanelVisible).toBe(false);expect(button(en.showLeft).getAttribute('aria-pressed')).toBe('false');expect(size(1)).toBeCloseTo(78)
 expect(leftInput.closest('[hidden]')).not.toBeNull();expect(document.querySelector('[aria-label="Left local state"]')).toBe(leftInput)
 await act(async()=>button(en.showLeft).click());expect(size(0)).toBeCloseTo(30);expect(leftInput.value).toBe('kept draft')
 await drag(handles()[1]!,960);expect(size(2)).toBe(0);expect(button(en.showRight).getAttribute('aria-pressed')).toBe('false')
 await drag(handles()[1]!,handles()[1]!.getBoundingClientRect().x-220);expect(size(2)).toBeCloseTo(22);expect(button(en.showRight).getAttribute('aria-pressed')).toBe('true')
 await act(async()=>button(en.showRight).click());expect(size(2)).toBe(0);await act(async()=>button(en.showRight).click());expect(size(2)).toBeCloseTo(22)
 expect(useEditorStore.getState().document).toBe(documentBefore);expect(useEditorStore.getState().selection).toBe(selectionBefore);expect(useEditorStore.getState().isDirty).toBe(false);expect(save).not.toHaveBeenCalled();expect(backup).not.toHaveBeenCalled()
})
it('synchronizes native splitter keyboard collapse and expansion with toolbar and shortcut visibility',async()=>{
 const{save,backup}=await mount()
 const element=createShapeElement('rectangle',{id:'selected-live-layer',left:10,top:20}),store=useEditorStore.getState()
 await act(async()=>{store.setDocument({...store.document,pages:[{...store.document.pages[0]!,elements:[element]}]});store.selectMultiple([element.id])})
 const documentBefore=useEditorStore.getState().document,canvasBefore=panels()[1]!.firstElementChild
 await key(handles()[0]!,'ArrowLeft');await key(handles()[0]!,'ArrowLeft');expect(size(0)).toBe(0);expect(button(en.showLeft).getAttribute('aria-pressed')).toBe('false')
 await key(handles()[0]!,'ArrowRight');expect(size(0)).toBeGreaterThan(0);expect(button(en.showLeft).getAttribute('aria-pressed')).toBe('true')
 await key(handles()[1]!,'ArrowRight');await key(handles()[1]!,'ArrowRight');expect(size(2)).toBe(0);expect(button(en.showRight).getAttribute('aria-pressed')).toBe('false')
 await key(handles()[1]!,'ArrowLeft');expect(size(2)).toBeGreaterThan(0);expect(button(en.showRight).getAttribute('aria-pressed')).toBe('true')
 expect(useEditorStore.getState().document).toBe(documentBefore);expect(panels()[1]!.firstElementChild).toBe(canvasBefore)
 await key(handles()[0]!,'Enter');expect(size(0)).toBe(0);await key(handles()[0]!,'Enter');expect(size(0)).toBeGreaterThan(0)
 await key(handles()[1]!,'Enter');expect(size(2)).toBe(0);expect(button(en.showRight).getAttribute('aria-pressed')).toBe('false');await key(handles()[1]!,'Enter');expect(size(2)).toBeGreaterThan(0);expect(button(en.showRight).getAttribute('aria-pressed')).toBe('true')
 await key(handles()[0]!,'Delete');expect(useEditorStore.getState().document).toBe(documentBefore)
 await act(async()=>window.dispatchEvent(new KeyboardEvent('keydown',{key:'b',ctrlKey:true,bubbles:true,cancelable:true})));expect(size(0)).toBe(0)
 await act(async()=>window.dispatchEvent(new KeyboardEvent('keydown',{key:'b',ctrlKey:true,bubbles:true,cancelable:true})));expect(size(0)).toBeGreaterThan(0)
 await act(async()=>window.dispatchEvent(new KeyboardEvent('keydown',{key:'.',ctrlKey:true,bubbles:true,cancelable:true})));expect(size(2)).toBe(0)
 await act(async()=>window.dispatchEvent(new KeyboardEvent('keydown',{key:'j',ctrlKey:true,bubbles:true,cancelable:true})));expect(useEditorStore.getState().ui.bottomPanelVisible).toBe(true);expect(panels()[1]!.firstElementChild).toBe(canvasBefore)
 await act(async()=>window.dispatchEvent(new KeyboardEvent('keydown',{key:'j',ctrlKey:true,bubbles:true,cancelable:true})));expect(useEditorStore.getState().ui.bottomPanelVisible).toBe(false);expect(panels()[1]!.firstElementChild).toBe(canvasBefore)
 expect(useEditorStore.getState().document).toBe(documentBefore);expect(useEditorStore.getState().isDirty).toBe(false);expect(save).not.toHaveBeenCalled();expect(backup).not.toHaveBeenCalled()
})
it.each([[false,true],[true,false],[false,false]])('preserves initially hidden sides (%s, %s) and can reopen them',async(left,right)=>{
 await mount(left,right);expect(panels()).toHaveLength(3);expect(size(0)>0).toBe(left);expect(size(2)>0).toBe(right)
 expect(useEditorStore.getState().ui.leftPanelVisible).toBe(left);expect(useEditorStore.getState().ui.rightPanelVisible).toBe(right)
 if(!left){await act(async()=>button(en.showLeft).click());expect(size(0)).toBeCloseTo(22)}
 if(!right){await act(async()=>button(en.showRight).click());expect(size(2)).toBeCloseTo(22)}
})

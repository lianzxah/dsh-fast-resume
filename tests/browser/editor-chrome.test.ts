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
import {resumeIdSchema,resumeRevisionSchema} from '../../src/identity.ts'
// Exercise the library's browser lifecycle rather than its Node SSR build.
vi.mock('react-resizable-panels',()=>vi.importActual<typeof import('react-resizable-panels')>('../../node_modules/react-resizable-panels/dist/react-resizable-panels.browser.esm.js'))
vi.mock('../../upstream/editor/src/components/layout/LeftPanel.tsx',()=>({LeftPanel:()=>null}))
vi.mock('../../upstream/editor/src/components/layout/RightPanel.tsx',()=>({RightPanel:()=>null}))
vi.mock('../../upstream/editor/src/components/layout/CanvasWorkspace.tsx',()=>({CanvasWorkspace:()=>null}))
vi.mock('../../upstream/editor/src/components/layout/StatusBar.tsx',()=>({StatusBar:()=>null}))
vi.mock('../../src/editor/assistant.tsx',()=>({Assistant:()=>null}))
vi.mock('../../src/editor/thumbnail.ts',()=>({renderThumbnail:vi.fn(),renderSavedPage:vi.fn()}))
vi.mock('@resume-editor/canvas-engine',()=>({alignBoxes:vi.fn(),distributeBoxes:vi.fn()}))
let root:Root|undefined
const initial=useEditorStore.getState()
beforeEach(()=>{vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);vi.stubGlobal('IntersectionObserver',class{observe(){}disconnect(){}})})
afterEach(async()=>{if(root)await act(async()=>root?.unmount());root=undefined;useEditorStore.setState(initial);document.body.replaceChildren();vi.unstubAllGlobals()})
function button(label:string){const node=Array.from(document.querySelectorAll('button')).find(item=>item.getAttribute('aria-label')===label||item.textContent===label);if(!node)throw Error(`Missing ${label}`);return node}
it('keeps only navigation/title/status above the real accessible toolbar and preserves its actions',async()=>{
 const{port1,port2}=new MessageChannel(),bridge=new PortBridge(port1,1000),api=createEditorApi(bridge,{nonce:'test',recoveryOwnerId:'test',recoveryOwnerPersistent:true,mode:'editor',locale:'en',autosaveDelayMs:2000,maxImportBytes:100000,maxDocumentBytes:100000,frameConnectTimeoutMs:15000,bridgeTimeoutMs:45000,rendererPollIntervalMs:1000,refreshIntervalMs:200000})
 const doc={...initial.document,id:'chrome',metadata:{...initial.document.metadata,title:'Synthetic chrome'}}
 const snapshot={id:resumeIdSchema.parse('chrome'),revision:resumeRevisionSchema.parse(4),title:'Synthetic chrome',documentJson:JSON.stringify(doc),pageCount:doc.pages.length,updatedAt:'2026-10-18T00:00:00Z'}
 vi.spyOn(api,'list').mockResolvedValue([snapshot]);vi.spyOn(api,'read').mockResolvedValue(snapshot);vi.spyOn(api,'recovery').mockResolvedValue([]);vi.spyOn(api,'history').mockResolvedValue({versions:[],proposals:[],changes:[]})
 const container=document.createElement('div');document.body.append(container);root=createRoot(container)
 try{
  await act(async()=>root?.render(React.createElement(App,{api})));await act(async()=>button('Synthetic chrome').click())
  const bar=document.querySelector('.fr-adapter-bar')!;expect(bar.querySelectorAll('button')).toHaveLength(1);expect(bar.textContent).toContain(en.back);expect(bar.textContent).toContain('Synthetic chrome');expect(bar.querySelector('input')).toBeNull();expect(bar.textContent).not.toContain(en.saveVersion);expect(bar.textContent).not.toContain(en.showRight)
  const left=button(en.showLeft),right=button(en.showRight);expect(left.closest('.fr-menu-actions')).not.toBeNull();const leftBefore=useEditorStore.getState().ui.leftPanelVisible,rightBefore=useEditorStore.getState().ui.rightPanelVisible
  await act(async()=>left.click());expect(left.getAttribute('aria-pressed')).toBe(String(!leftBefore));await act(async()=>right.click());expect(right.getAttribute('aria-pressed')).toBe(String(!rightBefore));expect(button(`${en.save} (Ctrl+S)`).title).toContain(en.save)
  await act(async()=>button(en.versions).click());expect(document.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe(en.versions)
  const visibility=useEditorStore.getState().ui.leftPanelVisible;await act(async()=>window.dispatchEvent(new KeyboardEvent('keydown',{key:'b',ctrlKey:true,bubbles:true,cancelable:true})));expect(useEditorStore.getState().ui.leftPanelVisible).toBe(visibility)
  await act(async()=>button(en.close).click());await act(async()=>button(en.back).click());expect(document.querySelector('.fr-library')).not.toBeNull()
 }finally{bridge.close();port2.close()}
})

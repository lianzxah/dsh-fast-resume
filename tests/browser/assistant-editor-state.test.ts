// @vitest-environment jsdom
import React,{act} from 'react'
import {createRoot,type Root} from 'react-dom/client'
import {afterEach,beforeEach,it,expect,vi} from 'vitest'
import {once} from 'node:events'
import {MessageChannel} from 'node:worker_threads'
import {brandString} from '@deepseek-ai/dsh-brand'
import {RichTextEditorOverlay} from '../../upstream/canvas-engine/src/react/RichTextEditorOverlay.tsx'
import {createTextElement} from '../../upstream/canvas-engine/src/element-factory.ts'
import {App} from '../../src/editor/app.tsx'
import {createEditorApi} from '../../src/editor/api.ts'
import {PortBridge} from '../../src/editor/bridge.ts'
import {useEditorStore} from '../../upstream/editor/src/store/editor-store.ts'
import {resumeIdSchema,resumeRevisionSchema} from '../../src/identity.ts'
import type {EditorToken} from '../../src/types.ts'
vi.mock('../../src/editor/workspace-panels.tsx',()=>({WorkspacePanels:()=>{const[open,setOpen]=React.useState(true);const element=useEditorStore.getState().document.pages[0].elements[0];if(!open||element?.type!=='text')return null;return React.createElement(RichTextEditorOverlay,{...element,zoom:1,underline:false,strikethrough:false,initialContent:element.content,onCommit:result=>useEditorStore.getState().updateElement(element.id,result),onClose:()=>setOpen(false)})}}))
vi.mock('../../upstream/editor/src/components/layout/StatusBar.tsx',()=>({StatusBar:()=>null}))
vi.mock('../../src/editor/assistant.tsx',()=>({Assistant:()=>null}))
vi.mock('../../src/editor/thumbnail.ts',()=>({renderThumbnail:vi.fn(),renderSavedPage:vi.fn()}))
vi.mock('@resume-editor/canvas-engine',()=>({alignBoxes:vi.fn(),distributeBoxes:vi.fn()}))
let root:Root|undefined,visibleAttribute:string|undefined
beforeEach(()=>{visibleAttribute=document.documentElement.dataset.editorVisible;useEditorStore.setState(useEditorStore.getInitialState(),true);vi.useFakeTimers();vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);vi.stubGlobal('IntersectionObserver',class{observe(){}disconnect(){}})})
afterEach(async()=>{if(root)await act(async()=>root?.unmount());root=undefined;if(visibleAttribute===undefined)delete document.documentElement.dataset.editorVisible;else document.documentElement.dataset.editorVisible=visibleAttribute;document.body.replaceChildren();useEditorStore.setState(useEditorStore.getInitialState(),true);vi.restoreAllMocks();vi.useRealTimers();vi.unstubAllGlobals()})
it.each(['clean','dirty','gap','missing-receipt','buffered','composition','hidden'] as const)('handles %s incoming revision without erasing local history',async mode=>{
 const{port1,port2}=new MessageChannel(),bridge=new PortBridge(port1,1000),api=createEditorApi(bridge,{nonce:crypto.randomUUID(),recoveryOwnerId:crypto.randomUUID(),recoveryOwnerPersistent:true,mode:'editor',locale:'en',autosaveDelayMs:20000,maxImportBytes:100000,maxDocumentBytes:100000,frameConnectTimeoutMs:15000,bridgeTimeoutMs:45000,rendererPollIntervalMs:1000,wheelZoomDirection:'auto',maxAssistantCheckpointBytes:67108864,editorPollIntervalMs:25,refreshIntervalMs:1000})
 const buffered=mode==='buffered'||mode==='composition'
 const initial=useEditorStore.getState(),doc={...initial.document,id:crypto.randomUUID(),metadata:{...initial.document.metadata,title:'Continuity'},pages:[{...initial.document.pages[0],elements:buffered?[createTextElement({id:'text',content:'Saved'})]:[]}]}
 let snapshot={id:resumeIdSchema.parse(doc.id),revision:resumeRevisionSchema.parse(1),title:'Continuity',documentJson:JSON.stringify(doc),pageCount:doc.pages.length,updatedAt:doc.metadata.updatedAt}
 vi.spyOn(api,'list').mockResolvedValue([snapshot]);vi.spyOn(api,'read').mockImplementation(async()=>snapshot);vi.spyOn(api,'recovery').mockResolvedValue([]);vi.spyOn(api,'register').mockResolvedValue({token:brandString<EditorToken>(crypto.randomUUID()),uncertain:false});vi.spyOn(api,'disconnect').mockResolvedValue(true);vi.spyOn(api,'poll').mockResolvedValue(null);vi.spyOn(api,'backup').mockResolvedValue(true);vi.spyOn(api,'clearBackup').mockResolvedValue(true);const save=vi.spyOn(api,'save')
 const receiptRead=vi.spyOn(api,'changeReceipt').mockImplementation(async()=>mode==='missing-receipt'?null:{requestId:'ai-batch',revision:snapshot.revision,changedElementIds:[],createdAt:snapshot.updatedAt});const archiveRead=vi.spyOn(api,'history')
 const container=document.createElement('div');document.body.append(container);root=createRoot(container)
 try{
  await act(async()=>root?.render(React.createElement(App,{api})));await act(async()=>Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Continuity')!.click())
  await act(async()=>{useEditorStore.setState({past:[{...doc,metadata:{...doc.metadata,title:'Previous'}}],future:[{...doc,metadata:{...doc.metadata,title:'Redo'}}]});if(mode==='dirty')useEditorStore.getState().updateDocumentTitle('Local draft')})
  if(buffered)await act(async()=>{const text=document.querySelector<HTMLElement>('[contenteditable]')!;text.textContent='Buffered draft';text.tabIndex=0;text.focus();if(mode==='composition')text.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}))})
  const retained=useEditorStore.getState()
  snapshot={...snapshot,revision:resumeRevisionSchema.parse(mode==='gap'?3:2),documentJson:JSON.stringify({...doc,metadata:{...doc.metadata,title:'AI result'}})}
  if(mode==='hidden')await act(async()=>{await api.receive('editorVisibility',[false],new AbortController().signal)})
  await act(async()=>vi.advanceTimersByTimeAsync(1000))
  const state=useEditorStore.getState()
  if(mode==='clean'){
   expect(state.document.metadata.title).toBe('AI result');expect(state.past).toHaveLength(2);expect(state.future).toEqual([]);expect(state.isDirty).toBe(false);expect(save).not.toHaveBeenCalled()
   await act(async()=>vi.advanceTimersByTimeAsync(1000));expect(useEditorStore.getState().past).toHaveLength(2);expect(receiptRead).toHaveBeenCalledTimes(1);expect(archiveRead).not.toHaveBeenCalled()
   await act(async()=>state.undo());expect(useEditorStore.getState().document.metadata.title).toBe('Continuity')
  }else if(mode==='hidden'){
   expect(state.document).toBe(retained.document);expect(receiptRead).not.toHaveBeenCalled()
   await act(async()=>{await api.receive('editorVisibility',[true],new AbortController().signal)});await act(async()=>vi.advanceTimersByTimeAsync(1000))
   expect(useEditorStore.getState().document.metadata.title).toBe('AI result')
  }else if(buffered){
   expect(state.document).toBe(retained.document);expect(state.past).toBe(retained.past);expect(document.activeElement?.textContent).toBe('Buffered draft');expect(document.body.textContent).toContain('A saved update is waiting')
   if(mode==='composition')await act(async()=>document.activeElement?.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true})))
   await act(async()=>{(document.activeElement as HTMLElement).blur()});await act(async()=>vi.advanceTimersByTimeAsync(1000))
   const element=useEditorStore.getState().document.pages[0].elements[0];expect(element.type==='text'&&element.content).toBe('Buffered draft');expect(document.body.textContent).toContain('Your draft is retained')
  }else{
   expect(state.document).toBe(retained.document);expect(state.past).toBe(retained.past);expect(state.future).toBe(retained.future)
   expect(Array.from(document.querySelectorAll('button')).some(b=>b.textContent==='Reload saved')).toBe(true)
  }
 }finally{if(root)await act(async()=>root?.unmount());root=undefined;const closed=Promise.all([once(port1,'close'),once(port2,'close')]);bridge.close();port2.close();await closed}
})

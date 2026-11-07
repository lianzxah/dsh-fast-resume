// @vitest-environment jsdom
import React,{act} from 'react'
import {createRoot,type Root} from 'react-dom/client'
import {afterEach,beforeEach,it,expect,vi} from 'vitest'
import {MessageChannel} from 'node:worker_threads'
import {brandString} from '@deepseek-ai/dsh-brand'
import {RichTextEditorOverlay} from '../../upstream/canvas-engine/src/react/RichTextEditorOverlay.tsx'
import {createTextElement} from '../../upstream/canvas-engine/src/element-factory.ts'
import type {ViewportHandle} from '../../upstream/editor/src/lib/viewport-handoff.ts'
import {App} from '../../src/editor/app.tsx'
import {createEditorApi} from '../../src/editor/api.ts'
import {PortBridge} from '../../src/editor/bridge.ts'
import {useEditorStore} from '../../upstream/editor/src/store/editor-store.ts'
import {resumeIdSchema,resumeRevisionSchema} from '../../src/identity.ts'
import type {EditorToken,EditorPreparationId,EditorPreparation} from '../../src/types.ts'
vi.mock('../../src/editor/workspace-panels.tsx',()=>({WorkspacePanels:({onViewport}:{onViewport?:(handle:ViewportHandle|null)=>void})=>{React.useLayoutEffect(()=>{onViewport?.({capture:()=>({scrollX:10,scrollY:20}),restore:async()=>{}});return()=>onViewport?.(null)},[onViewport]);const[open,setOpen]=React.useState(true);const element=useEditorStore.getState().document.pages[0].elements[0];if(!open||element.type!=='text')return null;return React.createElement(RichTextEditorOverlay,{...element,zoom:1,underline:false,strikethrough:false,initialContent:element.content,onCommit:result=>useEditorStore.getState().updateElement(element.id,result),onClose:()=>setOpen(false)})}}))
vi.mock('../../upstream/editor/src/components/layout/StatusBar.tsx',()=>({StatusBar:()=>null}))
vi.mock('../../src/editor/assistant.tsx',()=>({Assistant:()=>null}))
vi.mock('../../src/editor/thumbnail.ts',()=>({renderThumbnail:vi.fn(),renderSavedPage:vi.fn()}))
vi.mock('@resume-editor/canvas-engine',()=>({alignBoxes:vi.fn(),distributeBoxes:vi.fn()}))
const initial=useEditorStore.getState();let root:Root|undefined
beforeEach(()=>{vi.useFakeTimers();vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);vi.stubGlobal('IntersectionObserver',class{observe(){}disconnect(){}})})
afterEach(async()=>{if(root)await act(async()=>root?.unmount());root=undefined;useEditorStore.setState(initial);document.body.replaceChildren();vi.useRealTimers();vi.unstubAllGlobals()})
function deferred<T>(){let resolve!:(value:T)=>void,reject!:(error:Error)=>void;const promise=new Promise<T>((r,j)=>{resolve=r;reject=j});return{promise,resolve,reject}}
it.each(['ready','composition','handoff'] as const)('handles %s input through the actual rich-text overlay before acknowledging preparation',async mode=>{
 const{port1,port2}=new MessageChannel(),bridge=new PortBridge(port1,1000),api=createEditorApi(bridge,{nonce:crypto.randomUUID(),recoveryOwnerId:crypto.randomUUID(),recoveryOwnerPersistent:true,mode:'editor',locale:'en',autosaveDelayMs:2000,maxImportBytes:100000,maxDocumentBytes:100000,frameConnectTimeoutMs:15000,bridgeTimeoutMs:45000,rendererPollIntervalMs:1000,wheelZoomDirection:'auto',maxAssistantCheckpointBytes:67108864,editorPollIntervalMs:25,refreshIntervalMs:200000})
 const element=createTextElement({id:'editing-text',content:'Saved text'});const doc={...initial.document,pages:[{...initial.document.pages[0],elements:[element]}],id:crypto.randomUUID(),metadata:{...initial.document.metadata,title:'Preparation'}}
 let snapshot={id:resumeIdSchema.parse(doc.id),revision:resumeRevisionSchema.parse(1),title:'Preparation',documentJson:JSON.stringify(doc),pageCount:doc.pages.length,updatedAt:'2026-11-01T00:00:00Z'}
 const backup=deferred<boolean>(),save=deferred<typeof snapshot>();let job:EditorPreparation|null=null
 vi.spyOn(api,'list').mockResolvedValue([snapshot]);vi.spyOn(api,'read').mockImplementation(async()=>snapshot);vi.spyOn(api,'recovery').mockResolvedValue([]);vi.spyOn(api,'register').mockResolvedValue({token:brandString<EditorToken>(crypto.randomUUID()),uncertain:false});vi.spyOn(api,'disconnect').mockResolvedValue(true);vi.spyOn(api,'poll').mockImplementation(async()=>job);vi.spyOn(api,'backup').mockReturnValue(backup.promise);vi.spyOn(api,'clearBackup').mockResolvedValue(true);vi.spyOn(api,'save').mockReturnValue(save.promise);const acknowledge=vi.spyOn(api,'acknowledge').mockResolvedValue(true)
 const container=document.createElement('div');document.body.append(container);root=createRoot(container)
 try{
  await act(async()=>root?.render(React.createElement(App,{api})));await act(async()=>Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Preparation')!.click())
  const gesture=()=>{const event=new Event('pointerdown',{bubbles:true,cancelable:true});window.dispatchEvent(event);window.dispatchEvent(new Event('pointerup',{bubbles:true,cancelable:true}));return event.defaultPrevented}
  expect(gesture()).toBe(false)
  const edited={...doc,pages:[{...doc.pages[0],elements:[{...element,content:'Local draft'}]}]}
  const text=document.querySelector<HTMLElement>('[contenteditable]')!;await act(async()=>{text.textContent='Local draft';text.tabIndex=0;text.focus()});expect(api.backup).not.toHaveBeenCalled()
  if(mode==='handoff'){
   const oldPoll=deferred<EditorPreparation|null>();vi.mocked(api.poll).mockReturnValue(oldPoll.promise);vi.spyOn(api,'transfer').mockResolvedValue(true)
   await act(async()=>vi.advanceTimersByTimeAsync(25));expect(api.poll).toHaveBeenCalledOnce()
   const request={resumeId:snapshot.id,targetOwnerId:api.config.recoveryOwnerId,targetIncarnationId:crypto.randomUUID(),transferId:crypto.randomUUID(),checkpointId:crypto.randomUUID()}
   let pending!:Promise<unknown>;await act(async()=>{pending=api.receive('editorCapture',[request],new AbortController().signal);await Promise.resolve()})
   expect(gesture()).toBe(true);expect(api.transfer).not.toHaveBeenCalled()
   await act(async()=>{backup.resolve(true);await Promise.resolve()})
   snapshot={...snapshot,revision:resumeRevisionSchema.parse(2),documentJson:JSON.stringify(edited)}
   await act(async()=>{save.resolve(snapshot);await pending})
   expect(api.transfer).toHaveBeenCalledOnce();expect(JSON.parse(vi.mocked(api.transfer).mock.calls[0][0].checkpointJson).document.pages[0].elements[0].content).toBe('Local draft')
   await act(async()=>{oldPoll.reject(Error('Old poll failed'));await Promise.resolve()})
   expect(gesture()).toBe(true);expect(api.disconnect).not.toHaveBeenCalled();return
  }
  job={id:brandString<EditorPreparationId>(crypto.randomUUID()),expectedRevision:snapshot.revision,deadline:Date.now()+15000}
  if(mode==='composition'){text.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));await act(async()=>vi.advanceTimersByTimeAsync(25));expect(acknowledge).toHaveBeenCalledWith(snapshot.id,job.id,snapshot.revision,false);expect(document.activeElement).toBe(text);expect(api.backup).not.toHaveBeenCalled();expect(api.save).not.toHaveBeenCalled();text.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true}));return}
  await act(async()=>vi.advanceTimersByTimeAsync(25));expect(gesture()).toBe(true);expect(acknowledge).not.toHaveBeenCalled();expect(api.save).not.toHaveBeenCalled()
  await act(async()=>{backup.resolve(true);await Promise.resolve()});expect(api.save).toHaveBeenCalledOnce();expect(JSON.parse(vi.mocked(api.save).mock.calls[0][0].documentJson).pages[0].elements[0].content).toBe('Local draft');expect(acknowledge).not.toHaveBeenCalled()
  snapshot={...snapshot,revision:resumeRevisionSchema.parse(2),documentJson:JSON.stringify(edited)}
  await act(async()=>{save.resolve(snapshot);await Promise.resolve()});expect(acknowledge).toHaveBeenCalledWith(snapshot.id,job.id,snapshot.revision,true);expect(gesture()).toBe(true)
  job=null;await act(async()=>vi.advanceTimersByTimeAsync(25));expect(gesture()).toBe(false)
  window.dispatchEvent(new Event('pointerdown',{bubbles:true,cancelable:true}));job={id:brandString<EditorPreparationId>(crypto.randomUUID()),expectedRevision:snapshot.revision,deadline:Date.now()+15000};await act(async()=>vi.advanceTimersByTimeAsync(25));expect(acknowledge).toHaveBeenLastCalledWith(snapshot.id,job.id,snapshot.revision,false);expect(gesture()).toBe(false)
 }finally{bridge.close();port2.close()}
})

// @vitest-environment jsdom
import React,{act} from 'react'
import {createRoot,type Root} from 'react-dom/client'
import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {MessageChannel} from 'node:worker_threads'
import {CreateResumeDialog,ImportResumeDialog} from '../../src/editor/document-dialogs.tsx'
import {createEditorApi} from '../../src/editor/api.ts'
import {PortBridge} from '../../src/editor/bridge.ts'
import {en} from '../../src/editor/locales.ts'
import type {ResumeSnapshot} from '../../src/types.ts'
let root:Root|undefined,dispose=()=>{}
beforeEach(()=>vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true))
afterEach(async()=>{if(root)await act(async()=>root?.unmount());root=undefined;document.body.replaceChildren();dispose();vi.unstubAllGlobals()})
function api(){const{port1,port2}=new MessageChannel(),bridge=new PortBridge(port1,1000);dispose=()=>{bridge.close();port2.close()};return createEditorApi(bridge,{nonce:'dialogs',recoveryOwnerId:'dialogs',recoveryOwnerPersistent:true,mode:'editor',locale:'en',autosaveDelayMs:2000,maxImportBytes:10485760,maxDocumentBytes:10485760,frameConnectTimeoutMs:15000,bridgeTimeoutMs:45000,rendererPollIntervalMs:1000,wheelZoomDirection:'auto',maxAssistantCheckpointBytes:67108864,editorPollIntervalMs:1000,refreshIntervalMs:2000})}
async function fill(element:HTMLInputElement|HTMLTextAreaElement,value:string){await act(async()=>{const prototype=element.tagName==='INPUT'?HTMLInputElement.prototype:HTMLTextAreaElement.prototype;Object.getOwnPropertyDescriptor(prototype,'value')?.set?.call(element,value);element.dispatchEvent(new Event('input',{bubbles:true}))})}
it('keeps template choice and prevents duplicate creation or dismissal while creating',async()=>{
 const service=api(),close=vi.fn();let rejectCreate:(error:Error)=>void=()=>{}
 const create=vi.spyOn(service,'create').mockImplementation(()=>new Promise<ResumeSnapshot>((_,reject)=>{rejectCreate=reject}))
 const container=document.createElement('div');document.body.append(container);root=createRoot(container)
 await act(async()=>root?.render(React.createElement(CreateResumeDialog,{api:service,copy:en,close,onOpen:vi.fn()})))
 const choice=document.querySelector<HTMLButtonElement>('[aria-label="经典简约"]')!
 await act(async()=>choice.click());expect(choice.getAttribute('aria-pressed')).toBe('true');expect(document.querySelectorAll('[aria-pressed="true"]')).toHaveLength(1)
 await fill(document.querySelector('input')!,'  Synthetic resume  ')
 const form=document.querySelector('form')!
 await act(async()=>{form.requestSubmit();form.requestSubmit()})
 expect(create).toHaveBeenCalledTimes(1);expect(create).toHaveBeenCalledWith({title:'Synthetic resume',templateId:'template-classic'})
 const dialog=document.querySelector<HTMLElement>('[role="dialog"]')!;dialog.focus()
 const tab=new KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true})
 await act(async()=>dialog.dispatchEvent(tab));expect(tab.defaultPrevented).toBe(true);expect(document.activeElement).toBe(dialog)
 await act(async()=>document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})));expect(close).not.toHaveBeenCalled()
 await act(async()=>rejectCreate(Error('Create failed')));expect(document.querySelector('[role="alert"]')?.textContent).toBe('Create failed');expect(document.querySelector('input')?.value).toBe('  Synthetic resume  ')
})
it('validates dropped files and guards the file-reading phase before the import API begins',async()=>{
 const service=api(),close=vi.fn(),imported=vi.spyOn(service,'import').mockRejectedValue(Error('Import failed'))
 const container=document.createElement('div');document.body.append(container);root=createRoot(container)
 await act(async()=>root?.render(React.createElement(ImportResumeDialog,{api:service,copy:en,close,onOpen:vi.fn()})))
 const drop=async(file:File)=>{await act(async()=>{const event=new Event('drop',{bubbles:true,cancelable:true});Object.defineProperty(event,'dataTransfer',{value:{files:[file]}});document.querySelector('.fr-drop-zone')!.dispatchEvent(event)})}
 await drop(new File(['bad'],'bad.exe'));expect(document.querySelector('[role="alert"]')?.textContent).toBe(en.unsupported);expect(imported).not.toHaveBeenCalled()
 let finishRead:(value:ArrayBuffer)=>void=()=>{}
 const file=new File(['# Resume'],'resume.md');Object.defineProperty(file,'arrayBuffer',{value:()=>new Promise<ArrayBuffer>(resolve=>{finishRead=resolve})})
 await drop(file);expect(document.querySelector('input')?.disabled).toBe(true);expect(imported).not.toHaveBeenCalled()
 await act(async()=>document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})));expect(close).not.toHaveBeenCalled()
 await act(async()=>finishRead(new TextEncoder().encode('# Resume').buffer));expect(imported).toHaveBeenCalledTimes(1);expect(document.querySelector('[role="alert"]')?.textContent).toBe('Import failed');expect(document.querySelector('input')?.disabled).toBe(false)
})

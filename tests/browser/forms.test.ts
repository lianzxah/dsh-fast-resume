// @vitest-environment jsdom
import {resumeIdSchema,resumeRevisionSchema} from '../../src/identity.ts'
const rid=resumeIdSchema.parse.bind(resumeIdSchema),rv=resumeRevisionSchema.parse.bind(resumeRevisionSchema)
import React,{act} from 'react'
import {createRoot,type Root} from 'react-dom/client'
import {renderToStaticMarkup} from 'react-dom/server'
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {MessageChannel} from 'node:worker_threads'
import {EditorFrame,connectFrame} from '../../src/client/frame.tsx'
import {App} from '../../src/editor/app.tsx'
import {createEditorApi} from '../../src/editor/api.ts'
import {PortBridge} from '../../src/editor/bridge.ts'
import {en} from '../../src/editor/locales.ts'
import {bootstrapSchema} from '../../src/protocol.ts'

// Exercise the library's browser lifecycle rather than its Node SSR build.
vi.mock('react-resizable-panels',()=>vi.importActual<typeof import('react-resizable-panels')>('../../node_modules/react-resizable-panels/dist/react-resizable-panels.browser.esm.js'))
vi.mock('../../upstream/editor/src/components/layout/MenuBar.tsx',()=>({MenuBar:()=>null}))
vi.mock('../../upstream/editor/src/components/layout/LeftPanel.tsx',()=>({LeftPanel:()=>null}))
vi.mock('../../upstream/editor/src/components/layout/RightPanel.tsx',()=>({RightPanel:()=>null}))
vi.mock('../../upstream/editor/src/components/layout/CanvasWorkspace.tsx',()=>({CanvasWorkspace:()=>null}))
vi.mock('../../upstream/editor/src/components/layout/StatusBar.tsx',()=>({StatusBar:()=>null}))
vi.mock('../../src/editor/assistant.tsx',()=>({Assistant:()=>null,DocumentPreview:()=>null}))
vi.mock('@resume-editor/canvas-engine',()=>({alignBoxes:vi.fn(),distributeBoxes:vi.fn(),renderPageToDataURL:vi.fn()}))

let root:Root|undefined
beforeEach(()=>{vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);vi.stubGlobal('IntersectionObserver',class{observe(){}disconnect(){}})})
afterEach(async()=>{if(root)await act(async()=>root?.unmount());root=undefined;document.body.replaceChildren();vi.unstubAllGlobals()})
function button(label:string){const found=Array.from(document.querySelectorAll('button')).find(b=>b.textContent===label||b.textContent?.trim()===label);if(!found)throw Error(`Missing button ${label}`);return found}
async function fillTitle(title:string){const input=document.querySelector('[role="dialog"] input');if(!input)throw Error('Missing title input');await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set?.call(input,title);input.dispatchEvent(new Event('input',{bubbles:true}))})}

describe('sandboxed document forms',()=>{
 it.each(['getItem','setItem'] as const)('opens with a visible recovery limitation when tab storage %s fails',async method=>{
  const storage=vi.spyOn(Storage.prototype,method).mockImplementation(()=>{throw new DOMException('Storage blocked','SecurityError')})
  const frame=document.createElement('iframe'),assets={html:'"__FAST_RESUME_BOOTSTRAP__"',autosaveDelayMs:2000,maxImportBytes:100000,maxDocumentBytes:100000,frameConnectTimeoutMs:15000,bridgeTimeoutMs:45000,rendererPollIntervalMs:1000,refreshIntervalMs:2000}
  let dispose=()=>{};const{port1,port2}=new MessageChannel(),bridge=new PortBridge(port1,1000)
  try{
   dispose=connectFrame(frame,assets,'en','editor',async()=>null,vi.fn())
   const config=bootstrapSchema.parse(JSON.parse(frame.srcdoc));expect(config.recoveryOwnerPersistent).toBe(false);expect(config.recoveryOwnerId).toBe(config.nonce)
   const api=createEditorApi(bridge,config);vi.spyOn(api,'list').mockResolvedValue([])
   const container=document.createElement('div');document.body.append(container);root=createRoot(container)
   await act(async()=>root?.render(React.createElement(App,{api})))
   expect(document.querySelector('[role="alert"]')?.textContent).toBe(en.recoveryOwnerWarning)
   expect(document.querySelector('h1')).not.toBeNull()
  }finally{storage.mockRestore();dispose();bridge.close();port2.close()}
 })
 it('retains the parent tab owner across frame reconnection while separating editor instances',()=>{
  const key='fast-resume:editor-owner:v1',previous=sessionStorage.getItem(key),frame=document.createElement('iframe')
  const assets={html:'"__FAST_RESUME_BOOTSTRAP__"',autosaveDelayMs:2000,maxImportBytes:100000,maxDocumentBytes:100000,frameConnectTimeoutMs:15000,bridgeTimeoutMs:45000,rendererPollIntervalMs:1000,refreshIntervalMs:2000}
  let dispose=()=>{}
  try{dispose=connectFrame(frame,assets,'en','editor',async()=>null,vi.fn());const first=JSON.parse(frame.srcdoc);dispose();dispose=connectFrame(frame,assets,'en','editor',async()=>null,vi.fn());const second=JSON.parse(frame.srcdoc);expect(second.recoveryOwnerId).toBe(first.recoveryOwnerId);expect(second.nonce).not.toBe(first.nonce)}finally{dispose();if(previous===null)sessionStorage.removeItem(key);else sessionStorage.setItem(key,previous)}
 })
 it('permits interactive form submissions while retaining an opaque origin',()=>{
  const markup=renderToStaticMarkup(React.createElement(EditorFrame,{loadAssets:async()=>{throw Error('Not mounted')},connect:()=>()=>{},t:key=>key,usePanelInfo:()=>{throw Error('Not rendered')},useWorkspaces:()=>{throw Error('Not rendered')},useWorkspaceAccess:()=>false}))
  const container=document.createElement('div');container.innerHTML=markup
  const permissions=container.querySelector('iframe')?.getAttribute('sandbox')?.split(' ')
  expect(permissions).toContain('allow-forms')
  expect(permissions).not.toContain('allow-same-origin')
 })
 it.each(['create','rename'] as const)('submits the %s title through the document API',async operation=>{
  const {port1,port2}=new MessageChannel(),bridge=new PortBridge(port1,1000)
  const api=createEditorApi(bridge,{nonce:'test',recoveryOwnerId:'test',recoveryOwnerPersistent:true,mode:'editor',locale:'en',autosaveDelayMs:2000,maxImportBytes:100000,maxDocumentBytes:100000,frameConnectTimeoutMs:15000,bridgeTimeoutMs:45000,rendererPollIntervalMs:1000,refreshIntervalMs:2000})
  const summary={id:rid('resume'),title:'Before',revision:rv(3),pageCount:1,updatedAt:'2026-10-18T00:00:00Z'}
  vi.spyOn(api,'list').mockResolvedValue(operation==='rename'?[summary]:[])
  const create=vi.spyOn(api,'create').mockRejectedValue(Error('Create reached API'))
  const rename=vi.spyOn(api,'rename').mockRejectedValue(Error('Rename reached API'))
  const container=document.createElement('div');document.body.append(container);root=createRoot(container)
  try{
   await act(async()=>root?.render(React.createElement(App,{api})))
   await act(async()=>button(operation==='create'?en.new:en.rename).click())
   await fillTitle('Harness E2E Resume')
   if(operation==='create')await act(async()=>button('经典简约').click())
   const form=document.querySelector('form');if(!form)throw Error('Missing document form')
   const submit=form.querySelector<HTMLButtonElement>('button:not([type="button"])');expect(submit?.hasAttribute('disabled')).toBe(false)
   await act(async()=>{if(operation==='create')submit?.click();else form.requestSubmit()})
   if(operation==='create')expect(create).toHaveBeenCalledWith({title:'Harness E2E Resume',templateId:'template-classic'})
   else expect(rename).toHaveBeenCalledWith('resume',3,'Harness E2E Resume')
   expect(document.querySelector('[role="alert"]')?.textContent).toContain(`${operation==='create'?'Create':'Rename'} reached API`)
  }finally{bridge.close();port2.close()}
 })
})

describe('resume deletion confirmation',()=>{
 const summary={id:rid('delete-resume'),title:'Synthetic resume — a complete document title that stays visible',revision:rv(7),pageCount:2,updatedAt:'2026-10-18T00:00:00Z'}
 function setup(){
  const {port1,port2}=new MessageChannel(),bridge=new PortBridge(port1,1000)
  const api=createEditorApi(bridge,{nonce:'delete',recoveryOwnerId:'delete',recoveryOwnerPersistent:true,mode:'editor',locale:'en',autosaveDelayMs:2000,maxImportBytes:100000,maxDocumentBytes:100000,frameConnectTimeoutMs:15000,bridgeTimeoutMs:45000,rendererPollIntervalMs:1000,refreshIntervalMs:2000})
  vi.spyOn(api,'list').mockResolvedValue([summary])
  const container=document.createElement('div');document.body.append(container);root=createRoot(container)
  return {api,dispose:()=>{bridge.close();port2.close()}}
 }
 it('names the target, focuses Cancel and restores the trigger for every dismissal',async()=>{
  const {api,dispose}=setup(),remove=vi.spyOn(api,'deleteResume')
  try{
   await act(async()=>root?.render(React.createElement(App,{api})))
   const trigger=button(en.delete)
   for(const dismissal of ['cancel','escape','backdrop'] as const){
    trigger.focus();await act(async()=>trigger.click())
    const dialog=document.querySelector('[role="dialog"]');expect(dialog?.getAttribute('aria-label')).toBe(en.deleteTitle)
    const descriptionId=dialog?.getAttribute('aria-describedby');expect(descriptionId&&document.getElementById(descriptionId)?.textContent).toBe(en.confirmDelete)
    expect(dialog?.textContent).toContain(summary.title);expect(document.activeElement).toBe(button(en.cancel))
    const close=dialog?.querySelector<HTMLButtonElement>('header button');button(en.deleteConfirm).focus()
    await act(async()=>document.dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true})))
    expect(document.activeElement).toBe(close)
    await act(async()=>document.dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',shiftKey:true,bubbles:true,cancelable:true})))
    expect(document.activeElement).toBe(button(en.deleteConfirm))
    await act(async()=>{if(dismissal==='cancel')button(en.cancel).click();else if(dismissal==='escape')document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));else document.querySelector('.fr-modal-shade')?.dispatchEvent(new MouseEvent('mousedown',{bubbles:true}))})
    expect(document.querySelector('[role="dialog"]')).toBeNull();expect(document.activeElement).toBe(trigger)
   }
   expect(remove).not.toHaveBeenCalled()
  }finally{dispose()}
 })
 it('keeps pending deletion in place and shows failure beside the retained document',async()=>{
  const {api,dispose}=setup();let rejectDelete:(error:Error)=>void=()=>{}
  const remove=vi.spyOn(api,'deleteResume').mockImplementation(()=>new Promise((_,reject)=>{rejectDelete=reject}))
  try{
   await act(async()=>root?.render(React.createElement(App,{api})))
   await act(async()=>button(en.delete).click());await act(async()=>button(en.deleteConfirm).click())
   expect(remove).toHaveBeenCalledExactlyOnceWith(summary.id,summary.revision)
   expect(button(en.deleting).disabled).toBe(true);expect(button(en.cancel).disabled).toBe(true)
   await act(async()=>{document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));document.querySelector('.fr-modal-shade')?.dispatchEvent(new MouseEvent('mousedown',{bubbles:true}))})
   expect(document.querySelector('[role="dialog"]')).not.toBeNull()
   await act(async()=>rejectDelete(Error('Deletion was not confirmed')))
   expect(document.querySelector('[role="dialog"] [role="alert"]')?.textContent).toContain('Deletion was not confirmed')
   expect(document.querySelector('[role="dialog"]')?.textContent).toContain(summary.title)
   expect(button(en.deleteConfirm).disabled).toBe(false);expect(button(en.cancel).disabled).toBe(false)
   await act(async()=>button(en.cancel).click());expect(button(summary.title)).toBeDefined()
  }finally{await act(async()=>rejectDelete(Error('Test cleanup')));dispose()}
 })
 it('confirms the selected revision once and refreshes the collection after success',async()=>{
  const {api,dispose}=setup();vi.mocked(api.list).mockResolvedValueOnce([summary]).mockResolvedValue([])
  const remove=vi.spyOn(api,'deleteResume').mockResolvedValue(true)
  try{
   await act(async()=>root?.render(React.createElement(App,{api})))
   await act(async()=>button(en.delete).click());await act(async()=>button(en.deleteConfirm).click())
   expect(remove).toHaveBeenCalledExactlyOnceWith(summary.id,summary.revision)
   expect(document.querySelector('[role="dialog"]')).toBeNull();expect(document.body.textContent).toContain(en.emptyTitle)
  }finally{dispose()}
 })
})

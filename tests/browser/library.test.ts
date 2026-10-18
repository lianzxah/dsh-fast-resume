// @vitest-environment jsdom
import React,{act} from 'react'
import {createRoot,type Root} from 'react-dom/client'
import {afterEach,beforeEach,describe,it,expect,vi} from 'vitest'
import {MessageChannel} from 'node:worker_threads'
import {Library} from '../../src/editor/library.tsx'
import {renderThumbnail} from '../../src/editor/thumbnail.ts'
import {createEditorApi} from '../../src/editor/api.ts'
import {PortBridge} from '../../src/editor/bridge.ts'
import {en} from '../../src/editor/locales.ts'
import {resumeIdSchema,resumeRevisionSchema} from '../../src/identity.ts'
import type {ResumeSnapshot} from '../../src/types.ts'
vi.mock('../../src/editor/thumbnail.ts',()=>({renderThumbnail:vi.fn()}))
let root:Root|undefined
const observers:Array<{callback:(entries:{target:Element;isIntersecting:boolean}[])=>void;target?:Element}>=[]
beforeEach(()=>{observers.length=0;vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);vi.stubGlobal('IntersectionObserver',class{record:{callback:(entries:{target:Element;isIntersecting:boolean}[])=>void;target?:Element};constructor(callback:(entries:{target:Element;isIntersecting:boolean}[])=>void){this.record={callback};observers.push(this.record)}observe(target:Element){this.record.target=target}disconnect(){}})})
afterEach(async()=>{if(root)await act(async()=>root?.unmount());root=undefined;document.body.replaceChildren();vi.unstubAllGlobals();vi.clearAllMocks()})
const snapshot=(title:string,revision=1):ResumeSnapshot=>({id:resumeIdSchema.parse(title),revision:resumeRevisionSchema.parse(revision),title,documentJson:'{}',pageCount:1,updatedAt:title==='Alpha'?'2026-01-01':'2026-01-02'})
function setup(){const{port1,port2}=new MessageChannel(),bridge=new PortBridge(port1,1000),api=createEditorApi(bridge,{nonce:'test',recoveryOwnerId:'test',recoveryOwnerPersistent:true,mode:'editor',locale:'en',autosaveDelayMs:2000,maxImportBytes:100000,maxDocumentBytes:100000,frameConnectTimeoutMs:15000,bridgeTimeoutMs:45000,rendererPollIntervalMs:1000,refreshIntervalMs:2000});const element=document.createElement('div');document.body.append(element);root=createRoot(element);return{api,close:()=>{bridge.close();port2.close()}}}
function props(api:ReturnType<typeof createEditorApi>,documents:ResumeSnapshot[]){return{api,copy:en,documents,busy:false,loading:false,notice:null,children:null,create:vi.fn(),importDocument:vi.fn(),refresh:vi.fn(),conversation:vi.fn(),open:vi.fn(),rename:vi.fn(),duplicate:vi.fn(),remove:vi.fn()}}
async function value(input:HTMLInputElement,text:string){await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set?.call(input,text);input.dispatchEvent(new Event('input',{bubbles:true}))})}
describe('library interactions',()=>{
 it('searches, orders and returns focus to search when clearing an empty result',async()=>{
  const{api,close}=setup();try{
   await act(async()=>root?.render(React.createElement(Library,props(api,[snapshot('Beta'),snapshot('Alpha')]))))
   const titles=()=>Array.from(document.querySelectorAll('.fr-library-card-title')).map(node=>node.textContent)
   expect(titles()).toEqual(['Beta','Alpha'])
   const select=document.querySelector('select')!;await act(async()=>{select.value='title';select.dispatchEvent(new Event('change',{bubbles:true}))});expect(titles()).toEqual(['Alpha','Beta'])
   const input=document.querySelector<HTMLInputElement>('input[type="search"]')!;await value(input,'missing')
   expect(document.body.textContent).toContain(en.noResults)
   const clear=Array.from(document.querySelectorAll('button')).find(button=>button.textContent===en.clearSearch)!;await act(async()=>clear.click())
   expect(document.activeElement).toBe(input);expect(titles()).toEqual(['Alpha','Beta'])
  }finally{close()}
 })
 it('reads visible cards only and never displays an obsolete revision preview',async()=>{
  const{api,close}=setup(),first=snapshot('Alpha'),second=snapshot('Alpha',2),read=vi.spyOn(api,'read').mockResolvedValueOnce(first).mockResolvedValueOnce(second)
  let resolve!:(url:string)=>void;const pending=new Promise<string>(done=>{resolve=done})
  vi.mocked(renderThumbnail).mockImplementationOnce(async()=>pending).mockResolvedValue('data:image/png;base64,new')
  try{
   await act(async()=>root?.render(React.createElement(Library,props(api,[first,snapshot('Beta')]))));expect(read).not.toHaveBeenCalled()
   await act(async()=>{const observer=observers.find(item=>item.target?.closest('article')?.querySelector('.fr-library-card-title')?.textContent==='Alpha')!;observer.callback([{target:observer.target!,isIntersecting:true}])});expect(read).toHaveBeenCalledTimes(1);expect(renderThumbnail).toHaveBeenCalledTimes(1)
   await act(async()=>root?.render(React.createElement(Library,props(api,[second,snapshot('Beta')]))));expect(document.querySelector('img')).toBeNull()
   await act(async()=>{const observer=observers.at(-1)!;observer.callback([{target:observer.target!,isIntersecting:true}]);resolve('data:image/png;base64,obsolete')})
   expect(document.querySelector('img')?.getAttribute('src')).toBe('data:image/png;base64,new');expect(read).toHaveBeenCalledTimes(2)
  }finally{resolve('late');close()}
 })
})

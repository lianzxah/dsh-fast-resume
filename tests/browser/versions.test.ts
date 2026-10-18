// @vitest-environment jsdom
import React,{act} from 'react'
import {createRoot,type Root} from 'react-dom/client'
import {afterEach,beforeEach,describe,it,expect,vi} from 'vitest'
import {MessageChannel} from 'node:worker_threads'
import {Versions} from '../../src/editor/versions.tsx'
import {renderSavedPage} from '../../src/editor/thumbnail.ts'
import {createEditorApi} from '../../src/editor/api.ts'
import {PortBridge} from '../../src/editor/bridge.ts'
import {en} from '../../src/editor/locales.ts'
import {resumeIdSchema,resumeRevisionSchema,versionIdSchema} from '../../src/identity.ts'
import type {DraftState} from '../../src/editor/persistence.ts'
import type {HistoryView,ResumeSnapshot} from '../../src/types.ts'
vi.mock('../../src/editor/thumbnail.ts',()=>({renderSavedPage:vi.fn()}))
const version=(number:number)=>({id:versionIdSchema.parse(`v${number}`),revision:resumeRevisionSchema.parse(number),name:`Moment ${number}`,createdAt:'2026-10-18T00:00:00Z'})
const versions=[version(1),version(2)]
const snapshot=(revision=1):ResumeSnapshot=>({id:resumeIdSchema.parse('history'),revision:resumeRevisionSchema.parse(revision),title:'Synthetic',documentJson:`saved-${revision}`,pageCount:2,updatedAt:'2026-10-18T00:00:00Z'})
const history:HistoryView={versions,proposals:[],changes:[]}
let root:Root|undefined
const observers:Array<{callback:(entries:{target:Element;isIntersecting:boolean}[])=>void;target?:Element}>=[]
beforeEach(()=>{observers.length=0;vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);vi.stubGlobal('IntersectionObserver',class{record:{callback:(entries:{target:Element;isIntersecting:boolean}[])=>void;target?:Element};constructor(callback:(entries:{target:Element;isIntersecting:boolean}[])=>void){this.record={callback};observers.push(this.record)}observe(target:Element){this.record.target=target}disconnect(){}});vi.mocked(renderSavedPage).mockImplementation(async(s,_signal,page,width)=>`data:image/png;base64,${s.revision}-${page}-${width}`)})
afterEach(async()=>{if(root)await act(async()=>root?.unmount());root=undefined;document.body.replaceChildren();vi.unstubAllGlobals();vi.resetAllMocks()})
function deferred<T>(){let resolve!:(value:T)=>void,reject!:(error:Error)=>void;const promise=new Promise<T>((a,b)=>{resolve=a;reject=b});return{resolve,reject,promise}}
function button(label:string){const node=Array.from(document.querySelectorAll('button')).find(item=>item.getAttribute('aria-label')===label||item.textContent===label);if(!node)throw Error(`Missing ${label}`);return node}
function setup(){
 const{port1,port2}=new MessageChannel(),bridge=new PortBridge(port1,1000),api=createEditorApi(bridge,{nonce:'test',recoveryOwnerId:'test',recoveryOwnerPersistent:true,mode:'editor',locale:'en',autosaveDelayMs:2000,maxImportBytes:100000,maxDocumentBytes:100000,frameConnectTimeoutMs:15000,bridgeTimeoutMs:45000,rendererPollIntervalMs:1000,refreshIntervalMs:2000})
 vi.spyOn(api,'history').mockResolvedValue(history);vi.spyOn(api,'version').mockImplementation(async(_id,versionId)=>snapshot(versionId==='v1'?1:2))
 const props={api,copy:en,state:{snapshot:snapshot(5),draft:'saved-5',dirty:false,saving:false,error:null} as DraftState,close:vi.fn(),save:vi.fn(async()=>{}),current:()=>props.state,blocked:false,refresh:vi.fn(async()=>{})}
 const container=document.createElement('div');document.body.append(container);root=createRoot(container)
 return{api,props,render:async()=>act(async()=>root?.render(React.createElement(Versions,props))),dispose:()=>{bridge.close();port2.close()}}
}
async function inputName(value:string){const input=document.querySelector('input')!;await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set?.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}))})}
describe('visual saved-version history',()=>{
 it('renders selected saved pages, lazily renders cards, and changes pages without touching editor state',async()=>{
  const{api,render,dispose}=setup();try{
   await render();expect(api.version).toHaveBeenCalledExactlyOnceWith('history','v2');expect(document.querySelector('.fr-history-page-detail img')?.getAttribute('src')).toBe('data:image/png;base64,2-0-768');expect(document.querySelector('.fr-history-page-thumb img')).toBeNull()
   await act(async()=>{const observer=observers[1];observer.callback([{target:observer.target!,isIntersecting:true}])});expect(document.querySelectorAll('.fr-history-page-thumb img')).toHaveLength(1)
   await act(async()=>button(`${en.historySelect}: Moment 1`).click());expect(document.querySelector('.fr-history-detail h3')?.textContent).toBe('Moment 1');expect(document.querySelector('.fr-history-page-detail img')?.getAttribute('src')).toBe('data:image/png;base64,1-0-768')
   const picker=document.querySelector('select')!;await act(async()=>{picker.value='1';picker.dispatchEvent(new Event('change',{bubbles:true}))});expect(document.querySelector('.fr-history-page-detail img')?.getAttribute('src')).toBe('data:image/png;base64,1-1-768')
   expect(renderSavedPage).toHaveBeenLastCalledWith(expect.objectContaining({documentJson:'saved-1'}),expect.any(AbortSignal),1,768)
  }finally{dispose()}
 })
 it('cancels obsolete selections and offscreen cards, discards late output, and retries failed previews',async()=>{
  const{render,dispose}=setup(),late=deferred<string>();let signal:AbortSignal|undefined
  vi.mocked(renderSavedPage).mockImplementationOnce(async(_s,owner)=>{signal=owner;return late.promise}).mockRejectedValueOnce(Error('Image failed')).mockResolvedValue('data:image/png;base64,retried')
  try{
   await render();await act(async()=>button(`${en.historySelect}: Moment 1`).click());expect(signal?.aborted).toBe(true)
   await act(async()=>late.resolve('data:image/png;base64,obsolete'));expect(document.querySelector('.fr-history-page-detail img')).toBeNull();expect(document.querySelector('.fr-history-detail')?.textContent).toContain(en.historyPreviewError)
   await act(async()=>button(en.retry).click());expect(document.querySelector('.fr-history-page-detail img')?.getAttribute('src')).toBe('data:image/png;base64,retried')
   const card=observers[0];await act(async()=>card.callback([{target:card.target!,isIntersecting:true}]));expect(card.target?.querySelector('img')).not.toBeNull();await act(async()=>card.callback([{target:card.target!,isIntersecting:false}]));expect(card.target?.querySelector('img')).toBeNull()
   await act(async()=>root?.unmount());root=undefined
  }finally{late.resolve('cleanup');dispose()}
 })
 it('retries failed history queries and retains an empty state',async()=>{
  const{api,render,dispose}=setup();vi.mocked(api.history).mockRejectedValueOnce(Error('Offline')).mockResolvedValue({...history,versions:[]})
  try{await render();expect(document.querySelector('[role="alert"]')?.textContent).toContain(en.historyLoadError);await act(async()=>button(en.retry).click());expect(document.body.textContent).toContain(en.noVersions);expect(document.body.textContent).toContain(en.historyEmptyHint)}finally{dispose()}
 })
 it('saves a trimmed name once, prevents dismissal during pending work and owns mutation failure',async()=>{
  const{props,render,dispose}=setup(),gate=deferred<void>();props.save.mockImplementation(()=>gate.promise)
  try{await render();await inputName('  Portfolio  ');await act(async()=>{document.querySelector('form')?.requestSubmit();document.querySelector('form')?.requestSubmit()});expect(props.save).toHaveBeenCalledExactlyOnceWith('Portfolio');expect(button(en.close).disabled).toBe(true);await act(async()=>document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})));expect(props.close).not.toHaveBeenCalled();await act(async()=>gate.reject(Error('Lost acknowledgement')));expect(document.querySelector('[role="dialog"] [role="alert"]')?.textContent).toContain(en.historyMutationError);expect(button(en.restore).disabled).toBe(true);await act(async()=>button(en.reload).click());expect(props.refresh).toHaveBeenCalledTimes(1);expect(button(en.restore).disabled).toBe(false)}finally{gate.resolve();dispose()}
 })
 it.each(['dirty','saving','error','recovery'] as const)('blocks historical replacement for %s state and explains it',async kind=>{
  const{api,props,render,dispose}=setup(),restore=vi.spyOn(api,'restore');if(kind==='error')props.state.error=Object.assign(Error('Conflict'),{code:'conflict'});else if(kind==='recovery')props.blocked=true;else props.state[kind]=true
  try{await render();expect(button(en.restore).disabled).toBe(true);expect(document.querySelector('.fr-history-restore')?.textContent).toContain(en.historyBlocked);await act(async()=>button(en.restore).click());expect(restore).not.toHaveBeenCalled()}finally{dispose()}
 })
 it('selects a newly named version after saving and clears its name field',async()=>{
  const{api,props,render,dispose}=setup();props.save.mockImplementation(async()=>{props.state={...props.state,snapshot:snapshot(6)};vi.mocked(api.history).mockResolvedValue({...history,versions:[...versions,{...version(6),name:'New chapter'}]});vi.mocked(api.version).mockImplementation(async(_id,versionId)=>snapshot(versionId==='v6'?6:1))})
  try{await render();await act(async()=>button(`${en.historySelect}: Moment 1`).click());await inputName('New chapter');await act(async()=>document.querySelector('form')?.requestSubmit());expect(props.save).toHaveBeenCalledExactlyOnceWith('New chapter');expect(document.querySelector('input')?.value).toBe('');expect(document.querySelector('.fr-history-detail h3')?.textContent).toBe('New chapter');expect(document.querySelector('.fr-history-select')?.getAttribute('aria-label')).toContain('New chapter')}finally{dispose()}
 })
 it.each(['save-query-first','revision-query-first'] as const)('selects the named version when parent revision refresh supersedes its query (%s)',async order=>{
  const{api,props,render,dispose}=setup(),saveQuery=deferred<HistoryView>(),revisionQuery=deferred<HistoryView>(),savedVersion={...version(6),name:'New chapter'},updated={...history,versions:[...versions,savedVersion]}
  const coordinator={...props.state};props.current=()=>coordinator
  props.save.mockImplementation(async()=>{coordinator.snapshot=snapshot(6);coordinator.draft='saved-6';props.state={...coordinator}})
  vi.mocked(api.history).mockResolvedValueOnce(history).mockImplementationOnce(()=>saveQuery.promise).mockImplementationOnce(()=>revisionQuery.promise)
  vi.mocked(api.version).mockImplementation(async(_id,versionId)=>snapshot(versionId==='v6'?6:2))
  try{
   await render();await inputName('New chapter');await act(async()=>document.querySelector('form')?.requestSubmit());expect(api.history).toHaveBeenCalledTimes(2)
   await render();expect(api.history).toHaveBeenCalledTimes(3)
   if(order==='save-query-first'){await act(async()=>saveQuery.resolve(updated));await act(async()=>revisionQuery.resolve(updated))}
   else {await act(async()=>revisionQuery.resolve(updated));await act(async()=>saveQuery.resolve(updated))}
   expect(document.querySelector('.fr-history-detail h3')?.textContent).toBe('New chapter');expect(button(`${en.historySelect}: New chapter`).getAttribute('aria-pressed')).toBe('true');expect(document.querySelector('.fr-history-page-detail img')?.getAttribute('src')).toBe('data:image/png;base64,6-0-768')
   await act(async()=>button(`${en.historySelect}: Moment 1`).click());props.state={...props.state,snapshot:snapshot(7)};vi.mocked(api.history).mockResolvedValue(updated);await render();expect(document.querySelector('.fr-history-detail h3')?.textContent).toBe('Moment 1')
  }finally{saveQuery.resolve(updated);revisionQuery.resolve(updated);dispose()}
 })
 it('uses the latest coordinator revision for restore and keeps uncertain failures inside the modal',async()=>{
  const{api,props,render,dispose}=setup(),gate=deferred<Awaited<ReturnType<typeof api.restore>>>(),restore=vi.spyOn(api,'restore').mockImplementation(()=>gate.promise)
  try{await render();props.state={...props.state,snapshot:snapshot(9)};await act(async()=>button(en.restore).click());expect(restore).toHaveBeenCalledWith(expect.objectContaining({expectedRevision:9,versionId:'v2'}));expect(button(en.pending).disabled).toBe(true);await act(async()=>gate.reject(Error('Unknown outcome')));expect(props.close).not.toHaveBeenCalled();expect(document.querySelector('[role="alert"]')?.textContent).toContain(en.historyMutationError);expect(button(en.restore).disabled).toBe(true)}finally{gate.reject(Error('cleanup'));dispose()}
 })
 it('refreshes the current document before closing after acknowledged restore',async()=>{
  const{api,props,render,dispose}=setup();const events:string[]=[];vi.spyOn(api,'restore').mockImplementation(async()=>{events.push('restore');return{requestId:'test',revision:resumeRevisionSchema.parse(6),versionId:versions[0].id,changedElementIds:[],createdAt:versions[0].createdAt}});props.refresh.mockImplementation(async()=>{events.push('refresh')});props.close.mockImplementation(()=>events.push('close'))
  try{await render();await act(async()=>button(en.restore).click());expect(events).toEqual(['restore','refresh','close'])}finally{dispose()}
 })
})

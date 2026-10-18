import {resumeIdSchema,resumeRevisionSchema} from '../../src/identity.ts'
const rid=resumeIdSchema.parse.bind(resumeIdSchema),rv=resumeRevisionSchema.parse.bind(resumeRevisionSchema)
import {afterEach,describe,expect,it,vi} from 'vitest'
import {RendererWorker} from '../../src/client/renderer.ts'
import type {RenderJob} from '../../src/types.ts'
import {RenderQueue} from '../../src/host/render-queue.ts'
import {ResumeError} from '../../src/host/errors.ts'
import {RemoteError} from '@deepseek-ai/dsh-typert-protocol'
import type {} from '../../src/host/index.ts'
import {newDocument} from '../../src/host/operations.ts'
import {PNG} from 'pngjs'
afterEach(()=>vi.useRealTimers())
const job=(id:string):RenderJob=>({id,resumeId:rid('resume'),revision:rv(1),documentJson:'{}',format:'png',pixelRatio:2,deadline:Date.now()+10000})
function deferred<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(r=>{resolve=r});return{resolve,promise}}
describe('connected renderer lifecycle',()=>{
 it('recovers an expired actual queue lease and completes a subsequent export',async()=>{
  vi.useFakeTimers()
  const queue=new RenderQueue({timeoutMs:1000,leaseMs:40,maxRequests:1,maxBytes:100000,maxPixels:10000}),delayed=deferred<void>(),report=vi.fn()
  let polls=0
  const register=vi.fn(async()=>{if(register.mock.calls.length===2)throw Error('Temporary registration failure');return queue.register()}),unregister=vi.fn(async(id:string)=>{queue.unregister(id);return true})
  const worker=new RendererWorker({pollIntervalMs:5,register,poll:async id=>{if(++polls===2)await delayed.promise;try{return queue.poll(id)}catch(error){if(error instanceof ResumeError)throw new RemoteError('FAST_RESUME_ERROR',error.message,{code:error.code});throw error}},complete:r=>queue.complete(r),unregister,render:async()=>PNG.sync.write(new PNG({width:10,height:20})).toString('base64'),assets:async()=>({html:'',autosaveDelayMs:2000,maxDocumentBytes:10,maxImportBytes:10,frameConnectTimeoutMs:15000,bridgeTimeoutMs:45000,rendererPollIntervalMs:5,refreshIntervalMs:2000}),report})
  try{
   await worker.start();await vi.advanceTimersByTimeAsync(45);delayed.resolve();await vi.advanceTimersByTimeAsync(0)
   await vi.advanceTimersByTimeAsync(5)
   expect(register).toHaveBeenCalledTimes(2);expect(unregister).toHaveBeenCalledTimes(1)
   await vi.advanceTimersByTimeAsync(4);expect(register).toHaveBeenCalledTimes(2)
   await vi.advanceTimersByTimeAsync(1);expect(register).toHaveBeenCalledTimes(3)
   const document=newDocument('Recovered renderer');document.pageConfig={...document.pageConfig,width:25.4,height:50.8,dpi:10}
   const exported=queue.request({resumeId:rid(document.id),revision:rv(1),documentJson:JSON.stringify(document),format:'png',pixelRatio:1})
   await vi.advanceTimersByTimeAsync(5)
   expect(await exported).toMatchObject({width:10,height:20,dimensionUnit:'px'})
   expect(report).toHaveBeenCalledTimes(2)
  }finally{delayed.resolve();await worker.dispose();queue.dispose()}
  expect(vi.getTimerCount()).toBe(0)
 })
 it('keeps its lease after a transient poll failure',async()=>{
  vi.useFakeTimers();const register=vi.fn(async()=>({rendererId:'lease',leaseMs:300})),report=vi.fn(),poll=vi.fn(async()=>null)
  poll.mockRejectedValueOnce(Error('Temporary RPC failure'))
  const worker=new RendererWorker({pollIntervalMs:5,register,poll,complete:async()=>true,unregister:async()=>true,render:async()=>'',assets:async()=>({html:'',autosaveDelayMs:2000,maxDocumentBytes:10,maxImportBytes:10,frameConnectTimeoutMs:15000,bridgeTimeoutMs:45000,rendererPollIntervalMs:5,refreshIntervalMs:2000}),report})
  try{await worker.start();await vi.advanceTimersByTimeAsync(5);expect(register).toHaveBeenCalledTimes(1);expect(poll).toHaveBeenCalledTimes(2);expect(report).toHaveBeenCalledTimes(1)}finally{await worker.dispose()}
  expect(vi.getTimerCount()).toBe(0)
 })
 it('disposes a late recovery registration without admitting a replacement worker',async()=>{
  vi.useFakeTimers()
  const queue=new RenderQueue({timeoutMs:1000,leaseMs:40,maxRequests:1,maxBytes:100000,maxPixels:10000}),delayed=deferred<void>(),registered=deferred<void>(),release=deferred<void>()
  let polls=0
  const register=vi.fn(async()=>{const lease=queue.register();if(register.mock.calls.length===2){registered.resolve();await release.promise}return lease}),unregister=vi.fn(async(id:string)=>{queue.unregister(id);return true})
  const worker=new RendererWorker({pollIntervalMs:5,register,poll:async id=>{if(++polls===2)await delayed.promise;try{return queue.poll(id)}catch(error){if(error instanceof ResumeError)throw new RemoteError('FAST_RESUME_ERROR',error.message,{code:error.code});throw error}},complete:r=>queue.complete(r),unregister,render:async()=>'',assets:async()=>({html:'',autosaveDelayMs:2000,maxDocumentBytes:10,maxImportBytes:10,frameConnectTimeoutMs:15000,bridgeTimeoutMs:45000,rendererPollIntervalMs:5,refreshIntervalMs:2000}),report:vi.fn()})
  try{
   await worker.start();await vi.advanceTimersByTimeAsync(45);delayed.resolve();await vi.advanceTimersByTimeAsync(5)
   expect(register).toHaveBeenCalledTimes(2);await registered.promise
   const disposal=worker.dispose();release.resolve();await disposal
   expect(unregister).toHaveBeenCalledTimes(2)
   await expect(queue.request({resumeId:rid('r'),revision:rv(1),documentJson:'{}',format:'png',pixelRatio:1})).rejects.toMatchObject({code:'renderer-unavailable'})
  }finally{delayed.resolve();release.resolve();await worker.dispose();queue.dispose()}
  expect(vi.getTimerCount()).toBe(0)
 })
 it('renews while rendering, serializes claimed jobs, and unregisters on disposal',async()=>{
  vi.useFakeTimers();const gate=deferred<string>();const jobs=[job('first'),job('second')]
  const poll=vi.fn(async()=>jobs.shift()??null),complete=vi.fn(async(_r:unknown)=>true),unregister=vi.fn(async()=>true),report=vi.fn()
  const render=vi.fn(async(_a:unknown,j:RenderJob)=>j.id==='first'?gate.promise:'second-bytes')
  const worker=new RendererWorker({pollIntervalMs:100,register:async()=>({rendererId:'lease',leaseMs:300}),poll,complete,unregister,render,assets:async()=>({html:'',autosaveDelayMs:2000,maxDocumentBytes:10,maxImportBytes:10,frameConnectTimeoutMs:15000,bridgeTimeoutMs:45000,rendererPollIntervalMs:100,refreshIntervalMs:2000}),report})
  await worker.start();await vi.advanceTimersByTimeAsync(200)
  expect(poll.mock.calls.length).toBeGreaterThan(1);expect(render).toHaveBeenCalledTimes(1)
  gate.resolve('first-bytes');await vi.advanceTimersByTimeAsync(0)
  expect(render).toHaveBeenCalledTimes(2);expect(complete.mock.calls.map(c=>c[0])).toHaveLength(2)
  await worker.dispose();expect(unregister).toHaveBeenCalledWith('lease');expect(report).not.toHaveBeenCalled();expect(vi.getTimerCount()).toBe(0)
 })
 it('aborts an active frame and never acknowledges cancelled work as success',async()=>{
  vi.useFakeTimers();const complete=vi.fn(async(_r:unknown)=>true),unregister=vi.fn(async()=>true)
  const render=vi.fn(async(_a:unknown,_j:RenderJob,signal:AbortSignal)=>new Promise<string>((_resolve,reject)=>signal.addEventListener('abort',()=>reject(Error('Cancelled')),{once:true})))
  let first=true;const worker=new RendererWorker({pollIntervalMs:100,register:async()=>({rendererId:'lease',leaseMs:300}),poll:async()=>{if(first){first=false;return job('active')}return null},complete,unregister,render,assets:async()=>({html:'',autosaveDelayMs:2000,maxDocumentBytes:10,maxImportBytes:10,frameConnectTimeoutMs:15000,bridgeTimeoutMs:45000,rendererPollIntervalMs:100,refreshIntervalMs:2000}),report:vi.fn()})
  await worker.start();await vi.advanceTimersByTimeAsync(0);expect(render).toHaveBeenCalledTimes(1)
  await worker.dispose();expect(complete).not.toHaveBeenCalled();expect(unregister).toHaveBeenCalledTimes(1);expect(vi.getTimerCount()).toBe(0)
 })
 it('unregisters a lease that completes registration after disposal',async()=>{
  const registered=deferred<{rendererId:string;leaseMs:number}>(),unregister=vi.fn(async()=>true)
  const worker=new RendererWorker({pollIntervalMs:100,register:()=>registered.promise,poll:async()=>null,complete:async()=>true,unregister,assets:async()=>({html:'',autosaveDelayMs:2000,maxDocumentBytes:10,maxImportBytes:10,frameConnectTimeoutMs:15000,bridgeTimeoutMs:45000,rendererPollIntervalMs:100,refreshIntervalMs:2000}),render:async()=>'',report:vi.fn()})
  const start=worker.start(),close=worker.dispose();registered.resolve({rendererId:'late',leaseMs:300});await start;await close;expect(unregister).toHaveBeenCalledWith('late')
 })
 it('joins overlapping disposal calls until the same delayed unregister finishes',async()=>{
  const gate=deferred<boolean>(),unregister=vi.fn(()=>gate.promise)
  const worker=new RendererWorker({pollIntervalMs:100,register:async()=>({rendererId:'lease',leaseMs:300}),poll:async()=>null,complete:async()=>true,unregister,assets:async()=>({html:'',autosaveDelayMs:2000,maxDocumentBytes:10,maxImportBytes:10,frameConnectTimeoutMs:15000,bridgeTimeoutMs:45000,rendererPollIntervalMs:100,refreshIntervalMs:2000}),render:async()=>'',report:vi.fn()})
  await worker.start();const first=worker.dispose(),second=worker.dispose();let settled=false;void second.then(()=>{settled=true})
  try{await Promise.resolve();await Promise.resolve();expect(settled).toBe(false);expect(unregister).toHaveBeenCalledTimes(1)}
  finally{gate.resolve(true);await first;await second}
  expect(settled).toBe(true)
 })

})

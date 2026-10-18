import {afterEach,describe,it,expect,vi} from 'vitest'
import {VersionPreviewQueue} from '../../src/editor/version-preview.ts'
import {resumeIdSchema,resumeRevisionSchema,versionIdSchema} from '../../src/identity.ts'
import type {ResumeSnapshot} from '../../src/types.ts'
const id=resumeIdSchema.parse('history'),version={id:versionIdSchema.parse('v1'),revision:resumeRevisionSchema.parse(1),name:'First',createdAt:'2026-10-18T00:00:00Z'}
const snapshot:ResumeSnapshot={id,revision:version.revision,title:'Saved',documentJson:'{}',pageCount:2,updatedAt:version.createdAt}
function deferred<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(r=>{resolve=r});return{resolve,promise}}
afterEach(()=>vi.useRealTimers())
describe('immutable version preview ownership',()=>{
 it('discards a cancelled bridge read and skips queued invisible versions',async()=>{
  const readGate=deferred<ResumeSnapshot>(),read=vi.fn(()=>readGate.promise),render=vi.fn(async()=>'page'),queue=new VersionPreviewQueue(read,render,1000),one=new AbortController(),two=new AbortController()
  const first=queue.request(id,version,one.signal),second=queue.request(id,version,two.signal),rejected=[expect(first).rejects.toMatchObject({name:'AbortError'}),expect(second).rejects.toMatchObject({name:'AbortError'})]
  try{await Promise.resolve();one.abort();two.abort();await Promise.all(rejected);readGate.resolve(snapshot);await queue.dispose();expect(read).toHaveBeenCalledExactlyOnceWith(id,version.id);expect(render).not.toHaveBeenCalled()}finally{readGate.resolve(snapshot);await queue.dispose()}
 })
 it('bounds an unresponsive read and admits the next request after the deadline',async()=>{
  vi.useFakeTimers();const late=deferred<ResumeSnapshot>(),read=vi.fn().mockImplementationOnce(()=>late.promise).mockResolvedValue(snapshot),render=vi.fn(async()=>'next'),queue=new VersionPreviewQueue(read,render,50)
  try{const first=queue.request(id,version,new AbortController().signal),failure=expect(first).rejects.toThrow('timed out');await vi.advanceTimersByTimeAsync(50);await failure;expect(await queue.request(id,version,new AbortController().signal)).toMatchObject({url:'next'});late.resolve(snapshot);await Promise.resolve();expect(render).toHaveBeenCalledTimes(1)}finally{late.resolve(snapshot);await queue.dispose()}
 })
 it('rejects a mismatched immutable revision without rendering it',async()=>{
  const render=vi.fn(async()=>'wrong'),queue=new VersionPreviewQueue(async()=>({...snapshot,revision:resumeRevisionSchema.parse(2)}),render,1000)
  try{await expect(queue.request(id,version,new AbortController().signal)).rejects.toThrow('revision');expect(render).not.toHaveBeenCalled()}finally{await queue.dispose()}
 })
 it('serializes selected-page rendering and joins active cleanup before disposal completes',async()=>{
  const started=deferred<AbortSignal>(),cleanup=deferred<void>(),render=vi.fn(async(_snapshot:ResumeSnapshot,signal:AbortSignal)=>{started.resolve(signal);await cleanup.promise;return 'late'}),read=vi.fn(async()=>snapshot),queue=new VersionPreviewQueue(read,render,1000)
  const first=queue.request(id,version,new AbortController().signal,1,768),second=queue.request(id,version,new AbortController().signal),failures=[expect(first).rejects.toMatchObject({name:'AbortError'}),expect(second).rejects.toMatchObject({name:'AbortError'})]
  try{const signal=await started.promise;let disposed=false;const disposal=queue.dispose().then(()=>{disposed=true});expect(signal.aborted).toBe(true);await Promise.resolve();expect(disposed).toBe(false);cleanup.resolve();await disposal;await Promise.all(failures);expect(render).toHaveBeenCalledExactlyOnceWith(snapshot,signal,1,768);expect(read).toHaveBeenCalledTimes(1)}finally{cleanup.resolve();await queue.dispose()}
 })
})

import {describe,it,expect,vi} from 'vitest'
import {PreviewQueue,selectDocuments,StalePreviewError} from '../../src/editor/library-model.ts'
import {resumeIdSchema,resumeRevisionSchema} from '../../src/identity.ts'
import type {ResumeSnapshot} from '../../src/types.ts'
const snapshot=(title:string,date:string,revision=1):ResumeSnapshot=>({id:resumeIdSchema.parse(title),title,updatedAt:date,revision:resumeRevisionSchema.parse(revision),pageCount:1,documentJson:'{}'})
function deferred<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(r=>{resolve=r});return{resolve,promise}}
describe('library browsing and preview admission',()=>{
 it('filters titles and orders without mutating the saved list',()=>{
  const source=[snapshot('Beta','2026-01-02'),snapshot('Alpha','2026-01-03'),snapshot('alphabet','2026-01-01')]
  expect(selectDocuments(source,' ALP ','recent').map(s=>s.title)).toEqual(['Alpha','alphabet'])
  expect(selectDocuments(source,'','oldest').map(s=>s.title)).toEqual(['alphabet','Beta','Alpha'])
  expect(selectDocuments(source,'','title').map(s=>s.title)).toEqual(['Alpha','alphabet','Beta'])
  expect(source[0].title).toBe('Beta')
 })
 it('serializes rendering and skips cards cancelled while queued',async()=>{
  const gate=deferred<string>(),first=snapshot('A','2026-01-01'),second=snapshot('B','2026-01-02'),abort=new AbortController()
  const read=vi.fn(async()=>first),render=vi.fn(async()=>gate.promise),queue=new PreviewQueue(read,render,1000)
  const one=queue.request(first,new AbortController().signal),two=queue.request(second,abort.signal),cancelled=expect(two).rejects.toMatchObject({name:'AbortError'})
  try{await Promise.resolve();await Promise.resolve();abort.abort();gate.resolve('first');expect(await one).toBe('first');await cancelled;expect(read).toHaveBeenCalledTimes(1);expect(render).toHaveBeenCalledTimes(1)}finally{gate.resolve('first');await queue.dispose()}
 })
 it('rejects stale revisions and admits a later valid request after failure',async()=>{
  const summary=snapshot('A','2026-01-01'),read=vi.fn(async()=>({...summary,revision:resumeRevisionSchema.parse(2)})),render=vi.fn(async()=>'new'),queue=new PreviewQueue(read,render,1000)
  try{await expect(queue.request(summary,new AbortController().signal)).rejects.toBeInstanceOf(StalePreviewError);expect(render).not.toHaveBeenCalled();expect(await queue.request({...summary,revision:resumeRevisionSchema.parse(2)},new AbortController().signal)).toBe('new')}finally{await queue.dispose()}
 })
 it('aborts active rendering and joins its cleanup on owner disposal',async()=>{
  const cleanup=deferred<void>(),started=deferred<AbortSignal>(),summary=snapshot('A','2026-01-01')
  const queue=new PreviewQueue(async()=>summary,async(_s,signal)=>{started.resolve(signal);await cleanup.promise;return 'late'},1000)
  const pending=queue.request(summary,new AbortController().signal),cancelled=expect(pending).rejects.toMatchObject({name:'AbortError'})
  const signal=await started.promise,disposal=queue.dispose();expect(signal.aborted).toBe(true)
  cleanup.resolve();await disposal;await cancelled
 })
})

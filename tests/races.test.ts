import {resumeIdSchema,resumeRevisionSchema} from '../src/identity.ts'
const rid=resumeIdSchema.parse.bind(resumeIdSchema),rv=resumeRevisionSchema.parse.bind(resumeRevisionSchema)
import { describe,it,expect,vi } from 'vitest'
import { fork } from 'node:child_process'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ResumeStore,resolveConfig } from '../src/host/store.ts'
import { RenderQueue } from '../src/host/render-queue.ts'
import type { ResumeDocument } from '../src/types.ts'

describe('cross-process revision admission',()=>{
 it('commits one writer and rejects one competing process at the same base',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'resume-process-'));const store=new ResumeStore(resolveConfig(dir,{storageDir:dir}));const snapshot=await store.create({title:'Race'})
  const children=[1,2].map(()=>fork('tests/fixtures/cas-worker.ts',[dir,snapshot.id],{execArgv:['--import','tsx'],stdio:['ignore','ignore','inherit','ipc']}))
  try{
   const ready=children.map(child=>new Promise<void>((resolve,reject)=>{child.once('message',message=>message==='ready'?resolve():reject(Error(String(message))));child.once('error',reject);child.once('exit',code=>{if(code!==0)reject(Error(`Worker exited ${code}`))})}))
   await Promise.all(ready)
   const outcomes=children.map(child=>new Promise(resolve=>child.once('message',resolve)))
   children.forEach(child=>child.send('go'))
   expect((await Promise.all(outcomes)).sort()).toEqual(['conflict','saved'])
   expect((await store.read(snapshot.id)).revision).toBe(2)
  }finally{for(const child of children)child.kill()}
 })
 it.each(['layer','page'] as const)('rejects undo when a later save deletes the edited %s without adding a receipt',async(deletion)=>{
  const dir=await mkdtemp(join(tmpdir(),'resume-deleted-undo-'));const store=new ResumeStore(resolveConfig(dir,{}))
  const snapshot=await store.create({title:'Candidate',templateId:'template-classic'})
  const document:ResumeDocument=JSON.parse(snapshot.documentJson)
  document.pages.push({id:rid('retained-page'),pageNumber:2,elements:[]})
  const text=document.pages[0].elements.find(element=>element.type==='text')!
  await store.save({id:snapshot.id,expectedRevision:rv(1),documentJson:JSON.stringify(document)})
  const proposal=await store.propose({id:snapshot.id,expectedRevision:rv(2),requestId:'propose',summary:'Replace candidate text',operationsJson:JSON.stringify([{type:'text.replace',elementId:text.id,content:'Updated candidate'}])})
  await store.apply({id:snapshot.id,proposalId:proposal.id,requestId:'apply'})
  const draft:ResumeDocument=JSON.parse((await store.read(snapshot.id)).documentJson)
  if(deletion==='layer')draft.pages[0].elements=draft.pages[0].elements.filter(element=>element.id!==text.id)
  else {draft.pages.shift();draft.pages[0].pageNumber=1}
  await store.save({id:snapshot.id,expectedRevision:rv(3),documentJson:JSON.stringify(draft)})
  const committed=await store.read(snapshot.id);const history=await store.history(snapshot.id)
  await expect(store.revert({id:snapshot.id,expectedRevision:rv(4),proposalId:proposal.id,requestId:'undo'})).rejects.toMatchObject({code:'conflict'})
  expect(await store.read(snapshot.id)).toEqual(committed)
  expect((await store.history(snapshot.id)).changes).toEqual(history.changes)
 })
 it('undo preserves unrelated later fields and rejects overlapping edits',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'resume-undo-'));const store=new ResumeStore(resolveConfig(dir,{}));const snapshot=await store.create({title:'Candidate',templateId:'template-classic'})
  const doc:ResumeDocument=JSON.parse(snapshot.documentJson);const element=doc.pages[0].elements[0]
  const proposal=await store.propose({id:snapshot.id,expectedRevision:rv(1),requestId:'propose',summary:'Hide',operationsJson:JSON.stringify([{type:'element.update',elementId:element.id,patch:{visible:false}}])})
  await store.apply({id:snapshot.id,proposalId:proposal.id,requestId:'apply'})
  const current=await store.read(snapshot.id);const draft:ResumeDocument=JSON.parse(current.documentJson);draft.metadata.title='User title';draft.pages[0].elements[1].name='Unrelated user edit'
  await store.save({id:snapshot.id,expectedRevision:rv(2),documentJson:JSON.stringify(draft)})
  await store.revert({id:snapshot.id,expectedRevision:rv(3),proposalId:proposal.id,requestId:'undo'})
  const restored:ResumeDocument=JSON.parse((await store.read(snapshot.id)).documentJson)
  expect(restored.metadata.title).toBe('User title');expect(restored.pages[0].elements[1].name).toBe('Unrelated user edit');expect(restored.pages[0].elements[0].visible).toBe(true)
  const next=await store.propose({id:snapshot.id,expectedRevision:rv(4),requestId:'propose2',summary:'Hide again',operationsJson:JSON.stringify([{type:'element.update',elementId:element.id,patch:{visible:false}}])})
  await store.apply({id:snapshot.id,proposalId:next.id,requestId:'apply2'})
  const overlap:ResumeDocument=JSON.parse((await store.read(snapshot.id)).documentJson);overlap.pages[0].elements[0].visible=true
  await store.save({id:snapshot.id,expectedRevision:rv(5),documentJson:JSON.stringify(overlap)})
  await expect(store.revert({id:snapshot.id,expectedRevision:rv(6),proposalId:next.id,requestId:'undo2'})).rejects.toMatchObject({code:'conflict'})
 })
})
describe('renderer cancellation and byte validation',()=>{
 const config={timeoutMs:300,leaseMs:1000,maxRequests:1,maxBytes:1024,maxPixels:1000000}
 const request={resumeId:rid('r'),revision:rv(1),documentJson:'{}',format:'pdf' as const,pixelRatio:2}
 it('bounds admission, rejects false binary completions and ignores late completions',async()=>{
  const queue=new RenderQueue(config);const renderer=queue.register();const pending=queue.request(request);const rejected=expect(pending).rejects.toMatchObject({code:'invalid-input'})
  await expect(queue.request(request)).rejects.toMatchObject({code:'queue-full'})
  const job=queue.poll(renderer.rendererId)!
  await queue.complete({rendererId:renderer.rendererId,jobId:job.id,dataBase64:Buffer.from('{"ok":true}').toString('base64')});await rejected
  await expect(queue.complete({rendererId:renderer.rendererId,jobId:job.id,dataBase64:'JVBERi0='})).rejects.toMatchObject({code:'render-cancelled'})
  queue.dispose()
 })
 it('ends aborted, timed out and disposed work without receipts',async()=>{
  vi.useFakeTimers()
  try{
   const queue=new RenderQueue(config);queue.register();const controller=new AbortController();const aborted=queue.request(request,controller.signal);const cancelled=expect(aborted).rejects.toMatchObject({code:'render-cancelled'});controller.abort();await cancelled
   const timeout=queue.request(request);const timed=expect(timeout).rejects.toMatchObject({code:'render-timeout'});await vi.advanceTimersByTimeAsync(300);await timed
   const disposed=queue.request(request);const rejected=expect(disposed).rejects.toMatchObject({code:'render-cancelled'});queue.dispose();await rejected
  }finally{vi.useRealTimers()}
 })
})

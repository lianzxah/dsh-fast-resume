import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { ResumeStore, resolveConfig } from '../src/host/store.ts'
import { SessionContextStore } from '../src/host/session-context.ts'
const sid=(id:string)=>brandString<SessionId>(id)
const roots:string[]=[]
afterEach(async()=>{await Promise.all(roots.splice(0).map(dir=>rm(dir,{recursive:true,force:true})))})
async function fixture(){const dir=await mkdtemp(join(tmpdir(),'resume-context-'));roots.push(dir);const docs=new ResumeStore(resolveConfig(dir,{}));const contexts=new SessionContextStore(docs);const x=await docs.create({title:'X',sessionId:'A'}),y=await docs.create({title:'Y'});return{docs,contexts,x,y}}
describe('Session resume targets',()=>{
 it('keeps independent and shared targets across restart without writing documents',async()=>{
  const{docs,contexts,x,y}=await fixture();const before=await readFile(join(docs.config.storageDir,`${x.id}.json`),'utf8')
  await contexts.bind({sessionId:sid('A'),resumeId:x.id,expectedRevision:x.revision,requestId:'a'})
  await contexts.bind({sessionId:sid('B'),resumeId:y.id,expectedRevision:y.revision,requestId:'b'})
  await contexts.bind({sessionId:sid('C'),resumeId:x.id,expectedRevision:x.revision,requestId:'c'})
  const restarted=new SessionContextStore(docs)
  for(const [session,resume] of [['A',x],['B',y],['C',x]] as const)expect(await restarted.resolve(sid(session))).toMatchObject({state:'bound',context:{sessionId:session,resumeId:resume.id},revision:1})
  expect(await readFile(join(docs.config.storageDir,`${x.id}.json`),'utf8')).toBe(before)
  expect(await docs.read(x.id)).toEqual(x)
 })
 it('does not infer bindings from legacy associations or explicit comparison reads',async()=>{
  const{contexts,x,y}=await fixture()
  expect(await contexts.resolve(sid('A'))).toEqual({state:'choose',reason:'missing'})
  await contexts.bind({sessionId:sid('A'),resumeId:x.id,expectedRevision:x.revision,requestId:'a'})
  expect(await contexts.resolve(sid('A'),y.id)).toMatchObject({state:'bound',context:{resumeId:y.id}})
  expect(await contexts.resolve(sid('A'))).toMatchObject({context:{resumeId:x.id}})
  expect(await contexts.resolve(sid('fork'))).toEqual({state:'choose',reason:'missing'})
 })
 it('reports deleted targets and rejects stale selections without replacing the binding',async()=>{
  const{docs,contexts,x,y}=await fixture()
  await contexts.bind({sessionId:sid('A'),resumeId:x.id,expectedRevision:x.revision,requestId:'a'})
  await docs.rename(y.id,y.revision,'New title')
  await expect(contexts.bind({sessionId:sid('A'),resumeId:y.id,expectedRevision:y.revision,requestId:'stale'})).rejects.toMatchObject({code:'conflict'})
  await docs.remove(x.id,x.revision)
  expect(await contexts.resolve(sid('A'))).toEqual({state:'choose',reason:'deleted'})
 })
 it('retries identical selections durably without rebinding and rejects changed inputs',async()=>{
  const{docs,contexts,x,y}=await fixture();const request={sessionId:sid('A'),resumeId:x.id,expectedRevision:x.revision,requestId:'same'}
  const original=await contexts.bind(request)
  await contexts.bind({...request,resumeId:y.id,requestId:'next'})
  expect(await new SessionContextStore(docs).bind(request)).toEqual(original)
  expect(await contexts.resolve(sid('A'))).toMatchObject({context:{resumeId:y.id}})
  await expect(contexts.bind({...request,resumeId:y.id})).rejects.toMatchObject({code:'conflict'})
 })
 it('serializes independent context writers without losing retry receipts',async()=>{
  const{docs,contexts,x,y}=await fixture();const other=new SessionContextStore(docs)
  const requests=[{sessionId:sid('A'),resumeId:x.id,expectedRevision:x.revision,requestId:'first'},{sessionId:sid('A'),resumeId:y.id,expectedRevision:y.revision,requestId:'second'}]
  const results=await Promise.all([contexts.bind(requests[0]),other.bind(requests[1])])
  for(const [index,request] of requests.entries())expect(await new SessionContextStore(docs).bind(request)).toEqual(results[index])
 })
 it('hashes unsafe Session names and refuses corrupt or mismatched persisted records',async()=>{
  const{docs,contexts,x}=await fixture();const sessionId=sid('../unsafe/session')
  await contexts.bind({sessionId,resumeId:x.id,expectedRevision:x.revision,requestId:'a'})
  const directory=join(docs.config.storageDir,'contexts-v1'),files=await readdir(directory)
  expect(files).toHaveLength(1);expect(files[0]).toMatch(/^[a-f0-9]{64}\.json$/)
  const path=join(directory,files[0]);const valid=JSON.parse(await readFile(path,'utf8'))
  await writeFile(path,'{"schemaVersion":99}')
  await expect(contexts.resolve(sessionId)).rejects.toMatchObject({code:'invalid-storage'})
  valid.context.sessionId='another';await writeFile(path,JSON.stringify(valid))
  await expect(contexts.resolve(sessionId)).rejects.toMatchObject({code:'invalid-storage'})
 })
})
it('repairs a committed target after restart and later document revisions without another document write',async()=>{
 const{docs,contexts,x,y}=await fixture();await contexts.bind({sessionId:sid('A'),resumeId:x.id,expectedRevision:x.revision,requestId:'selected'})
 const intent={sessionId:sid('A'),resumeId:y.id,requestId:'committed',fingerprint:'a'.repeat(64)};await contexts.beginCommit(intent);const committed=await docs.save({id:y.id,expectedRevision:y.revision,documentJson:y.documentJson});const newer=await docs.rename(y.id,committed.revision,'Later manual edit')
 const restarted=new SessionContextStore(docs);expect(await restarted.finishCommit(intent,committed.revision)).toBe('bound');expect(await restarted.resolve(sid('A'))).toMatchObject({state:'bound',context:{resumeId:y.id},revision:newer.revision});expect(await docs.read(y.id)).toEqual(newer)
})
it('preserves a later explicit selection even when all timestamps are identical',async()=>{
 const{vi}=await import('vitest');vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-11-01T00:00:00Z'))
 try{const{docs,contexts,x,y}=await fixture();await contexts.bind({sessionId:sid('A'),resumeId:x.id,expectedRevision:x.revision,requestId:'before'});const intent={sessionId:sid('A'),resumeId:y.id,requestId:'mutation',fingerprint:'a'.repeat(64)};await contexts.beginCommit(intent);const committed=await docs.save({id:y.id,expectedRevision:y.revision,documentJson:y.documentJson});await contexts.bind({sessionId:sid('A'),resumeId:x.id,expectedRevision:x.revision,requestId:'after'});expect(await contexts.finishCommit(intent,committed.revision)).toBe('superseded');expect(await contexts.finishCommit(intent,committed.revision)).toBe('superseded');expect(await contexts.resolve(sid('A'))).toMatchObject({context:{resumeId:x.id,source:'explicit-tool'}})}finally{vi.useRealTimers()}
})
it('rejects a competing unresolved intent until an explicit selection supersedes it',async()=>{const{docs,contexts,x,y}=await fixture(),first={sessionId:sid('A'),resumeId:x.id,requestId:'first',fingerprint:'a'.repeat(64)},second={sessionId:sid('A'),resumeId:y.id,requestId:'second',fingerprint:'b'.repeat(64)};await contexts.beginCommit(first);await new SessionContextStore(docs).beginCommit(first);await expect(new SessionContextStore(docs).beginCommit(second)).rejects.toMatchObject({code:'conflict'});await contexts.bind({sessionId:sid('A'),resumeId:y.id,expectedRevision:y.revision,requestId:'supersede'});await contexts.beginCommit(second);expect((await readdir(join(docs.config.storageDir,'context-commits-v1'))).filter(name=>name.endsWith('.json'))).toHaveLength(1)})
it('recovers a context persisted before intent cleanup without appending another binding',async()=>{const{docs,contexts,x}=await fixture(),intent={sessionId:sid('A'),resumeId:x.id,requestId:'mutation',fingerprint:'a'.repeat(64)};await contexts.beginCommit(intent);const directory=join(docs.config.storageDir,'context-commits-v1'),path=join(directory,(await readdir(directory)).find(name=>name.endsWith('.json'))!),pending=await readFile(path,'utf8'),saved=await docs.save({id:x.id,expectedRevision:x.revision,documentJson:x.documentJson});await contexts.finishCommit(intent,saved.revision);await writeFile(path,pending);const contextDirectory=join(docs.config.storageDir,'contexts-v1'),contextPath=join(contextDirectory,(await readdir(contextDirectory)).find(name=>name.endsWith('.json'))!),before=await readFile(contextPath,'utf8');expect(await new SessionContextStore(docs).finishCommit(intent,saved.revision)).toBe('bound');expect(await readFile(contextPath,'utf8')).toBe(before);expect((await readdir(directory)).filter(name=>name.endsWith('.json'))).toEqual([])})
it('preserves the current selection when a historical receipt has no ordering evidence',async()=>{const{docs,contexts,x,y}=await fixture();await contexts.bind({sessionId:sid('A'),resumeId:x.id,expectedRevision:x.revision,requestId:'selected'});const saved=await docs.save({id:y.id,expectedRevision:y.revision,documentJson:y.documentJson});expect(await contexts.finishCommit({sessionId:sid('A'),resumeId:y.id,requestId:'historical',fingerprint:'a'.repeat(64)},saved.revision)).toBe('ambiguous');expect(await contexts.resolve(sid('A'))).toMatchObject({context:{resumeId:x.id}})})
it('serializes same-Session executions across independent stores and checks queued cancellation',async()=>{const{docs,contexts}=await fixture(),other=new SessionContextStore(docs);let entered!:()=>void,release!:()=>void;const ready=new Promise<void>(r=>{entered=r}),gate=new Promise<void>(r=>{release=r}),controller=new AbortController();const order:string[]=[];const first=contexts.executeCommit(sid('A'),undefined,async()=>{order.push('first');entered();await gate;order.push('finished')});await ready;const second=other.executeCommit(sid('A'),undefined,async()=>{order.push('second')});const cancelled=other.executeCommit(sid('A'),controller.signal,async()=>{order.push('cancelled')});const rejected=expect(cancelled).rejects.toMatchObject({code:'edit-cancelled'});controller.abort();release();await Promise.all([first,second,rejected]);expect(order).toEqual(['first','finished','second']);await Promise.all([contexts.dispose(),other.dispose()])})
it('disposes queued execution waits without starting their mutation',async()=>{const{docs,contexts}=await fixture(),other=new SessionContextStore(docs);let entered!:()=>void,release!:()=>void;const ready=new Promise<void>(r=>{entered=r}),gate=new Promise<void>(r=>{release=r});const first=contexts.executeCommit(sid('A'),undefined,async()=>{entered();await gate});await ready;const queued=other.executeCommit(sid('A'),undefined,async()=>{throw Error('must not execute')}),rejected=expect(queued).rejects.toMatchObject({code:'edit-cancelled'}),disposed=other.dispose();release();await Promise.all([first,rejected,disposed]);await contexts.dispose()})

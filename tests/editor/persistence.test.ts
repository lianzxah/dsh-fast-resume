import {resumeIdSchema,resumeRevisionSchema} from '../../src/identity.ts'
const rid=resumeIdSchema.parse.bind(resumeIdSchema),rv=resumeRevisionSchema.parse.bind(resumeRevisionSchema)
import { describe, expect, it, vi } from 'vitest'
import { SaveCoordinator } from '../../src/editor/persistence.ts'
import type { ResumeSnapshot, SaveRequest } from '../../src/types.ts'
import {mkdtemp,rm} from 'node:fs/promises'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {ResumeStore,resolveConfig} from '../../src/host/store.ts'
import {matchesAcknowledgedDraft} from '../../src/client/recovery.ts'
import type {Recovery} from '../../src/protocol.ts'
const snapshot = (id=rid('a'), revision=rv(1), documentJson='first'): ResumeSnapshot => ({id,revision,documentJson,title:id,pageCount:1,updatedAt:'now'})
function deferred<T>() { let resolve!: (v:T)=>void; let reject!: (v:Error)=>void; const promise=new Promise<T>((a,b)=>{resolve=a;reject=b}); return {promise,resolve,reject} }
describe('serialized draft persistence',()=>{
 it('clears the submitted recovery JSON after Host canonicalization and reopens without recovery',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'resume-recovery-'))
  try{
   const store=new ResumeStore(resolveConfig(directory,{})),initial=await store.create({title:'Recovery'})
   const document=JSON.parse(initial.documentJson);document.metadata.updatedAt='2000-01-01T00:00:00Z';document.metadata.title='Acknowledged edit'
   const submitted=JSON.stringify(document)
   let recovery:Recovery|null={id:initial.id,revision:initial.revision,documentJson:submitted,updatedAt:0,ownerId:'editor-a',editorId:'editor-a',localRevision:1}
   const acknowledged=vi.fn(async(saved:ResumeSnapshot,sent:string)=>{if(matchesAcknowledgedDraft(recovery,saved.revision,sent))recovery=null})
   const c=new SaveCoordinator(initial,r=>store.save(r),()=>{},acknowledged)
   c.edit(submitted);await c.flush()
   expect(c.state.dirty).toBe(false);expect(c.state.draft).not.toBe(submitted)
   expect(acknowledged).toHaveBeenCalledWith(c.state.snapshot,submitted)
   expect(recovery).toBeNull()
   const reopened=new SaveCoordinator(await store.read(initial.id),r=>store.save(r))
   expect(reopened.state.dirty).toBe(false);expect(reopened.state.draft).toBe(c.state.snapshot.documentJson)
  }finally{await rm(directory,{recursive:true,force:true})}
 })
 it('retains a newer recovery draft when an older submitted draft is acknowledged',async()=>{
  const gate=deferred<ResumeSnapshot>(),cleanup=vi.fn(async(saved:ResumeSnapshot,sent:string)=>{if(matchesAcknowledgedDraft(recovery,saved.revision,sent))recovery=null})
  let recovery:Recovery|null={id:rid('a'),revision:rv(1),documentJson:'submitted',updatedAt:0,ownerId:'editor-a',editorId:'editor-a',localRevision:1}
  const c=new SaveCoordinator(snapshot(),()=>gate.promise,()=>{},cleanup)
  c.edit('submitted');const saved=c.flush();recovery={id:rid('a'),revision:rv(1),documentJson:'newer local backup',updatedAt:1,ownerId:'editor-a',editorId:'editor-a',localRevision:2}
  gate.resolve(snapshot(rid('a'),rv(2),'canonical submitted'));await saved
  expect(cleanup).toHaveBeenCalledWith(c.state.snapshot,'submitted')
  expect(recovery?.documentJson).toBe('newer local backup')
  expect(matchesAcknowledgedDraft({...recovery!,revision:rv(3)},2,'newer local backup')).toBe(false)
 })
 it('coalesces edits while preserving the latest dirty draft after a delayed response',async()=>{
  const first=deferred<ResumeSnapshot>(); const calls:SaveRequest[]=[]
  const save=vi.fn(async(r:SaveRequest)=>{calls.push(r);return calls.length===1?first.promise:snapshot(rid('a'),rv(3),r.documentJson)})
  const c=new SaveCoordinator(snapshot(),save)
  c.edit('second');const pending=c.flush();c.edit('third');c.edit('fourth')
  expect(c.state.dirty).toBe(true);expect(save).toHaveBeenCalledTimes(1)
  first.resolve(snapshot(rid('a'),rv(2),'second'));await pending
  expect(calls.map(r=>[r.expectedRevision,r.documentJson])).toEqual([[1,'second'],[2,'fourth']])
  expect(c.state.dirty).toBe(false);expect(c.state.snapshot.revision).toBe(3)
 })
 it('cannot write an old document completion into a newly opened editor',async()=>{
  const d=deferred<ResumeSnapshot>();const a=new SaveCoordinator(snapshot(),()=>d.promise)
  a.edit('old edit');const pending=a.flush();a.dispose()
  const b=new SaveCoordinator(snapshot(rid('b')),async()=>snapshot(rid('b'),rv(2)));
  d.resolve(snapshot(rid('a'),rv(2)));await pending
  expect(b.state.snapshot.id).toBe('b');expect(b.state.draft).toBe('first')
 })
 it('retains draft and stops after a revision conflict',async()=>{
  const error=Object.assign(new Error('Conflict'),{code:'conflict'})
  const save=vi.fn(async()=>{throw error});const c=new SaveCoordinator(snapshot(),save)
  c.edit('draft');await expect(c.flush()).rejects.toThrow('Conflict')
  expect(c.state.draft).toBe('draft');expect(c.state.dirty).toBe(true)
  expect(c.state.error).toBe(error);await expect(c.flush()).rejects.toThrow('Conflict')
  expect(save).toHaveBeenCalledTimes(1)
 })
 it('only accepts remote updates when clean; blocks a dirty revision without losing edits',()=>{
  const c=new SaveCoordinator(snapshot(),async()=>snapshot())
  expect(c.receive(snapshot(rid('a'),rv(2),'remote'))).toBe(true);c.edit('local')
  expect(c.receive(snapshot(rid('a'),rv(3),'remote again'))).toBe(false)
  expect(c.state.draft).toBe('local');expect(c.state.error?.code).toBe('conflict')
 })
 it('preserves a named version requested while autosave is awaiting its acknowledgement',async()=>{
  const first=deferred<ResumeSnapshot>();const calls:SaveRequest[]=[]
  const c=new SaveCoordinator(snapshot(),async r=>{calls.push(r);return calls.length===1?first.promise:snapshot(rid('a'),rv(3),r.documentJson)})
  c.edit('changed');const autosave=c.flush();const named=c.flush('Interview draft')
  first.resolve(snapshot(rid('a'),rv(2),'changed'));await autosave;await named
  expect(calls).toHaveLength(2);expect(calls[1].versionName).toBe('Interview draft');expect(calls[1].expectedRevision).toBe(2)
 })

})

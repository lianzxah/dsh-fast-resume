import {resumeIdSchema,resumeRevisionSchema} from '../src/identity.ts'
const rid=resumeIdSchema.parse.bind(resumeIdSchema),rv=resumeRevisionSchema.parse.bind(resumeRevisionSchema)
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'
import { ResumeStore, resolveConfig } from '../src/host/store.ts'
import { applyOperations } from '../src/host/operations.ts'
import { RenderQueue } from '../src/host/render-queue.ts'
import type { ResumeDocument } from '../src/types.ts'

async function store() { const dir = await mkdtemp(join(tmpdir(), 'resume-store-')); return new ResumeStore(resolveConfig(dir, {})) }
describe('atomic document store', () => {
  it('creates, saves, lists, recursively duplicates and restores with links intact', async () => {
    const s = await store(); const a = await s.create({ title: 'Candidate', templateId: 'template-classic' })
    const doc: ResumeDocument = JSON.parse(a.documentJson)
    const first = doc.pages[0].elements[0]; first.link = { url: 'https://example.test' }
    doc.pages[0].elements = [{ ...first, id:rid('group'), type:'group', children:[first] }]
    const b = await s.save({id:a.id, expectedRevision:rv(1), documentJson:JSON.stringify(doc), versionName:'Grouped'})
    const duplicate = await s.duplicate(a.id)
    const copy: ResumeDocument = JSON.parse(duplicate.documentJson)
    expect(copy.id).not.toBe(a.id); expect(copy.pages[0].id).not.toBe(doc.pages[0].id)
    expect(copy.pages[0].elements[0].id).not.toBe('group')
    const group=copy.pages[0].elements[0]; if(group.type !== 'group') throw Error('Expected group')
    expect(group.children[0].id).not.toBe(first.id); expect(group.children[0].link).toEqual(first.link)
    const history=await s.history(a.id); expect(history.versions.at(-1)?.name).toBe('Grouped')
    const restored=await s.restore({id:a.id, expectedRevision:b.revision, versionId:history.versions[0].id, requestId:'restore-1'})
    expect(restored.revision).toBe(3); expect((await s.list()).length).toBe(2)
    await s.remove(a.id, rv(3)); await expect(s.read(a.id)).rejects.toMatchObject({code:'not-found'})
  })
  it('allows exactly one of two independent writers starting at one revision', async () => {
    const a=await store(); const b=new ResumeStore(a.config); const d=await a.create({title:'Race'})
    const request={id:d.id, expectedRevision:rv(1), documentJson:d.documentJson}
    const outcomes=await Promise.allSettled([a.save(request),b.save(request)])
    expect(outcomes.filter(r=>r.status==='fulfilled')).toHaveLength(1)
    expect(outcomes.filter(r=>r.status==='rejected')).toHaveLength(1)
    expect((await a.read(d.id)).revision).toBe(2)
  })
  it('retains the previous document after atomic replacement fails', async () => {
    const s=await store(); const d=await s.create({title:'Original'})
    const failing=new ResumeStore(s.config,async()=>{throw Error('injected filesystem failure')})
    await expect(failing.save({id:d.id,expectedRevision:rv(1),documentJson:d.documentJson})).rejects.toMatchObject({code:'storage-failure'})
    expect((await s.read(d.id)).revision).toBe(1)
  })
  it('rejects corrupt storage and duplicate nested element identities', async () => {
    const s=await store(); const d=await s.create({title:'Candidate',templateId:'template-classic'})
    const doc:ResumeDocument=JSON.parse(d.documentJson); doc.pages[0].elements.push(structuredClone(doc.pages[0].elements[0]))
    await expect(s.save({id:d.id,expectedRevision:rv(1),documentJson:JSON.stringify(doc)})).rejects.toMatchObject({code:'invalid-input'})
    await writeFile(join(s.config.storageDir,`${d.id}.json`),'{"schemaVersion":88}')
    await expect(s.read(d.id)).rejects.toMatchObject({code:'invalid-storage'})
  })
  it('persists proposals and idempotent apply receipts without touching the base prematurely',async()=>{
    const s=await store(); const d=await s.create({title:'Candidate',templateId:'template-classic'})
    const doc:ResumeDocument=JSON.parse(d.documentJson);const el=doc.pages[0].elements.find(e=>e.type==='text')!
    const proposal=await s.propose({id:d.id,expectedRevision:rv(1),requestId:'propose-1',summary:'Hide a text layer',operationsJson:JSON.stringify([{type:'element.update',elementId:el.id,patch:{visible:false}}])})
    expect((await s.read(d.id)).revision).toBe(1)
    const restarted=new ResumeStore(s.config);const request={id:d.id,proposalId:proposal.id,requestId:'apply-1'}
    expect(await restarted.apply(request)).toEqual(await restarted.apply(request))
    await expect(restarted.apply({...request,requestId:'different'})).rejects.toMatchObject({code:'conflict'})
    expect((await restarted.read(d.id)).revision).toBe(2)
  })
})
describe('bounded connected renderer',()=>{
 it('rejects disconnected exports and cancels work on renderer disconnect',async()=>{
   const queue=new RenderQueue({timeoutMs:500,leaseMs:1000,maxRequests:2,maxBytes:1000,maxPixels:1000000})
   const request={resumeId:rid('r'),revision:rv(1),documentJson:'{}',format:'pdf' as const,pixelRatio:2}
   await expect(queue.request(request)).rejects.toMatchObject({code:'renderer-unavailable'})
   const lease=queue.register();const pending=queue.request(request);expect(queue.poll(lease.rendererId)).not.toBeNull()
   queue.unregister(lease.rendererId)
   await expect(pending).rejects.toMatchObject({code:'render-cancelled'})
   queue.dispose()
 })
})

describe('top-level editing operations',()=>{
 it('changes the owned page array for text replacement, deletion and reordering',async()=>{
  const s=await store();const snapshot=await s.create({title:'Layers',templateId:'template-classic'});const doc:ResumeDocument=JSON.parse(snapshot.documentJson)
  const text=doc.pages[0].elements.find(element=>element.type==='text')!;const id=text.id
  const apply=(operations:unknown)=>applyOperations(doc,JSON.stringify(operations),10,10485760).document
  const replaced=apply([{type:'text.replace',elementId:id,content:'Updated candidate'}]).pages[0].elements.find(element=>element.id===id)
  expect(replaced?.type==='text'?replaced.content:undefined).toBe('Updated candidate')
  expect(apply([{type:'element.delete',elementId:id}]).pages[0].elements.some(element=>element.id===id)).toBe(false)
  expect(apply([{type:'element.reorder',elementId:id,index:0}]).pages[0].elements[0].id).toBe(id)
 })
})

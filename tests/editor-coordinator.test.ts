import {afterEach,expect,it,vi} from 'vitest'
import {mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {randomUUID} from 'node:crypto'
import {brandString} from '@deepseek-ai/dsh-brand'
import {ResumeStore,resolveConfig} from '../src/host/store.ts'
import {EditorCoordinator} from '../src/host/editor-coordinator.ts'
import type {EditorOwnerId,EditorIncarnationId,ResumeId,EditorToken} from '../src/types.ts'
const roots:string[]=[]
const coordinators:EditorCoordinator[]=[]
afterEach(async()=>{await Promise.all(coordinators.splice(0).map(c=>c.dispose()));await Promise.all(roots.splice(0).map(p=>rm(p,{recursive:true,force:true})))})
async function fixture(){const root=await mkdtemp(join(tmpdir(),'resume-owner-'));roots.push(root);const store=new ResumeStore(resolveConfig(root,{editorPollIntervalMs:5}));const c=new EditorCoordinator(store);coordinators.push(c);const snapshot=await store.create({title:'Candidate'});const registration={resumeId:snapshot.id,ownerId:brandString<EditorOwnerId>(randomUUID()),incarnationId:brandString<EditorIncarnationId>(randomUUID()),recoveryPending:false};return{store,c,snapshot,registration}}
async function waitPreparation(c:EditorCoordinator,id:ResumeId,token:EditorToken){return vi.waitFor(async()=>{const job=await c.poll(id,token);expect(job).not.toBeNull();return job!},{interval:10,timeout:5000})}
it('persists uncertainty across restart and fences a retired incarnation under the document writer lock',async()=>{const{store,c,snapshot,registration}=await fixture();const first=await c.register(registration);await c.disconnect(snapshot.id,first.token);const restarted=new EditorCoordinator(store);coordinators.push(restarted);await expect(restarted.prepare({resumeId:snapshot.id,expectedRevision:snapshot.revision,mutationId:'ai'})).rejects.toMatchObject({code:'editor-unavailable'});const second=await restarted.register({...registration,incarnationId:brandString<EditorIncarnationId>(randomUUID())});expect(second.uncertain).toBe(true);await restarted.reconcile({resumeId:snapshot.id,token:second.token,expectedRevision:snapshot.revision});await expect(store.save({id:snapshot.id,expectedRevision:snapshot.revision,documentJson:snapshot.documentJson},c.guard(snapshot.id,first.token))).rejects.toMatchObject({code:'editor-unavailable'});await expect(c.register(registration)).rejects.toMatchObject({code:'editor-unavailable'})})
it('keeps admission separate from flush and rejects a stale model read after acknowledgement',async()=>{const{store,c,snapshot,registration}=await fixture();const owner=await c.register(registration);const pending=c.prepare({resumeId:snapshot.id,expectedRevision:snapshot.revision,mutationId:'ai'});const outcome=expect(pending).rejects.toMatchObject({code:'conflict'});const job=await waitPreparation(c,snapshot.id,owner.token);const saved=await store.save({id:snapshot.id,expectedRevision:snapshot.revision,documentJson:snapshot.documentJson},c.guard(snapshot.id,owner.token));await c.acknowledge({resumeId:snapshot.id,token:owner.token,preparationId:job.id,revision:saved.revision,clean:true});await outcome})
it('cancels a waiting preparation and leaves recovery-pending ownership unavailable',async()=>{const{c,snapshot,registration}=await fixture();const owner=await c.register({...registration,recoveryPending:true});await expect(c.prepare({resumeId:snapshot.id,expectedRevision:snapshot.revision,mutationId:'ai'})).rejects.toMatchObject({code:'editor-unavailable'});await c.reconcile({resumeId:snapshot.id,token:owner.token,expectedRevision:snapshot.revision});const controller=new AbortController();const pending=c.prepare({resumeId:snapshot.id,expectedRevision:snapshot.revision,mutationId:'ai',signal:controller.signal});const rejected=expect(pending).rejects.toMatchObject({code:'edit-cancelled'});await waitPreparation(c,snapshot.id,owner.token);controller.abort();await rejected;await expect(c.poll(snapshot.id,owner.token)).rejects.toMatchObject({code:'editor-unavailable'})})
it('rejects a precomputed browser guard after reconciliation retires its frame, while anonymous CAS remains available',async()=>{const{store,c,snapshot,registration}=await fixture();const first=await c.register(registration),guard=c.guard(snapshot.id,first.token);const second=await c.register({...registration,incarnationId:brandString<EditorIncarnationId>(randomUUID())});await c.reconcile({resumeId:snapshot.id,token:second.token,expectedRevision:snapshot.revision});await expect(store.rename(snapshot.id,snapshot.revision,'Retired',guard)).rejects.toMatchObject({code:'editor-unavailable'});await store.rename(snapshot.id,snapshot.revision,'External CAS');expect((await store.read(snapshot.id)).title).toBe('External CAS')})
it('restart and corrupt ownership never silently become trusted; unrelated documents remain writable',async()=>{const{store,c,snapshot,registration}=await fixture();await c.register(registration);const restarted=new EditorCoordinator(store);coordinators.push(restarted);await expect(restarted.prepare({resumeId:snapshot.id,expectedRevision:snapshot.revision,mutationId:'restart'})).rejects.toMatchObject({code:'editor-unavailable'});const{writeFile}=await import('node:fs/promises');await writeFile(join(store.config.storageDir,'owners-v1',`${snapshot.id}.json`),'{}');await expect(c.prepare({resumeId:snapshot.id,expectedRevision:snapshot.revision,mutationId:'corrupt'})).rejects.toMatchObject({code:'invalid-storage'});const other=await store.create({title:'Other'});const permit=await restarted.prepare({resumeId:other.id,expectedRevision:other.revision,mutationId:'other'});await permit.release()})
it('disposal releases an admitted permit and rejects subsequent preparation',async()=>{const{c,snapshot}=await fixture();const permit=await c.prepare({resumeId:snapshot.id,expectedRevision:snapshot.revision,mutationId:'admitted'});await c.dispose();await expect(permit.guard()).rejects.toMatchObject({code:'edit-cancelled'});await permit.release();await expect(c.prepare({resumeId:snapshot.id,expectedRevision:snapshot.revision,mutationId:'next'})).rejects.toMatchObject({code:'edit-cancelled'})})
it('missing acknowledgement persists uncertainty after its deadline and lease renewal cannot clear it',async()=>{
 const{c,store,snapshot,registration}=await fixture();const owner=await c.register(registration),now=Date.now();const clock=vi.spyOn(Date,'now').mockReturnValue(now)
 try{const waiting=c.prepare({resumeId:snapshot.id,expectedRevision:snapshot.revision,mutationId:'unacknowledged'});const rejected=expect(waiting).rejects.toMatchObject({code:'editor-unavailable'});await waitPreparation(c,snapshot.id,owner.token);clock.mockReturnValue(now+store.config.editorPrepareTimeoutMs+1);await rejected;await expect(c.poll(snapshot.id,owner.token)).rejects.toMatchObject({code:'editor-unavailable'});await expect(c.prepare({resumeId:snapshot.id,expectedRevision:snapshot.revision,mutationId:'retry'})).rejects.toMatchObject({code:'editor-unavailable'})}finally{clock.mockRestore()}
})
it('holds token validity through envelope persistence while a replacement waits for the document lock',async()=>{
 const{writeFileAtomic}=await import('@deepseek-ai/dsh-atomic-write');const{store,c,snapshot,registration}=await fixture();const owner=await c.register(registration)
 let entered!:()=>void,release!:()=>void;const writing=new Promise<void>(r=>{entered=r}),gate=new Promise<void>(r=>{release=r})
 const paused=new ResumeStore(store.config,async(path,data)=>{entered();await gate;await writeFileAtomic(path,data,{mode:0o600,dirMode:0o700})})
 const saving=paused.save({id:snapshot.id,expectedRevision:snapshot.revision,documentJson:snapshot.documentJson},c.guard(snapshot.id,owner.token));await writing
 let replaced=false;const replacing=c.register({...registration,incarnationId:brandString<EditorIncarnationId>(randomUUID())}).then(value=>{replaced=true;return value})
 try{await Promise.resolve();expect(replaced).toBe(false)}finally{release()}
 const saved=await saving;await replacing;expect(saved.revision).toBe(2);await expect(store.save({id:snapshot.id,expectedRevision:saved.revision,documentJson:saved.documentJson},c.guard(snapshot.id,owner.token))).rejects.toMatchObject({code:'editor-unavailable'})
})
it.each(['save','remove','apply','revert','restore'] as const)('rejects a retired browser capability on %s without changing the committed document',async method=>{
 const{store,c,snapshot,registration}=await fixture();const owner=await c.register(registration)
 const proposal=await store.propose({id:snapshot.id,expectedRevision:snapshot.revision,requestId:'first',summary:'Template',operationsJson:JSON.stringify([{type:'template.apply',templateId:'template-modern'}])});const applied=await store.apply({id:snapshot.id,proposalId:proposal.id,requestId:'apply'})
 const current=await store.read(snapshot.id),history=await store.history(snapshot.id),pending=await store.propose({id:snapshot.id,expectedRevision:current.revision,requestId:'pending',summary:'Next template',operationsJson:JSON.stringify([{type:'template.apply',templateId:'template-classic'}])})
 const guard=c.guard(snapshot.id,owner.token);const replacement=await c.register({...registration,incarnationId:brandString<EditorIncarnationId>(randomUUID())});await c.reconcile({resumeId:snapshot.id,token:replacement.token,expectedRevision:current.revision})
 const request={id:snapshot.id,expectedRevision:current.revision,requestId:'retired'},before=await store.history(snapshot.id)
 const operation=method==='save'?store.save({...request,documentJson:current.documentJson},guard):method==='remove'?store.remove(snapshot.id,current.revision,guard):method==='apply'?store.apply({...request,proposalId:pending.id},guard):method==='revert'?store.revert({...request,proposalId:applied.proposalId!},guard):store.restore({...request,versionId:history.versions[0].id},guard)
 await expect(operation).rejects.toMatchObject({code:'editor-unavailable'});expect(await store.read(snapshot.id)).toEqual(current);expect(await store.history(snapshot.id)).toEqual(before)
})
it('turns an expired orphan preparation into durable uncertainty when a browser polls',async()=>{const{store,c,snapshot,registration}=await fixture();const owner=await c.register(registration);const{readFile,writeFile}=await import('node:fs/promises');const path=join(store.config.storageDir,'owners-v1',`${snapshot.id}.json`),record=JSON.parse(await readFile(path,'utf8'));record.preparation={id:randomUUID(),expectedRevision:snapshot.revision,deadline:Date.now()-1,phase:'requested'};await writeFile(path,JSON.stringify(record));await expect(c.poll(snapshot.id,owner.token)).rejects.toMatchObject({code:'editor-unavailable'});expect(JSON.parse(await readFile(path,'utf8')).uncertain).toBe(true)})
it('admits only one independent writer and requires explicit recovery after disconnect',async()=>{
 const {c,store,snapshot,registration}=await fixture()
 const second={...registration,incarnationId:brandString<EditorIncarnationId>(randomUUID()),acquisition:'available' as const}
 const results=await Promise.allSettled([c.register({...registration,acquisition:'available'}),c.register(second)])
 expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1)
 const winner=results.find(r=>r.status==='fulfilled')!;if(winner.status!=='fulfilled')throw Error('Missing winner')
 await expect(c.register({...second,incarnationId:brandString<EditorIncarnationId>(randomUUID()),acquisition:'recover'})).rejects.toMatchObject({code:'editor-unavailable'})
 await store.save({id:snapshot.id,expectedRevision:snapshot.revision,documentJson:snapshot.documentJson},c.guard(snapshot.id,winner.value.token))
 await c.disconnect(snapshot.id,winner.value.token,true)
 const recovery={...second,incarnationId:brandString<EditorIncarnationId>(randomUUID())}
 await expect(c.register(recovery)).rejects.toMatchObject({code:'editor-unavailable'})
 expect((await c.register({...recovery,acquisition:'recover'})).uncertain).toBe(true)
})
it('retains unknown ownership after lease expiry until explicit revocation and acknowledgement',async()=>{
 const {c,store,snapshot,registration}=await fixture(),owner=await c.register(registration)
 const other={...registration,incarnationId:brandString<EditorIncarnationId>(randomUUID()),acquisition:'available' as const}
 await c.disconnect(snapshot.id,owner.token)
 await expect(c.register({...other,acquisition:'recover'})).rejects.toMatchObject({code:'editor-unavailable'})
 const clock=vi.spyOn(Date,'now').mockReturnValue(Date.now()+store.config.editorLeaseMs+1)
 try{
  await expect(c.register(other)).rejects.toMatchObject({code:'editor-unavailable'})
  const recovery=await c.register({...other,acquisition:'recover'});expect(recovery.uncertain).toBe(true)
  await expect(store.save({id:snapshot.id,expectedRevision:snapshot.revision,documentJson:snapshot.documentJson},c.guard(snapshot.id,owner.token))).rejects.toMatchObject({code:'editor-unavailable'})
  await expect(c.prepare({resumeId:snapshot.id,expectedRevision:snapshot.revision,mutationId:'unknown'})).rejects.toMatchObject({code:'editor-unavailable'})
  await c.reconcile({resumeId:snapshot.id,token:recovery.token,expectedRevision:snapshot.revision})
 }finally{clock.mockRestore()}
})

vi.mock('@resume-editor/canvas-engine',()=>({alignBoxes:vi.fn(),distributeBoxes:vi.fn()}))
import {afterEach,expect,it,vi} from 'vitest'
import {mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {randomUUID} from 'node:crypto'
import {brandString} from '@deepseek-ai/dsh-brand'
import {ResumeStore,resolveConfig} from '../src/host/store.ts'
import {EditorCoordinator} from '../src/host/editor-coordinator.ts'
import {useEditorStore} from '../upstream/editor/src/store/editor-store.ts'
import {captureEditorCheckpoint,restoreEditorCheckpoint} from '../src/editor/editor-checkpoint.ts'
import type {EditorOwnerId,EditorIncarnationId,EditorTransferId,EditorCheckpointId} from '../src/types.ts'
const roots:string[]=[],owners:EditorCoordinator[]=[]
afterEach(async()=>{await Promise.all(owners.splice(0).map(c=>c.dispose()));await Promise.all(roots.splice(0).map(p=>rm(p,{recursive:true,force:true})))})
async function fixture(){const root=await mkdtemp(join(tmpdir(),'resume-transfer-'));roots.push(root);const store=new ResumeStore(resolveConfig(root,{})),c=new EditorCoordinator(store);owners.push(c);const snapshot=await store.create({title:'Candidate'}),registration={resumeId:snapshot.id,ownerId:brandString<EditorOwnerId>(randomUUID()),incarnationId:brandString<EditorIncarnationId>(randomUUID()),recoveryPending:false};const owner=await c.register(registration);const s=useEditorStore.getState();s.setDocument(JSON.parse(snapshot.documentJson));s.setResumeId(snapshot.id);s.markClean();const checkpoint=captureEditorCheckpoint(snapshot,67_108_864);const request={resumeId:snapshot.id,sourceToken:owner.token,sourceIncarnationId:registration.incarnationId,targetOwnerId:registration.ownerId,targetIncarnationId:brandString<EditorIncarnationId>(randomUUID()),transferId:brandString<EditorTransferId>(randomUUID()),checkpointId:brandString<EditorCheckpointId>(randomUUID()),revision:snapshot.revision,checkpointJson:JSON.stringify(checkpoint)};return{store,c,snapshot,registration,owner,request,checkpoint}}
it('fences the source before one designated target claims, restores and acknowledges its loaded revision',async()=>{const{store,c,snapshot,request,owner,checkpoint}=await fixture();await c.transfer(request);await expect(store.save({id:snapshot.id,expectedRevision:snapshot.revision,documentJson:snapshot.documentJson},c.guard(snapshot.id,owner.token))).rejects.toThrow();const claim={resumeId:snapshot.id,transferId:request.transferId,checkpointId:request.checkpointId,incarnationId:request.targetIncarnationId};const target=await c.claim(claim);await expect(c.claim(claim)).rejects.toThrow();restoreEditorCheckpoint(JSON.parse(target.checkpointJson),snapshot,67_108_864);expect(useEditorStore.getState().past).toEqual(checkpoint.past);await expect(store.save({id:snapshot.id,expectedRevision:snapshot.revision,documentJson:snapshot.documentJson},c.guard(snapshot.id,target.token))).rejects.toThrow();await c.activate({...claim,token:target.token,revision:snapshot.revision});await store.save({id:snapshot.id,expectedRevision:snapshot.revision,documentJson:snapshot.documentJson},c.guard(snapshot.id,target.token));await expect(c.rollback({resumeId:snapshot.id,transferId:request.transferId,sourceToken:owner.token,sourceIncarnationId:request.sourceIncarnationId})).rejects.toThrow()})
it('revokes an unacknowledged target before rollback gives the retained source a fresh capability',async()=>{const{store,c,snapshot,request,owner}=await fixture();await c.transfer(request);const target=await c.claim({resumeId:snapshot.id,transferId:request.transferId,checkpointId:request.checkpointId,incarnationId:request.targetIncarnationId});const back=await c.rollback({resumeId:snapshot.id,transferId:request.transferId,sourceToken:owner.token,sourceIncarnationId:request.sourceIncarnationId});expect(back.token).not.toBe(owner.token);await expect(c.guard(snapshot.id,target.token)!()).rejects.toThrow();await store.save({id:snapshot.id,expectedRevision:snapshot.revision,documentJson:snapshot.documentJson},c.guard(snapshot.id,back.token))})
it('rejects stale or oversized capture without losing the source',async()=>{const{c,snapshot,request,owner}=await fixture();await expect(c.transfer({...request,checkpointJson:'{}'})).rejects.toThrow();await c.guard(snapshot.id,owner.token)!();await expect(c.transfer({...request,targetIncarnationId:request.sourceIncarnationId})).rejects.toThrow();await c.guard(snapshot.id,owner.token)!()})
it('rejects wrong generation, pending replacement and stale activation after rollback',async()=>{
 const{c,snapshot,request,owner,registration}=await fixture();await c.transfer(request)
 const claim={resumeId:snapshot.id,transferId:request.transferId,checkpointId:request.checkpointId,incarnationId:request.targetIncarnationId}
 await expect(c.claim({...claim,incarnationId:brandString<EditorIncarnationId>(randomUUID())})).rejects.toThrow()
 await expect(c.register({...registration,incarnationId:brandString<EditorIncarnationId>(randomUUID())})).rejects.toThrow()
 await expect(c.transfer(request)).rejects.toThrow()
 const target=await c.claim(claim)
 const rollback={resumeId:snapshot.id,transferId:request.transferId,sourceToken:owner.token,sourceIncarnationId:request.sourceIncarnationId}
 const back=await c.rollback(rollback);expect(await c.rollback(rollback)).toEqual(back)
 await expect(c.activate({...claim,token:target.token,revision:snapshot.revision})).rejects.toThrow()
 await expect(c.guard(snapshot.id,owner.token)!()).rejects.toThrow()
 await c.guard(snapshot.id,back.token)!()
})
it('retains unresolved checkpoints across restart and exposes external CAS conflicts',async()=>{
 const{c,store,snapshot,request,owner}=await fixture();await c.transfer(request)
 const restarted=new EditorCoordinator(store);owners.push(restarted)
 await expect(restarted.guard(snapshot.id,owner.token)!()).rejects.toThrow()
 await store.rename(snapshot.id,snapshot.revision,'External writer')
 await expect(restarted.claim({resumeId:snapshot.id,transferId:request.transferId,checkpointId:request.checkpointId,incarnationId:request.targetIncarnationId})).rejects.toMatchObject({code:'conflict'})
 await expect(restarted.rollback({resumeId:snapshot.id,transferId:request.transferId,sourceToken:owner.token,sourceIncarnationId:request.sourceIncarnationId})).rejects.toMatchObject({code:'conflict'})
})
it('keeps source writable after a persistence failure and byte-limit rejection',async()=>{
 const{mkdir,writeFile}=await import('node:fs/promises');const{c,store,snapshot,request,owner}=await fixture()
 await expect(c.transfer({...request,checkpointJson:' '.repeat(store.config.maxAssistantCheckpointBytes+1)})).rejects.toMatchObject({code:'invalid-input'})
 await mkdir(store.config.storageDir,{recursive:true});await writeFile(join(store.config.storageDir,'transfers-v1'),'blocked')
 await expect(c.transfer(request)).rejects.toThrow()
 await rm(join(store.config.storageDir,'transfers-v1'));await c.guard(snapshot.id,owner.token)!()
})
it('resolves the checkpoint budget and rejects unsafe limits at configuration load',()=>{
 expect(resolveConfig('/unused',{}).maxAssistantCheckpointBytes).toBe(67_108_864)
 for(const value of [0,-1,1.5,Number.MAX_SAFE_INTEGER+1])expect(()=>resolveConfig('/unused',{maxAssistantCheckpointBytes:value})).toThrow()
})
it.each(['claimed','active'] as const)('designates a fresh recovery editor after the source and %s target have disconnected',async phase=>{
 const{c,snapshot,request,owner}=await fixture();await c.transfer(request);await c.disconnect(snapshot.id,owner.token)
 const failed=await c.claim({resumeId:snapshot.id,transferId:request.transferId,checkpointId:request.checkpointId,incarnationId:request.targetIncarnationId});if(phase==='active')await c.activate({resumeId:snapshot.id,transferId:request.transferId,checkpointId:request.checkpointId,incarnationId:request.targetIncarnationId,token:failed.token,revision:snapshot.revision});await c.disconnect(snapshot.id,failed.token)
 const recovery={resumeId:snapshot.id,transferId:request.transferId,checkpointId:request.checkpointId,fromIncarnationId:request.targetIncarnationId,targetOwnerId:request.targetOwnerId,targetIncarnationId:brandString<EditorIncarnationId>(randomUUID())}
 expect(await c.recover(recovery)).toEqual({revision:snapshot.revision});expect(await c.recover(recovery)).toEqual({revision:snapshot.revision})
 await expect(c.guard(snapshot.id,failed.token)!()).rejects.toThrow();await expect(c.guard(snapshot.id,owner.token)!()).rejects.toThrow()
 await expect(c.activate({resumeId:snapshot.id,transferId:request.transferId,checkpointId:request.checkpointId,incarnationId:request.targetIncarnationId,token:failed.token,revision:snapshot.revision})).rejects.toThrow()
 await expect(c.recover({...recovery,targetIncarnationId:brandString<EditorIncarnationId>(randomUUID())})).rejects.toThrow()
 const target=await c.claim({...recovery,incarnationId:recovery.targetIncarnationId})
 expect(target.checkpointJson).toBe(request.checkpointJson)
 await c.activate({...recovery,incarnationId:recovery.targetIncarnationId,token:target.token,revision:snapshot.revision})
 await c.guard(snapshot.id,target.token)!()
})

it.each(['uncertain','different-owner','different-generation','pending-transfer','restarted-host'] as const)('keeps failed-attempt recovery fenced with %s evidence',async evidence=>{
 const{c,store,snapshot,request,registration,owner}=await fixture();await c.transfer(request)
 const back=await c.rollback({resumeId:snapshot.id,transferId:request.transferId,sourceToken:owner.token,sourceIncarnationId:request.sourceIncarnationId})
 const failed={resumeId:snapshot.id,transferId:brandString<EditorTransferId>(randomUUID()),sourceToken:back.token,sourceIncarnationId:request.sourceIncarnationId}
 let recovering=c
 if(evidence==='uncertain')await c.disconnect(snapshot.id,back.token)
 if(evidence==='different-owner'){const other=await c.register({...registration,incarnationId:brandString<EditorIncarnationId>(randomUUID())});await c.reconcile({resumeId:snapshot.id,token:other.token,expectedRevision:snapshot.revision})}
 if(evidence==='different-generation')failed.sourceIncarnationId=brandString<EditorIncarnationId>(randomUUID())
 if(evidence==='pending-transfer')await c.transfer({...request,sourceToken:back.token,transferId:brandString<EditorTransferId>(randomUUID()),targetIncarnationId:brandString<EditorIncarnationId>(randomUUID())})
 if(evidence==='restarted-host'){recovering=new EditorCoordinator(store);owners.push(recovering)}
 await expect(recovering.rollback(failed)).rejects.toMatchObject({code:'editor-unavailable'})
})

it('reads exact transfer disposition without changing ownership, checkpoints or current content',async()=>{
 const {readFile}=await import('node:fs/promises'),{c,store,snapshot,request}=await fixture(),query={resumeId:snapshot.id,transferId:request.transferId,checkpointId:request.checkpointId}
 expect(await c.inspect(query)).toEqual({state:'unknown'})
 await c.transfer(request);expect(await c.inspect(query)).toEqual({state:'pending',revision:1,currentRevision:1})
 expect(await c.inspect({...query,checkpointId:brandString<EditorCheckpointId>(randomUUID())})).toEqual({state:'unknown'})
 expect(await c.inspect({...query,transferId:brandString<EditorTransferId>(randomUUID())})).toEqual({state:'unknown'})
 const claim={...query,incarnationId:request.targetIncarnationId},target=await c.claim(claim);expect(await c.inspect(query)).toEqual({state:'pending',revision:1,currentRevision:1})
 await c.activate({...claim,token:target.token,revision:snapshot.revision});expect(await c.inspect(query)).toEqual({state:'active',revision:1,currentRevision:1})
 await store.rename(snapshot.id,snapshot.revision,'Current',c.guard(snapshot.id,target.token))
 const paths=['owners-v1','transfers-v1'].map(name=>join(store.config.storageDir,name,snapshot.id+'.json')),before=await Promise.all(paths.map(path=>readFile(path,'utf8'))),saved=await store.read(snapshot.id)
 expect(await c.inspect(query)).toEqual({state:'active',revision:1,currentRevision:2});expect(await Promise.all(paths.map(path=>readFile(path,'utf8')))).toEqual(before);expect(await store.read(snapshot.id)).toEqual(saved)
})

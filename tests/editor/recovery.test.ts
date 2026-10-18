import {describe,it,expect} from 'vitest'
import {mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {resumeIdSchema,resumeRevisionSchema} from '../../src/identity.ts'
import {RecoveryStore} from '../../src/client/recovery.ts'
import {SaveCoordinator} from '../../src/editor/persistence.ts'
import {ResumeStore,resolveConfig} from '../../src/host/store.ts'
import type {Recovery} from '../../src/protocol.ts'
import {requestSchemas} from '../../src/protocol.ts'
import {MessageChannel} from 'node:worker_threads'
import {PortBridge} from '../../src/editor/bridge.ts'
import {createEditorApi} from '../../src/editor/api.ts'
class MemoryStorage {
 private values=new Map<string,string>()
 get length(){return this.values.size}
 key(index:number){return [...this.values.keys()][index]??null}
 getItem(key:string){return this.values.get(key)??null}
 setItem(key:string,value:string){this.values.set(key,value)}
 removeItem(key:string){this.values.delete(key)}
}
describe('independently owned recovery drafts',()=>{
 it('keeps separate owners through the actual frame API and parent storage methods',async()=>{
  const storage=new RecoveryStore(new MemoryStorage()),closers:Array<()=>void>=[]
  const connect=(nonce:string)=>{const{port1,port2}=new MessageChannel(),bridge=new PortBridge(port1,1000);closers.push(()=>{bridge.close();port2.close()});port2.on('message',request=>{let value:unknown;switch(request.method){case'recoveryRead':value=storage.list(requestSchemas.recoveryRead.parse(request.args)[0]);break;case'recoveryWrite':value=storage.write(requestSchemas.recoveryWrite.parse(request.args)[0]);break;case'recoveryRemove':{const[record,revision]=requestSchemas.recoveryRemove.parse(request.args);value=storage.remove(record,revision);break}default:throw Error('Unexpected capability')}port2.postMessage({kind:'response',id:request.id,ok:true,value})});return createEditorApi(bridge,{nonce,recoveryOwnerId:nonce,recoveryOwnerPersistent:true,mode:'editor',locale:'en',autosaveDelayMs:2000,maxDocumentBytes:100000,maxImportBytes:100000,frameConnectTimeoutMs:15000,bridgeTimeoutMs:45000,rendererPollIntervalMs:1000,refreshIntervalMs:2000})}
  const a=connect('frame-a'),b=connect('frame-b'),id=resumeIdSchema.parse('resume'),revision=resumeRevisionSchema.parse(1)
  try{await a.backup({id,revision,documentJson:'draft A',updatedAt:1});await b.backup({id,revision,documentJson:'draft B',updatedAt:2});await b.clearBackup(id,resumeRevisionSchema.parse(2),'draft B');expect(await a.recovery(id)).toEqual([{id,revision,documentJson:'draft A',updatedAt:1,ownerId:'frame-a',editorId:'frame-a',localRevision:1}])}finally{closers.forEach(close=>close())}
 })
 it('retains editor A after B saves and A conflicts, closes and reopens',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'resume-two-editors-')),recovery=new RecoveryStore(new MemoryStorage())
  try{
   const store=new ResumeStore(resolveConfig(directory,{})),initial=await store.create({title:'Initial'})
   const draft=(title:string)=>{const document=JSON.parse(initial.documentJson);document.metadata.title=title;return JSON.stringify(document)}
   const aRecord:Recovery={id:initial.id,revision:initial.revision,documentJson:draft('Draft A'),ownerId:'editor-a',editorId:'editor-a',localRevision:1,updatedAt:1}
   const bRecord:Recovery={...aRecord,documentJson:draft('Draft B'),ownerId:'editor-b',editorId:'instance-b',updatedAt:2}
   const a=new SaveCoordinator(initial,r=>store.save(r),()=>{},async saved=>{recovery.remove(aRecord,saved.revision)})
   const b=new SaveCoordinator(initial,r=>store.save(r),()=>{},async saved=>{recovery.remove(bRecord,saved.revision)})
   a.edit(aRecord.documentJson);recovery.write(aRecord);b.edit(bRecord.documentJson);recovery.write(bRecord)
   await b.flush();expect(recovery.list(initial.id)).toEqual([aRecord])
   await expect(a.flush()).rejects.toMatchObject({code:'conflict'});a.dispose();b.dispose()
   const reopened=await store.read(initial.id)
   expect(reopened.title).toBe('Draft B');expect(reopened.revision).toBe(2)
   expect(recovery.list(reopened.id)[0].documentJson).toBe(aRecord.documentJson)
   expect(recovery.list(reopened.id)[0].documentJson).not.toBe(reopened.documentJson)
  }finally{await rm(directory,{recursive:true,force:true})}
 })
 it('rejects reordered writes and removal of a newer local sequence',()=>{
  const storage=new MemoryStorage(),recovery=new RecoveryStore(storage)
  const record:Recovery={id:resumeIdSchema.parse('resume'),revision:resumeRevisionSchema.parse(1),documentJson:'first',ownerId:'a',editorId:'a',localRevision:1,updatedAt:1}
  recovery.write(record);recovery.write({...record,localRevision:2,documentJson:'newer'})
  expect(recovery.write(record)).toBe(false);expect(recovery.remove(record,record.revision)).toBe(false)
  expect(recovery.list(record.id)[0].documentJson).toBe('newer')
 })
 it('separates two editor instances even when a duplicated tab inherits the same owner',()=>{
  const recovery=new RecoveryStore(new MemoryStorage()),record:Recovery={id:resumeIdSchema.parse('resume'),revision:resumeRevisionSchema.parse(1),documentJson:'A',ownerId:'inherited-tab-owner',editorId:'instance-a',localRevision:1,updatedAt:1}
  const other={...record,editorId:'instance-b',documentJson:'B'};recovery.write(record);recovery.write(other)
  expect(recovery.list(record.id)).toHaveLength(2);recovery.remove(other,other.revision);expect(recovery.list(record.id)).toEqual([record])
 })
})

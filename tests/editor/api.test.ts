import {resumeIdSchema,resumeRevisionSchema} from '../../src/identity.ts'
const rid=resumeIdSchema.parse.bind(resumeIdSchema),rv=resumeRevisionSchema.parse.bind(resumeRevisionSchema)
import {describe,it,expect} from 'vitest'
import {MessageChannel} from 'node:worker_threads'
import {createEditorApi,type EditorApi} from '../../src/editor/api.ts'
import {PortBridge} from '../../src/editor/bridge.ts'
import {newDocument} from '../../src/host/operations.ts'
const config={nonce:'test',recoveryOwnerId:'test',recoveryOwnerPersistent:true,mode:'editor',locale:'en',autosaveDelayMs:2000,maxImportBytes:10485760,maxDocumentBytes:10485760,frameConnectTimeoutMs:15000,bridgeTimeoutMs:45000,rendererPollIntervalMs:1000,refreshIntervalMs:2000} as const
async function withResult(value:unknown,check:(api:EditorApi)=>Promise<void>){const {port1,port2}=new MessageChannel(),bridge=new PortBridge(port1,1000);port2.on('message',request=>port2.postMessage({kind:'response',id:request.id,ok:true,value}));try{await check(createEditorApi(bridge,config))}finally{bridge.close();port2.close()}}
describe('acknowledgement identity validation',()=>{
 it('rejects a read response for another document',async()=>{
  const doc=newDocument('A');await withResult({id:rid(doc.id),title:'A',revision:rv(1),pageCount:1,updatedAt:'now',documentJson:JSON.stringify(doc)},async api=>{await expect(api.read(rid('another'))).rejects.toThrow('does not match')})
 })
 it('rejects a save acknowledgement for an unexpected revision',async()=>{
  const doc=newDocument('A');await withResult({id:rid(doc.id),title:'A',revision:rv(3),pageCount:1,updatedAt:'now',documentJson:JSON.stringify(doc)},async api=>{await expect(api.save({id:rid(doc.id),expectedRevision:rv(1),documentJson:JSON.stringify(doc)})).rejects.toThrow('does not match')})
 })
 it('checks document identity and page count within a snapshot',async()=>{
  const doc=newDocument('A');await withResult({id:rid(doc.id),title:'A',revision:rv(1),pageCount:2,updatedAt:'now',documentJson:JSON.stringify(doc)},async api=>{await expect(api.read(rid(doc.id))).rejects.toThrow('does not match')})
 })
 it('rejects export receipts for the wrong resume, revision, format or dimension unit',async()=>{
  const receipt={id:rid('export'),resumeId:rid('a'),revision:rv(2),format:'png',filename:'a.png',byteSize:4,pageCount:1,width:20,height:40,dimensionUnit:'px',dataBase64:'AA==',artifactPath:'/exports/a.png'}
  await withResult(receipt,async api=>{await expect(api.export({id:rid('a'),expectedRevision:rv(1),format:'png'})).rejects.toThrow('does not match');await expect(api.export({id:rid('other'),expectedRevision:rv(2),format:'png'})).rejects.toThrow('does not match');await expect(api.export({id:rid('a'),expectedRevision:rv(2),format:'pdf'})).rejects.toThrow('does not match')})
  await withResult({...receipt,dimensionUnit:'mm'},async api=>{await expect(api.export({id:rid('a'),expectedRevision:rv(2),format:'png'})).rejects.toThrow('does not match')})
 })
})

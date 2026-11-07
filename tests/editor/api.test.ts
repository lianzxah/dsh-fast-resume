import {resumeIdSchema,resumeRevisionSchema} from '../../src/identity.ts'
const rid=resumeIdSchema.parse.bind(resumeIdSchema),rv=resumeRevisionSchema.parse.bind(resumeRevisionSchema)
import {describe,it,expect} from 'vitest'
import {MessageChannel} from 'node:worker_threads'
import {createEditorApi,type EditorApi} from '../../src/editor/api.ts'
import {PortBridge} from '../../src/editor/bridge.ts'
import {newDocument} from '../../src/host/operations.ts'
const config={nonce:'00000000-0000-4000-8000-000000000001',recoveryOwnerId:'00000000-0000-4000-8000-000000000002',recoveryOwnerPersistent:true,mode:'editor',locale:'en',autosaveDelayMs:2000,maxImportBytes:10485760,maxDocumentBytes:10485760,frameConnectTimeoutMs:15000,bridgeTimeoutMs:45000,rendererPollIntervalMs:1000,wheelZoomDirection:'auto',maxAssistantCheckpointBytes:67108864,editorPollIntervalMs:1000,refreshIntervalMs:2000} as const
async function withResult(value:unknown,check:(api:EditorApi)=>Promise<void>){const {port1,port2}=new MessageChannel(),bridge=new PortBridge(port1,1000);port2.on('message',request=>port2.postMessage({kind:'response',id:request.id,ok:true,value:request.method==='editorRegister'?{token:'00000000-0000-4000-8000-000000000003',uncertain:false}:value}));try{await check(createEditorApi(bridge,config))}finally{bridge.close();port2.close()}}
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
it('retries a failed owner registration instead of caching its rejected promise',async()=>{const{port1,port2}=new MessageChannel(),bridge=new PortBridge(port1,1000);const document=newDocument('Retry'),saved={id:rid(document.id),title:'Retry',revision:rv(2),pageCount:document.pages.length,updatedAt:'now',documentJson:JSON.stringify(document)};let attempts=0;port2.on('message',request=>{if(request.method==='editorRegister'&&++attempts===1){port2.postMessage({kind:'response',id:request.id,ok:false,error:{message:'Connection unavailable'}});return}port2.postMessage({kind:'response',id:request.id,ok:true,value:request.method==='editorRegister'?{token:'00000000-0000-4000-8000-000000000003',uncertain:false}:saved})});try{const api=createEditorApi(bridge,config),request={id:saved.id,expectedRevision:rv(1),documentJson:saved.documentJson};await expect(api.save(request)).rejects.toThrow('Connection unavailable');expect(await api.save(request)).toEqual(saved);expect(attempts).toBe(2)}finally{bridge.close();port2.close()}})

it('validates the requested revision on metadata-only receipt reads',async()=>{
 const receipt={requestId:'batch',revision:rv(2),changedElementIds:[],createdAt:'now'}
 await withResult(receipt,async api=>{expect(await api.changeReceipt(rid('document'),rv(2))).toEqual(receipt);await expect(api.changeReceipt(rid('document'),rv(3))).rejects.toThrow('does not match')})
 await withResult(null,async api=>{expect(await api.changeReceipt(rid('document'),rv(1))).toBeNull()})
})
it.each(['bound','superseded','failed'] as const)('keeps a conversation save successful with separate %s association state',async association=>{
 const{brandString}=await import('@deepseek-ai/dsh-brand'),{port1,port2}=new MessageChannel(),bridge=new PortBridge(port1,1000),doc=newDocument('Conversation save'),saved={id:rid(doc.id),title:'Conversation save',revision:rv(2),pageCount:1,updatedAt:'now',documentJson:JSON.stringify(doc)}
 const sessionId=brandString<import('@deepseek-ai/dsh-session/types').SessionId>('actual-conversation'),methods:string[]=[]
 port2.on('message',request=>{methods.push(request.method);if(request.method==='saveInSession'){expect(request.args[0]).toMatchObject({contextSessionId:sessionId,save:{sessionId:'legacy'},token:'00000000-0000-4000-8000-000000000003'})}port2.postMessage({kind:'response',id:request.id,ok:true,value:request.method==='editorRegister'?{token:'00000000-0000-4000-8000-000000000003',uncertain:false}:{snapshot:saved,association}})})
 try{const api=createEditorApi(bridge,{...config,launch:{source:'conversation',sessionId,resumeId:saved.id}}),{SaveCoordinator}=await import('../../src/editor/persistence.ts');let published=0;const unsubscribe=api.subscribeAssociation(()=>published++),coordinator=new SaveCoordinator({...saved,revision:rv(1)},api.save);coordinator.edit(JSON.stringify({...doc,metadata:{...doc.metadata,title:'Edited'}}));await coordinator.flush(undefined,'legacy');expect(coordinator.state).toMatchObject({snapshot:saved,error:null,dirty:false});expect(api.association()).toBe(association);expect(published).toBe(1);expect(methods).toEqual(['editorRegister','saveInSession']);unsubscribe();coordinator.dispose()}finally{bridge.close();port2.close()}
})

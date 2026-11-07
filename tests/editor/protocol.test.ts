import {resumeIdSchema,resumeRevisionSchema} from '../../src/identity.ts'
const rid=resumeIdSchema.parse.bind(resumeIdSchema),rv=resumeRevisionSchema.parse.bind(resumeRevisionSchema)
import {describe,it,expect} from 'vitest'
import {MessageChannel} from 'node:worker_threads'
import {PortBridge} from '../../src/editor/bridge.ts'
import {parseRequest} from '../../src/protocol.ts'
describe('frame capability protocol',()=>{
 it('rejects unknown methods, invalid revisions and unexpected envelope fields',()=>{
  expect(()=>parseRequest({kind:'request',id:rid('r'),method:'admin',args:[]})).toThrow()
  expect(()=>parseRequest({kind:'request',id:rid('r'),method:'save',args:[{id:rid('a'),expectedRevision:-1,documentJson:'{}'}]})).toThrow()
  expect(()=>parseRequest({kind:'request',id:rid('r'),method:'read',args:['a'],extra:'x'})).toThrow()
 })
 it('ignores foreign response ids and rejects outstanding callbacks on close',async()=>{
  const {port1,port2}=new MessageChannel();const bridge=new PortBridge(port1,1000)
  const result=bridge.call('read',[rid('a')]);const failure=expect(result).rejects.toThrow('Disconnected')
  port2.postMessage({kind:'response',id:rid('foreign'),ok:true,value:{}});bridge.close('Disconnected');await failure;port2.close()
 })
 it('validates a matching response and bounds lost acknowledgements',async()=>{
  const {port1,port2}=new MessageChannel();const bridge=new PortBridge(port1,20)
  port2.on('message',(r)=>port2.postMessage({kind:'response',id:r.id,ok:true,value:42}))
  expect(await bridge.call('list',[])).toBe(42)
  port2.removeAllListeners('message');await expect(bridge.call('list',[])).rejects.toThrow('timed out')
  bridge.close();port2.close()
 })
 it('rejects malformed response without retaining pending requests',async()=>{
  const {port1,port2}=new MessageChannel();const bridge=new PortBridge(port1,1000)
  const result=bridge.call('list',[]);port2.postMessage({kind:'response',id:4,ok:'yes'})
  await expect(result).rejects.toThrow('Invalid frame response');port2.close()
 })
})

it('runs paired bidirectional roles, aborts incoming work and rejects stale generations',async()=>{
 const {port1,port2}=new MessageChannel(),generation=crypto.randomUUID()
 let observed!:()=>void;const entered=new Promise<void>(resolve=>observed=resolve)
 let cancelled!:()=>void;const aborted=new Promise<void>(resolve=>cancelled=resolve)
 const parent=new PortBridge(port1,1000,{generation,role:'parent',handle:async()=>42})
 const editor=new PortBridge(port2,1000,{generation,role:'editor',handle:async(_m,_a,signal)=>{observed();await new Promise<void>(resolve=>signal.addEventListener('abort',()=>{cancelled();resolve()},{once:true}));return true}})
 try{expect(await editor.call('list',[])).toBe(42);const abort=new AbortController(),waiting=parent.call('editorReady',[],abort.signal);const rejected=expect(waiting).rejects.toThrow('cancelled');await entered;abort.abort();await rejected;await aborted}finally{parent.close();editor.close()}
})
it('rejects an old generation and aborts pending work on replacement',async()=>{
 const {port1,port2}=new MessageChannel(),generation=crypto.randomUUID()
 const bridge=new PortBridge(port1,1000,{generation,role:'parent',handle:async()=>true})
 try{const pending=bridge.call('editorReady',[]),failed=expect(pending).rejects.toThrow('Stale editor generation');port2.postMessage({kind:'response',id:'old',role:'editor',generation:'old',ok:true,value:true});await failed}finally{bridge.close();port2.close()}
})
it('validates explicit UI mutation and conversation save DTOs before admission',async()=>{
 const{uiMutationRequestSchema,sessionSaveRequestSchema}=await import('../../src/protocol.ts'),request={sessionId:'conversation',actionId:crypto.randomUUID(),kind:'revert',request:{id:'document',proposalId:'proposal',requestId:'undo',expectedRevision:2}}
 expect(uiMutationRequestSchema.parse(request)).toEqual(request)
 for(const invalid of [{...request,actionId:'logged-call'},{...request,kind:'restore'},{...request,request:{...request.request,expectedRevision:-1}},{...request,extra:true}])expect(()=>uiMutationRequestSchema.parse(invalid)).toThrow()
 const save={contextSessionId:'conversation',save:{id:'document',expectedRevision:2,documentJson:'{}',sessionId:'legacy'},token:crypto.randomUUID()}
 expect(sessionSaveRequestSchema.parse(save)).toEqual(save)
 for(const invalid of [{...save,token:undefined},{...save,contextSessionId:undefined},{...save,save:{...save.save,expectedRevision:0}},{...save,extra:true}])expect(()=>sessionSaveRequestSchema.parse(invalid)).toThrow()
})

it('keeps transfer disposition inspection in the authenticated parent and rejects capability-bearing results',async()=>{
 const {requestSchemas,editorTransferDispositionSchema}=await import('../../src/protocol.ts'),query=requestSchemas.editorTransferRead.parse([{resumeId:crypto.randomUUID(),transferId:crypto.randomUUID(),checkpointId:crypto.randomUUID()}])[0]
 expect(()=>editorTransferDispositionSchema.parse({state:'active',revision:1,currentRevision:2,token:crypto.randomUUID()})).toThrow()
 const {port1,port2}=new MessageChannel(),generation=crypto.randomUUID();let notified!:(message:string)=>void;const failed=new Promise<string>(resolve=>{notified=resolve})
 const parent=new PortBridge(port1,1000,{generation,role:'parent',handle:async()=>{throw Error('Frame must not inspect transfers')},failed:notified}),editor=new PortBridge(port2,1000,{generation,role:'editor',handle:async()=>true})
 try{const request=editor.call('editorTransferRead',[query]),rejected=expect(request).rejects.toThrow('Editor closed');expect(await failed).toBe('Invalid editor request');editor.close();await rejected}finally{parent.close();editor.close()}
})

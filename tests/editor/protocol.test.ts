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

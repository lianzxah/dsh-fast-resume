import {resumeIdSchema,resumeRevisionSchema} from '../../src/identity.ts'
const rid=resumeIdSchema.parse.bind(resumeIdSchema),rv=resumeRevisionSchema.parse.bind(resumeRevisionSchema)
import {describe,it,expect} from 'vitest'
import {Context} from '@deepseek-ai/cordis'
import * as registry from '@deepseek-ai/dsh-typert-registry/client'
import * as gateway from '@deepseek-ai/dsh-api-gateway/client'
import type {ConnectionHandle} from '@deepseek-ai/dsh-client-connection/client'
import {ownRemoteLifetime} from '../../src/client/lifecycle.ts'
import {TYPERT_REMOTE} from '../../lib/typert.remote-client.js'
async function client(){
 const ctx=new Context()
 await ctx.plugin(registry)
 ctx.provide('connection',{
  interactions:'none',isLoopback:true,
  generation:{getSnapshot:()=>undefined,subscribe:()=>()=>{}},state:{getSnapshot:()=>undefined,subscribe:()=>()=>{}},
  openWebSocket:()=>{throw Error('Unexpected socket')},reconnect:()=>{},registerGenerationSource:()=>()=>{},start:()=>({stop:()=>{}}),
  rpc:{call:async(_path,endpoint)=>{if(endpoint==='fastResume/rendererUnregister')return{ok:true,value:true};throw Error('Unexpected RPC')},open:async function*(){throw Error('Unexpected stream')}},
 } satisfies ConnectionHandle)
 await ctx.plugin(gateway)
 return ctx
}
describe('published Gateway namespace admission',()=>{
 it('mounts all generated Fast Resume methods on the real Client Remote service',async()=>{
  const ctx=await client()
  try{
   let checked=0
   const owner=ctx.plugin({inject:['remote'],async apply(scope:Context){
    await ownRemoteLifetime(scope,TYPERT_REMOTE,['remote.fastResume'],async consumer=>{
     expect(TYPERT_REMOTE.descriptors).toHaveLength(20)
     for(const descriptor of TYPERT_REMOTE.descriptors){expect(typeof Reflect.get(consumer.remote.fastResume,descriptor.method)).toBe('function');checked++}
     return async()=>{}
    })
   }})
   await owner
   expect(checked).toBe(20)
   await owner.dispose()
  }finally{await ctx.fiber.dispose()}
 })
 it('rejects the original reserved remove spelling as a negative control',async()=>{
  const ctx=await client()
  try{const descriptor=TYPERT_REMOTE.descriptors[0];await expect(ctx.remote.$mount({package:'@fixture/reserved-name',descriptors:[{...descriptor,id:rid('@fixture/reserved-name#fastResume/remove'),method:'remove'}]})).rejects.toThrow('conflicts with its namespace service')}
  finally{await ctx.fiber.dispose()}
 })
 it('keeps the namespace callable through a delayed consumer unregister before provider teardown',async()=>{
  const ctx=await client();let release!:()=>void,started!:()=>void
  const gate=new Promise<void>(r=>{release=r}),draining=new Promise<void>(r=>{started=r})
  let unregistered=false
  const owner=ctx.plugin({inject:['remote'],async apply(scope:Context){
   await ownRemoteLifetime(scope,TYPERT_REMOTE,['remote.fastResume'],async consumer=>async()=>{started();await gate;const result=await consumer.remote.fastResume.rendererUnregister('lease');expect(result).toEqual({ok:true,value:true});unregistered=true})
  }})
  try{
   await owner;const disposing=owner.dispose();await draining
   expect(typeof ctx.remote.fastResume.rendererUnregister).toBe('function');expect(unregistered).toBe(false)
   release();await disposing;expect(unregistered).toBe(true);expect(ctx.get('remote.fastResume')).toBeUndefined()
  }finally{release();await owner.dispose();await ctx.fiber.dispose()}
 })

})

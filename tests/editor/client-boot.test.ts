import {describe,it,expect,vi} from 'vitest'
import {Context} from '@deepseek-ai/cordis'
import * as registry from '@deepseek-ai/dsh-typert-registry/client'
import * as gateway from '@deepseek-ai/dsh-api-gateway/client'
import type {ConnectionHandle} from '@deepseek-ai/dsh-client-connection/client'
import {apply,inject} from '../../src/client/index.tsx'
/** Real Context/Gateway with only UI presentation seats replaced; no browser or model connection is opened. */
describe('Client plugin activation',()=>{
 it('activates explicitly injected consumers and drains renderer before unmount',async()=>{
  const browser=new EventTarget(),original=Object.getOwnPropertyDescriptor(globalThis,'window')
  Object.defineProperty(globalThis,'window',{value:browser,writable:true,configurable:true})
  const ctx=new Context(),entries:string[]=[],calls:string[]=[]
  try{
   await ctx.plugin(registry)
   ctx.provide('connection',{
    interactions:'none',isLoopback:true,generation:{getSnapshot:()=>undefined,subscribe:()=>()=>{}},state:{getSnapshot:()=>undefined,subscribe:()=>()=>{}},
    openWebSocket:()=>{throw Error('Unexpected socket')},reconnect:()=>{},registerGenerationSource:()=>()=>{},start:()=>({stop:()=>{}}),
    rpc:{call:async(_path,endpoint)=>{calls.push(endpoint);switch(endpoint){case'fastResume/editorAssets':return{ok:true,value:{html:'',autosaveDelayMs:2000,maxImportBytes:10485760,maxDocumentBytes:10485760,frameConnectTimeoutMs:15000,bridgeTimeoutMs:45000,rendererPollIntervalMs:1000,refreshIntervalMs:2000}};case'fastResume/rendererRegister':return{ok:true,value:{rendererId:'lease',leaseMs:15000}};case'fastResume/rendererPoll':return{ok:true,value:null};case'fastResume/rendererUnregister':return{ok:true,value:true};default:throw Error(`Unexpected RPC ${endpoint}`)}},open:async function*(){throw Error('Unexpected stream')}},
   } satisfies ConnectionHandle)
   await ctx.plugin(gateway)
   ctx.provide('remote.session',{})
   ctx.provide('slots',{inject:(_name:string,setup:()=>unknown)=>setup(),register:(entry:{name:string;key?:string;id?:string})=>{entries.push(`${entry.name}:${entry.key??entry.id}`);return()=>{}}})
   ctx.provide('locale',{register:()=>()=>{},getSnapshot:()=>({active:'en'}),bind:()=>()=>''})
   ctx.provide('layout',{})
   ctx.provide('uiWorkspace',{})
   const owner=ctx.plugin({inject,apply});await owner
   await vi.waitFor(()=>expect(calls).toContain('fastResume/rendererPoll'))
   expect(entries).toEqual(['main:fast-resume','sidebar.panellist:fast-resume'])
   await owner.dispose();expect(calls).toContain('fastResume/rendererUnregister');expect(ctx.get('remote.fastResume')).toBeUndefined()
  }finally{await ctx.fiber.dispose();if(original)Object.defineProperty(globalThis,'window',original);else Reflect.deleteProperty(globalThis,'window')}
 })
})

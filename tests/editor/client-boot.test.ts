import {describe,it,expect,vi} from 'vitest'
import {Context} from '@deepseek-ai/cordis'
import * as registry from '@deepseek-ai/dsh-typert-registry/client'
import * as gateway from '@deepseek-ai/dsh-api-gateway/client'
import type {ConnectionHandle} from '@deepseek-ai/dsh-client-connection/client'
import {apply,inject} from '../../src/client/index.tsx'
/** Real Context/Gateway with only UI presentation seats replaced; no browser or model connection is opened. */
describe('Client plugin activation',()=>{
 it.each(['available','getter-denied'] as const)('activates explicitly injected consumers and drains renderer with %s tab storage',async mode=>{
  const storage=Object.getOwnPropertyDescriptor(globalThis,'sessionStorage');Object.defineProperty(globalThis,'sessionStorage',mode==='getter-denied'?{get:()=>{throw new DOMException('Storage denied','SecurityError')},configurable:true}:{value:{getItem:()=>null,setItem:()=>{},removeItem:()=>{}},configurable:true})
  const browser=Object.assign(new EventTarget(),{matchMedia:()=>({matches:true})}),original=Object.getOwnPropertyDescriptor(globalThis,'window')
  Object.defineProperty(globalThis,'window',{value:browser,writable:true,configurable:true})
  const ctx=new Context(),entries:string[]=[],calls:string[]=[]
  try{
   await ctx.plugin(registry)
   ctx.provide('connection',{
    interactions:'none',isLoopback:true,generation:{getSnapshot:()=>undefined,subscribe:()=>()=>{}},state:{getSnapshot:()=>undefined,subscribe:()=>()=>{}},
    openWebSocket:()=>{throw Error('Unexpected socket')},reconnect:()=>{},registerGenerationSource:()=>()=>{},start:()=>({stop:()=>{}}),
    rpc:{call:async(_path,endpoint)=>{calls.push(endpoint);switch(endpoint){case'fastResume/editorAssets':return{ok:true,value:{html:'',autosaveDelayMs:2000,maxImportBytes:10485760,maxDocumentBytes:10485760,frameConnectTimeoutMs:15000,bridgeTimeoutMs:45000,rendererPollIntervalMs:1000,wheelZoomDirection:'auto',refreshIntervalMs:2000}};case'fastResume/rendererRegister':return{ok:true,value:{rendererId:'lease',leaseMs:15000}};case'fastResume/rendererPoll':return{ok:true,value:null};case'fastResume/rendererUnregister':return{ok:true,value:true};default:throw Error(`Unexpected RPC ${endpoint}`)}},open:async function*(){throw Error('Unexpected stream')}},
   } satisfies ConnectionHandle)
   await ctx.plugin(gateway)
   ctx.provide('remote.session',{})
   ctx.provide('slots',{inject:(_name:string,setup:()=>unknown)=>setup(),register:(entry:{name:string;key?:string;id?:string})=>{entries.push(`${entry.name}:${entry.key??entry.id}`);return()=>{}}})
   ctx.provide('locale',{register:()=>()=>{},getSnapshot:()=>({active:'en'}),bind:()=>()=>''})
   ctx.provide('layout',{})
   ctx.provide('uiConversation',{events:{register:()=>()=>{}}});ctx.provide('uiWorkspace',{});ctx.provide('sessions',{});ctx.provide('workspaces',{})
   ctx.provide('sidebarRight',{mounted:{getSnapshot:()=>undefined,subscribe:()=>()=>{}},openResource:()=>{}})
   ctx.provide('sidebarRightTabs',{register:()=>()=>{}})
   const owner=ctx.plugin({inject,apply});await owner
   await vi.waitFor(()=>expect(calls).toContain('fastResume/rendererPoll'))
   expect(entries).toEqual([...['resume_context','resume_list','resume_create','resume_read','resume_edit','resume_propose','resume_apply','resume_revert','resume_history','resume_restore','resume_export'].map(name=>`tool.call.toolview:${name}`),'sidebar.right.pane.tab:fast-resume.document','conversation.session.header.actions:fast-resume.open','shell.overlay:fast-resume.entry','shell.overlay:fast-resume.activity','main:fast-resume','sidebar.panellist:fast-resume'])
   await owner.dispose();expect(calls).toContain('fastResume/rendererUnregister');expect(ctx.get('remote.fastResume')).toBeUndefined()
  }finally{await ctx.fiber.dispose();if(storage)Object.defineProperty(globalThis,'sessionStorage',storage);else Reflect.deleteProperty(globalThis,'sessionStorage');if(original)Object.defineProperty(globalThis,'window',original);else Reflect.deleteProperty(globalThis,'window')}
 })
})

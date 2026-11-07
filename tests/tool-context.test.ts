import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { apply } from '../src/host/tools.ts'
import { resumeIdSchema, resumeRevisionSchema } from '../src/identity.ts'
type Tool=Parameters<Context['tools']['register']>[0]
function fixture(){
 const ctx=new Context(),registries:Map<string,Tool>[]=[]
 function agent(id:string):Agent{const registry=new Map<string,Tool>();registries.push(registry);const scoped=Object.create(ctx) as Context;Object.defineProperty(scoped,'tools',{value:{register(tool:Tool){expect(registry.has(tool.name)).toBe(false);registry.set(tool.name,tool);return()=>registry.delete(tool.name)}}});return{id:brandString<SessionId>(id),ctx:scoped} as Agent}
 const ordinary=agent('ordinary'),plugin=agent('plugin-default')
 const resolveContext=vi.fn(async()=>({state:'choose',reason:'missing'})),bindContext=vi.fn(async()=>({state:'choose',reason:'missing'})),read=vi.fn(async()=>({id:'target',revision:1,documentJson:'{"pages":[]}'}))
 ctx.provide('agents',{list:()=>[ordinary]});ctx.provide('fastResume',{resolveContext,bindContext,read})
 return{ctx,registries,ordinary,plugin,resolveContext,bindContext}
}
describe('global resume tool context',()=>{
 it('installs each old tool once in existing and newly created default Sessions and disposes registrations',async()=>{
  const{ctx,ordinary,plugin,registries}=fixture()
  try{apply(ctx);ctx.emit('agent/created',{agent:plugin,source:'startup'});ctx.emit('agent/created',{agent:ordinary,source:'startup'})
   for(const registry of registries)expect([...registry.keys()].sort()).toEqual(['resume_apply','resume_context','resume_create','resume_edit','resume_export','resume_history','resume_list','resume_propose','resume_read','resume_restore','resume_revert'])
  }finally{await ctx.fiber.dispose()}
  for(const registry of registries)expect(registry.size).toBe(0)
 })
 it('resolves and selects with trusted execution identity; named reads do not bind',async()=>{
  const{ctx,registries,ordinary,resolveContext,bindContext}=fixture()
  try{apply(ctx);const tool=registries[0].get('resume_context')!;expect(tool).toBeDefined()
   const exec={agent:ordinary,signal:new AbortController().signal}
   // The pipeline supplies the other execution fields; these tool bodies use only agent and signal.
   const run=(args:object)=>tool.execute(args,exec as Parameters<Tool['execute']>[1])
   await run({intent:'resolve'})
   expect(resolveContext).toHaveBeenLastCalledWith(ordinary.id,undefined)
   await run({intent:'select',id:'target',expectedRevision:1,requestId:'selection'})
   expect(bindContext).toHaveBeenLastCalledWith({sessionId:ordinary.id,resumeId:resumeIdSchema.parse('target'),expectedRevision:resumeRevisionSchema.parse(1),requestId:'selection',source:'explicit-tool'})
   const read=registries[0].get('resume_read')!
   await read.execute({id:'comparison'},exec as Parameters<Tool['execute']>[1])
   expect(bindContext).toHaveBeenCalledTimes(1)
   await expect(tool.execute({intent:'resolve'},{signal:exec.signal} as Parameters<Tool['execute']>[1])).rejects.toMatchObject({code:'invalid-input'})
   await expect(run({intent:'select',id:'target'})).rejects.toMatchObject({code:'invalid-input'})
  }finally{await ctx.fiber.dispose()}
 })
})

import {it,expect,vi} from 'vitest'
import {Context,Service} from '@deepseek-ai/cordis'
import {createSnapshotStore} from '@deepseek-ai/dsh-client-store'
import {RemoteStream} from '@deepseek-ai/dsh-api-gateway/client'
import {brandString} from '@deepseek-ai/dsh-brand'
import {SESSION_FORMAT_VERSION,type SessionId} from '@deepseek-ai/dsh-session/types'
import {readFile} from 'node:fs/promises'
import {runInNewContext} from 'node:vm'
import {ClientSessions} from '../../node_modules/@deepseek-ai/dsh-api-session-controller/lib/types/client/sessions/service.js'
import type {SessionRemotes} from '../../node_modules/@deepseek-ai/dsh-api-session-controller/lib/types/client/sessions/remotes.js'
import type {SessionFollowFrame} from '@deepseek-ai/dsh-api-session-controller/types'
import type {IWorkspaces,WorkspaceSnapshot,WorkspaceView} from '@deepseek-ai/dsh-api-workspace-controller/client'
import type {UiWorkspace} from '@deepseek-ai/dsh-client-ui-workspace/client'
import {assistantWorkspace,prepareAssistantSession} from '../../src/client/session-handoff.ts'
import type {AssistantWorkspaceId} from '../../src/types.ts'
const workspaceId=brandString<AssistantWorkspaceId>('workspace'),canonical=brandString<SessionId>('canonical')
const workspace:WorkspaceView={workspaceId,path:'/configured/default',title:'Default',createdAt:'2026-11-01T00:00:00.000Z',updatedAt:'2026-11-01T00:00:00.000Z',sessionIds:[]}
const snapshot:WorkspaceSnapshot={items:[workspace],archivedSessionIds:[],pinnedSessionIds:[],state:'idle',phase:'ready',error:null}
it('publishes a canonical Session before public navigation, awaits its live binding and Workspace membership, and never submits a prompt',async()=>{
 const ctx=new Context(),life=new AbortController(),list=createSnapshotStore(snapshot),create=vi.fn(async(request:{sessionId?:SessionId;workspaceId?:AssistantWorkspaceId})=>{
  expect(request).toEqual({sessionId:brandString<SessionId>('requested'),workspaceId});return{ok:true as const,value:{sessionId:canonical}}
 })
 const prompt=vi.fn(()=>{throw Error('Entry must not prompt')})
 const remote:SessionRemotes={
  // This fixture deliberately provides only the public operations reached by create/open.
  session:{attachment:prompt,cancel:prompt,canOpenWorkspacePath:prompt,control:prompt,fork:prompt,initializeDefaultModel:prompt,modelCatalog:prompt,openWorkspacePath:prompt,page:prompt,projections:prompt,rename:prompt,search:prompt,selectModel:prompt,updateQueue:prompt,workspacePathApplications:prompt,create,prompt,list:async()=>({ok:true,value:{items:[{sessionId:canonical,updatedAt:1,agentAvailable:true,running:false,blank:true,cwd:workspace.path}]}}),follow:(_request,signal)=>({
   async *[Symbol.asyncIterator]():AsyncGenerator<SessionFollowFrame>{yield{type:'snapshot',header:{version:SESSION_FORMAT_VERSION,id:canonical,createdAt:0,isSeeded:false},cursor:-1,records:[],hasMore:false,projections:{asOfSeq:-1,values:{}},assistantStream:{revision:0}};if(!signal?.aborted)await new Promise<void>(resolve=>signal?.addEventListener('abort',()=>resolve(),{once:true}))},send:()=>{},end:()=>{},dispose:()=>{},
  })},
  $stream:options=>new RemoteStream({generation:{getSnapshot:()=>({id:1,host:{home:'/fixture'}}),subscribe:()=>()=>{}}},options),
  commands:{execute:prompt},subagents:{prompt,interruptByParent:prompt},
 }
 const sessions=new ClientSessions(ctx,remote),workspaces={list,initializeDefault:vi.fn(async()=>workspace)}
 const selectPanel=vi.fn();ctx.provide('layout',{selectPanel})
 try{
  expect(()=>sessions.retain(canonical,{source:'fastResumeEntry'})).toThrow('unknown session')
  expect(await assistantWorkspace(workspaces,sessions,life.signal)).toBe(workspaceId)
  const id=await sessions.create({sessionId:brandString<SessionId>('requested'),workspaceId})
  expect(id).toBe(canonical);expect(sessions.list.getSnapshot().ids).toContain(canonical)
  let prepared=false;const opening=prepareAssistantSession(sessions,workspaces,id,workspaceId,life.signal).then(release=>{prepared=true;return release})
  await sessions.refresh();expect(prepared).toBe(false)
  list.set({...snapshot,items:[{...workspace,sessionIds:[canonical]}]});const release=await opening
  // Execute the installed navigation provider, not a mock openSession that pretends a raw Remote response is mounted.
  const bundle=await readFile('node_modules/@deepseek-ai/dsh-client-ui-workspace/lib/client.js','utf8'),start=bundle.indexOf('//#region lib/types/client/navigation.js'),end=bundle.indexOf('//#endregion',start)
  expect(start).toBeGreaterThan(0)
  type NavigationConstructor=new(...args:ConstructorParameters<typeof import('../../node_modules/@deepseek-ai/dsh-client-ui-workspace/lib/types/client/navigation.js').UiWorkspaceService>)=>UiWorkspace
  const Navigation:NavigationConstructor=runInNewContext(bundle.slice(start,end)+'\nUiWorkspaceService',{_deepseek_ai_cordis:{Service},_deepseek_ai_dsh_client_store:{createSnapshotStore},AbortController})
  const navigationWorkspaces:IWorkspaces={...workspaces,create:prompt,rename:prompt,delete:prompt,insertBefore:prompt,archiveSession:prompt,unarchiveSession:prompt,pinSession:prompt,unpinSession:prompt,insertSessionBefore:prompt,list:createSnapshotStore({...snapshot,phase:'pending' as const})}
  const navigation=new Navigation(ctx,{} as ConstructorParameters<NavigationConstructor>[1],navigationWorkspaces,sessions,{pinSessionOrder:()=>{}},()=>{})
  navigation.openSession(id);release()
  expect(selectPanel).toHaveBeenCalledExactlyOnceWith(null)
  expect(sessions.list.getSnapshot().byId[id]?.retainedBy).toMatchObject({mainView:1})
  expect(sessions.list.getSnapshot().byId[id]?.retainedBy.fastResumeEntry).toBeUndefined()
  expect(create).toHaveBeenCalledOnce();expect(prompt).not.toHaveBeenCalled()
 }finally{life.abort();await ctx.fiber.dispose()}
})
it('uses the publicly retained main Session Workspace before the default and stops canceled selection',async()=>{
 const selected=brandString<SessionId>('selected'),list=createSnapshotStore({...snapshot,items:[{...workspace,sessionIds:[selected]}]}),fallback=vi.fn(async()=>workspace)
 const sessions={list:createSnapshotStore({ids:[selected],byId:{[selected]:{id:selected,displayTitle:'Selected',running:false,blank:false,updatedAt:0,retainedBy:{mainView:1}}},phase:'ready' as const,projectionsBySession:{}})}
 expect(await assistantWorkspace({list,initializeDefault:fallback},sessions,new AbortController().signal)).toBe(workspaceId);expect(fallback).not.toHaveBeenCalled()
 const canceled=new AbortController();canceled.abort()
 await expect(assistantWorkspace({list,initializeDefault:fallback},sessions,canceled.signal)).rejects.toThrow();expect(fallback).not.toHaveBeenCalled()
})

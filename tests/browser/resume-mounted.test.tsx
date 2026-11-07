// @vitest-environment jsdom
/** Actual published Conversation/Chat assembly feeding the blank-header root observer. */
import React,{act} from 'react'
import * as zod from 'zod'
import * as jsx from 'react/jsx-runtime'
import * as cordis from '@deepseek-ai/cordis'
import * as store from '@deepseek-ai/dsh-client-store'
import {createRoot} from 'react-dom/client'
import {readFile} from 'node:fs/promises'
import {afterEach,it,expect,vi} from 'vitest'
import {ResumeActivityMount} from '../../src/client/resume-tab.tsx'
import {ResumeActivityTracker,resumeActivityDefinition} from '../../src/client/resume-activity.ts'
import type {ISessions,SessionBinding,SessionEventWindow,SessionSnapshot} from '@deepseek-ai/dsh-api-session-controller/client'
import type {UiConversation,ConversationViewDefinition} from '@deepseek-ai/dsh-client-ui-conversation/client'
import {brandString} from '@deepseek-ai/dsh-brand'
import {SessionSeq,type SessionId,type SessionEvent} from '@deepseek-ai/dsh-session/types'
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks()})
async function published<T>(name:string,extra?:string):Promise<T>{let result:T|undefined;const dependencies:Record<string,unknown>={'react':React,'zod':zod,'react/jsx-runtime':jsx,'@deepseek-ai/cordis':cordis,'@deepseek-ai/dsh-client-store':store};const source=await readFile(`node_modules/@deepseek-ai/${name}/lib/client.js`,'utf8');new Function('window',extra?source.replace('return module.exports;',`return ${extra};`):source)({__ModuleLoader__:{load:({factory}:{factory:(resolve:(id:string)=>unknown)=>T})=>{result=factory(id=>dependencies[id]??new Proxy({},{get:()=>()=>null}))}}});if(!result)throw Error('Missing published module');return result}
it.each([false,true])('subscribes before first-prompt header paint with an already completed turn: %s',async completed=>{
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true)
 const {UiConversation:Conversation}=await published<{UiConversation:typeof UiConversation}>('dsh-client-ui-conversation')
 const definition=await published<ConversationViewDefinition>('dsh-client-ui-chat','chatViewDefinition')
 const ctx=new cordis.Context(),sessionId=brandString<SessionId>('ordinary'),mounted=store.createSnapshotStore<SessionId|undefined>(sessionId)
 const events=store.createSnapshotStore<SessionEventWindow>({revision:0,entries:[],hasMore:false,change:{kind:'replace',entries:[]}})
 const session=store.createSnapshotStore<SessionSnapshot>({sessionId,openState:'open',pendingSubmissions:[],running:false,subagent:null,removed:false,openError:null,hasMore:false,loadingOlder:false,promptError:null,blank:true,lastAgentError:null,promptAttempted:false,awaitingFirstTurn:false})
 // Only the assembler owns this test transport; production never reads eventSource.
 const unused=()=>{throw Error('Unexpected Session operation')},face={...session,sessionId,projections:{faceOf:unused},beginSubmission:unused,prompt:unused,readAttachment:unused,updateQueue:unused,cancel:unused,rename:unused,loadOlder:unused,loadThrough:unused,command:unused}
 const binding={sessionId,session:face,eventSource:events,ctx:{effect:ctx.effect.bind(ctx)} as SessionBinding['ctx']} satisfies SessionBinding
 const sessions={binding:()=>binding,list:store.createSnapshotStore({ids:[sessionId],byId:{},phase:'ready',projectionsBySession:{}})} as Pick<ISessions,'binding'|'list'>
 const conversation=new Conversation(ctx,sessions as ISessions),reveal=vi.fn(async()=>true),tracker=new ResumeActivityTracker(()=>mounted.getSnapshot(),()=>'',reveal)
 conversation.views.register(definition);conversation.events.register(resumeActivityDefinition)
 const container=document.createElement('div');document.body.append(container);const root=createRoot(container)
 function append(input:SessionEvent[]){const previous=events.getSnapshot(),entries=input.map(event=>({type:'event' as const,event}));events.set({revision:previous.revision+1,entries:[...previous.entries,...entries],hasMore:false,change:{kind:'append',entries}})}
 try{
  await act(async()=>root.render(<ResumeActivityMount mounted={mounted} sessions={sessions} conversation={conversation} tracker={tracker}/>))
  expect(container.textContent).toBe('');const nodes=conversation.binding(binding).target('chat').getSnapshot()!.nodes,originalValues=nodes.values.bind(nodes),scans:string[]=[],values=vi.spyOn(nodes,'values').mockImplementation(()=>{scans.push(new Error().stack??'');return originalValues()})
  await act(async()=>append([{type:'turn/start',seq:SessionSeq(1),time:1,data:{turn:1}},{type:'tool/call',seq:SessionSeq(2),time:2,data:{callId:'call',name:'resume_context',arguments:'{"intent":"resolve"}',turn:1,step:1}},{type:'tool/result',seq:SessionSeq(3),time:3,data:{message:{role:'tool',source:{callId:'call'},content:[{type:'text',text:JSON.stringify({state:'bound',context:{schemaVersion:1,sessionId,resumeId:'11111111-1111-4111-8111-111111111111',updatedAt:'2026-11-01',source:'explicit-tool'},revision:1})}]}}},...(completed?[{type:'turn/end',seq:SessionSeq(4),time:4,data:{turn:1}}]:[])] as SessionEvent[]))
  expect(reveal).toHaveBeenCalledOnce();expect(tracker.statusSource(sessionId).getSnapshot()).toMatchObject({phase:'ready',callId:'call'});expect(scans.filter(stack=>stack.includes('src/client/resume-tab'))).toHaveLength(0)
  if(!completed)await act(async()=>append([{type:'turn/end',seq:SessionSeq(4),time:4,data:{turn:1}}] as SessionEvent[]));expect(scans.filter(stack=>stack.includes('src/client/resume-tab'))).toHaveLength(0);expect(reveal).toHaveBeenCalledOnce()
 }finally{await act(async()=>root.unmount());await ctx.fiber.dispose();container.remove();vi.unstubAllGlobals()}
})
it('keeps a resume hidden when its mounted tab is closed during thinking before any resume call, then permits the next turn',async()=>{
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true)
 const {ResumeTab}=await import('../../src/client/resume-tab.tsx'),{EditorViews}=await import('../../src/client/editor-views.ts'),{resumeIdSchema}=await import('../../src/identity.ts'),{resumeAddress}=await import('../../src/client/resume-resource.ts')
 const {UiConversation:Conversation}=await published<{UiConversation:typeof UiConversation}>('dsh-client-ui-conversation'),definition=await published<ConversationViewDefinition>('dsh-client-ui-chat','chatViewDefinition')
 const ctx=new cordis.Context(),sessionId=brandString<SessionId>('thinking-session'),resumeId=resumeIdSchema.parse('11111111-1111-4111-8111-111111111111'),mounted=store.createSnapshotStore<SessionId|undefined>(sessionId)
 const events=store.createSnapshotStore<SessionEventWindow>({revision:0,entries:[],hasMore:false,change:{kind:'replace',entries:[]}})
 const session=store.createSnapshotStore<SessionSnapshot>({sessionId,openState:'open',pendingSubmissions:[],running:false,subagent:null,removed:false,openError:null,hasMore:false,loadingOlder:false,promptError:null,blank:true,lastAgentError:null,promptAttempted:false,awaitingFirstTurn:false})
 const unused=()=>{throw Error('Unexpected Session operation')},sessionFace={...session,sessionId,projections:{faceOf:unused},beginSubmission:unused,prompt:unused,readAttachment:unused,updateQueue:unused,cancel:unused,rename:unused,loadOlder:unused,loadThrough:unused,command:unused}
 const binding={sessionId,session:sessionFace,eventSource:events,ctx:{effect:ctx.effect.bind(ctx)} as SessionBinding['ctx']} satisfies SessionBinding
 const sessions={binding:()=>binding,list:store.createSnapshotStore({ids:[sessionId],byId:{},phase:'ready',projectionsBySession:{}})} as Pick<ISessions,'binding'|'list'>
 let expanded=true
 const reveal=vi.fn(async(_activity:import('../../src/client/resume-activity.ts').ResumeActivity,valid:()=>boolean)=>{if(!valid())return false;expanded=true;return true}),tracker=new ResumeActivityTracker(()=>mounted.getSnapshot(),()=>expanded?'existing-resume':'closed',reveal)
 const conversation=new Conversation(ctx,sessions as ISessions);conversation.views.register(definition);conversation.events.register(resumeActivityDefinition)
 const assets={html:'editor',autosaveDelayMs:2000,maxImportBytes:100000,maxDocumentBytes:100000,frameConnectTimeoutMs:15000,bridgeTimeoutMs:45000,rendererPollIntervalMs:1000,wheelZoomDirection:'auto' as const,maxAssistantCheckpointBytes:67108864,editorPollIntervalMs:1000,refreshIntervalMs:2000}
 const views=new EditorViews(async()=>assets,async()=>null,()=> 'en',undefined,()=> 'Moved'),setVisible=vi.fn(),dispose=vi.fn(),life=new AbortController()
 const face=vi.spyOn(views,'face').mockImplementation(()=>({loadAssets:async()=>assets,connect:()=>()=>{},setVisible,dispose}))
 const info:ReturnType<import('../../src/client/resume-tab.tsx').ResumeTabProps['useTabInfo']>={sidebar:{expanded:true,fullscreen:false},panel:{id:brandString<import('@deepseek-ai/dsh-client-ui-sidebar-right/client').PaneId>('pane')},tab:{id:brandString<import('@deepseek-ai/dsh-client-ui-sidebar-right/client').TabId>('tab'),kind:'fast-resume.document',title:'Resume',contentId:resumeAddress(resumeId),visible:true,navigation:{address:resumeAddress(resumeId),params:undefined,revision:1},signal:life.signal,actions:{bindCommands:()=>()=>{},openResource:()=>{},openTab:()=>{},close:()=>{}}}}
 const tabProps:import('../../src/client/resume-tab.tsx').ResumeTabProps={sessionId,useTabInfo:()=>({...info,tab:{...info.tab,visible:expanded}}),views,library:()=>{},hidden:id=>tracker.hide(id),t:key=>key}
 const container=document.createElement('div');document.body.append(container);const root=createRoot(container)
 const render=()=>root.render(<><ResumeActivityMount mounted={mounted} sessions={sessions} conversation={conversation} tracker={tracker}/><ResumeTab {...tabProps}/></>)
 const append=(input:SessionEvent[])=>{const previous=events.getSnapshot(),entries=input.map(event=>({type:'event' as const,event}));events.set({revision:previous.revision+1,entries:[...previous.entries,...entries],hasMore:false,change:{kind:'append',entries}})}
 const result=(seq:number,turn:number):SessionEvent[]=>[{type:'tool/call',seq:SessionSeq(seq),time:seq,data:{callId:`call${turn}`,name:'resume_context',arguments:'{"intent":"resolve"}',turn,step:1}},{type:'tool/result',seq:SessionSeq(seq+1),time:seq+1,data:{message:{role:'tool',source:{callId:`call${turn}`},content:[{type:'text',text:JSON.stringify({state:'bound',context:{schemaVersion:1,sessionId,resumeId,updatedAt:'2026-11-01',source:'explicit-tool'},revision:1})}]}}}] as SessionEvent[]
 try{
  await act(async()=>render());expect(container.querySelector('iframe')).not.toBeNull()
  await act(async()=>append([{type:'turn/start',seq:SessionSeq(1),time:1,data:{turn:1}}] as SessionEvent[]))
  expect(conversation.binding(binding).openTurn.getSnapshot()).toBe(1);expect(tracker.statusSource(sessionId).getSnapshot()).toBeUndefined()
  await act(async()=>{expanded=false;render()});expect(setVisible).toHaveBeenLastCalledWith(false)
  await act(async()=>append(result(2,1)));expect(reveal).not.toHaveBeenCalled();expect(expanded).toBe(false)
  await act(async()=>append([{type:'turn/end',seq:SessionSeq(4),time:4,data:{turn:1}},{type:'turn/start',seq:SessionSeq(5),time:5,data:{turn:2}}] as SessionEvent[]))
  await act(async()=>append(result(6,2)));expect(reveal).toHaveBeenCalledOnce();expect(expanded).toBe(true)
 }finally{await act(async()=>root.unmount());face.mockRestore();views.dispose();await ctx.fiber.dispose();container.remove();vi.unstubAllGlobals()}
})

// @vitest-environment jsdom
import React,{act} from 'react'
import * as jsxRuntime from 'react/jsx-runtime'
import {readFile} from 'node:fs/promises'
import {runInNewContext} from 'node:vm'
import {createRoot,type Root} from 'react-dom/client'
import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {brandString} from '@deepseek-ai/dsh-brand'
import type {SessionId} from '@deepseek-ai/dsh-session/types'
import {ResumeHeader,AssistantMount,type ResumeHeaderProps} from '../../src/client/resume-tab.tsx'
import {en} from '../../src/client/locales.tsx'
import {resumeIdSchema,resumeRevisionSchema} from '../../src/identity.ts'
import type {ResumeContextResult} from '../../src/types.ts'
let root:Root
beforeEach(()=>{vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);const container=document.createElement('div');document.body.append(container);root=createRoot(container)})
afterEach(async()=>{await act(async()=>root.unmount());document.body.replaceChildren();vi.unstubAllGlobals()})
it('opens only after an explicit click and discards a resolution after the mounted Session changes',async()=>{
 const sessionId=brandString<SessionId>('session-one'),resumeId=resumeIdSchema.parse(crypto.randomUUID()),open=vi.fn()
 let finish!:(value:ResumeContextResult)=>void,mounted:SessionId|undefined=sessionId
 const resolve=vi.fn(()=>new Promise<ResumeContextResult>(r=>finish=r))
 const props:ResumeHeaderProps={sessionId,resolve,open,mounted:()=>mounted,useSidebarMounted:selector=>selector(mounted),t:key=>key in en?en[key as keyof typeof en]:key}
 await act(async()=>root.render(React.createElement(ResumeHeader,props)))
 expect(resolve).not.toHaveBeenCalled();expect(open).not.toHaveBeenCalled()
 await act(async()=>document.querySelector<HTMLButtonElement>('button')!.click())
 mounted=brandString<SessionId>('session-two')
 await act(async()=>finish({state:'choose',reason:'missing'}));expect(open).not.toHaveBeenCalled()
 mounted=sessionId
 await act(async()=>root.render(React.createElement(ResumeHeader,props)))
 await act(async()=>document.querySelector<HTMLButtonElement>('button')!.click())
 await act(async()=>finish({state:'bound',revision:resumeRevisionSchema.parse(1),context:{schemaVersion:1,sessionId,resumeId,source:'explicit-tool',updatedAt:new Date().toISOString()}}))
 expect(open).toHaveBeenCalledWith(resumeId)
})
it('keeps the same full editor iframe through hide and fullscreen, and releases it on tab close',async()=>{
 const {ResumeTab}=await import('../../src/client/resume-tab.tsx'),{EditorViews}=await import('../../src/client/editor-views.ts')
 const {resumeAddress}=await import('../../src/client/resume-resource.ts')
 const sessionId=brandString<SessionId>('session-one'),resumeId=resumeIdSchema.parse(crypto.randomUUID()),life=new AbortController()
 const assets={html:'editor',autosaveDelayMs:2000,maxImportBytes:100000,maxDocumentBytes:100000,frameConnectTimeoutMs:15000,bridgeTimeoutMs:45000,rendererPollIntervalMs:1000,wheelZoomDirection:'auto' as const,maxAssistantCheckpointBytes:67108864,editorPollIntervalMs:1000,refreshIntervalMs:2000}
 const views=new EditorViews(async()=>assets,async()=>null,()=> 'en',sessionStorage,()=> 'Moved')
 const close=vi.fn(),connect=vi.fn(()=>close),setVisible=vi.fn(),dispose=vi.fn()
 vi.spyOn(views,'face').mockImplementation(()=>({loadAssets:async()=>assets,connect:()=>connect(),setVisible,dispose}))
 const info:ReturnType<import('../../src/client/resume-tab.tsx').ResumeTabProps['useTabInfo']>={sidebar:{expanded:true,fullscreen:false},panel:{id:brandString<import('@deepseek-ai/dsh-client-ui-sidebar-right/client').PaneId>('pane')},tab:{id:brandString<import('@deepseek-ai/dsh-client-ui-sidebar-right/client').TabId>('tab'),kind:'fast-resume.document',title:'Resume',contentId:resumeAddress(resumeId),visible:true,navigation:{address:resumeAddress(resumeId),params:undefined,revision:1},signal:life.signal,actions:{bindCommands:()=>()=>{},openResource:()=>{},openTab:()=>{},close:()=>{}}}}
 const handoff:import('../../src/client/editor-handoff.ts').RetainedEditorHandoff={resumeId,revision:resumeRevisionSchema.parse(1),transferId:brandString<import('../../src/types.ts').EditorTransferId>(crypto.randomUUID()),checkpointId:brandString<import('../../src/types.ts').EditorCheckpointId>(crypto.randomUUID()),target:{ownerId:brandString<import('../../src/types.ts').EditorOwnerId>(crypto.randomUUID()),incarnationId:brandString<import('../../src/types.ts').EditorIncarnationId>(crypto.randomUUID())}}
 const withHandoff={...info,tab:{...info.tab,navigation:{...info.tab.navigation,params:{fastResume:{handoff}}}}}
 const props:import('../../src/client/resume-tab.tsx').ResumeTabProps={sessionId,useTabInfo:()=>withHandoff,views,library:()=>{},t:key=>key in en?en[key as keyof typeof en]:key}
 await act(async()=>root.render(React.createElement(ResumeTab,props)));const frame=document.querySelector('iframe');expect(frame).not.toBeNull();expect(connect).toHaveBeenCalledOnce()
 const revealed={...info,tab:{...info.tab,navigation:{...info.tab.navigation,params:undefined,revision:2}}}
 await act(async()=>root.render(React.createElement(ResumeTab,{...props,useTabInfo:()=>revealed})));expect(document.querySelector('iframe')).toBe(frame);expect(connect).toHaveBeenCalledOnce();expect(dispose).not.toHaveBeenCalled()
 const hidden={...revealed,tab:{...revealed.tab,visible:false}}
 await act(async()=>root.render(React.createElement(ResumeTab,{...props,useTabInfo:()=>hidden})));expect(setVisible).toHaveBeenLastCalledWith(false);expect(document.querySelector('iframe')).toBe(frame)
 await act(async()=>root.render(React.createElement(ResumeTab,{...props,useTabInfo:()=>({...info,sidebar:{expanded:true,fullscreen:true}})})));expect(document.querySelector('iframe')).toBe(frame);expect(connect).toHaveBeenCalledOnce()
 await act(async()=>life.abort());expect(dispose).toHaveBeenCalled();expect(close).toHaveBeenCalledOnce();expect(document.querySelector('iframe')).toBeNull()
 views.dispose()
})
it('opens an explicit pending handoff only from the matching committed Session header',async()=>{
 const sessionId=brandString<SessionId>('created'),resumeId=resumeIdSchema.parse(crypto.randomUUID()),open=vi.fn(),resolve=vi.fn()
 const handoff:import('../../src/client/editor-handoff.ts').RetainedEditorHandoff={resumeId,revision:resumeRevisionSchema.parse(1),transferId:brandString<import('../../src/types.ts').EditorTransferId>(crypto.randomUUID()),checkpointId:brandString<import('../../src/types.ts').EditorCheckpointId>(crypto.randomUUID()),target:{ownerId:brandString<import('../../src/types.ts').EditorOwnerId>(crypto.randomUUID()),incarnationId:brandString<import('../../src/types.ts').EditorIncarnationId>(crypto.randomUUID())}}
 const incoming={sessionId,resumeId,handoff};let mounted:SessionId|undefined=brandString<SessionId>('other')
 const props:ResumeHeaderProps={sessionId,resolve,open,pending:()=>incoming,mounted:()=>mounted,useSidebarMounted:selector=>selector(mounted),t:key=>key in en?en[key as keyof typeof en]:key}
 await act(async()=>root.render(React.createElement(ResumeHeader,props)));expect(open).not.toHaveBeenCalled();expect(resolve).not.toHaveBeenCalled()
 mounted=sessionId;await act(async()=>root.render(React.createElement(ResumeHeader,props)));expect(open).toHaveBeenCalledExactlyOnceWith(resumeId,handoff)
 await act(async()=>root.render(React.createElement(ResumeHeader,props)));expect(open).toHaveBeenCalledOnce()
})
it('opens an explicit entry while the real empty-conversation header omits title actions',async()=>{
 // Execute the pinned published header, including its actual hideChrome decision; no Harness source checkout is required.
 const bundle=await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8')
 const start=bundle.indexOf('//#region lib/types/client/skeleton/ConversationSession.js'),end=bundle.indexOf('//#endregion',start)
 const resolveStart=bundle.indexOf('function resolveActiveView('),resolveEnd=bundle.indexOf('//#endregion',resolveStart)
 expect(start).toBeGreaterThan(0);expect(resolveStart).toBeGreaterThan(0)
 const ConversationSessionHeader:React.ComponentType<import('@deepseek-ai/dsh-client-ui-conversation/client').ConversationSessionHeaderSlotProps>=runInNewContext(bundle.slice(resolveStart,resolveEnd)+bundle.slice(start,end)+'\nConversationSessionHeader',{react_jsx_runtime:jsxRuntime,ConversationRoot_module_css_default:{},clsx:(...values:unknown[])=>values.filter(Boolean).join(' ')})
 const sessionId=brandString<SessionId>('empty-session'),resumeId=resumeIdSchema.parse(crypto.randomUUID()),open=vi.fn(),resolve=vi.fn()
 const handoff:import('../../src/client/editor-handoff.ts').RetainedEditorHandoff={resumeId,revision:resumeRevisionSchema.parse(1),transferId:brandString<import('../../src/types.ts').EditorTransferId>(crypto.randomUUID()),checkpointId:brandString<import('../../src/types.ts').EditorCheckpointId>(crypto.randomUUID()),target:{ownerId:brandString<import('../../src/types.ts').EditorOwnerId>(crypto.randomUUID()),incarnationId:brandString<import('../../src/types.ts').EditorIncarnationId>(crypto.randomUUID())}}
 const incoming={sessionId,resumeId,handoff},props:ResumeHeaderProps={sessionId,resolve,open,pending:()=>incoming,mounted:()=>sessionId,useSidebarMounted:selector=>selector(sessionId),t:key=>key in en?en[key as keyof typeof en]:key}
 const slots:string[]=[],headerProps={sessionId,hideChrome:true,useSessions:(select:(s:{byId:object})=>unknown)=>select({byId:{}}),useConversationViews:(select:(s:unknown[])=>unknown)=>select([]),useStore:(select:(s:{view?:string})=>unknown)=>select({}),renderSlot:(slot:string)=>{slots.push(slot);return slot==='conversation.session.header.actions'?React.createElement(ResumeHeader,props):null},t:(key:string)=>key} as React.ComponentProps<typeof ConversationSessionHeader>
 await act(async()=>root.render(React.createElement(React.Fragment,null,React.createElement(ConversationSessionHeader,headerProps),React.createElement(AssistantMount,{pending:()=>incoming,subscribePending:()=>()=>{},mounted:{getSnapshot:()=>sessionId,subscribe:()=>()=>{}},open:entry=>open(entry.resumeId,entry.handoff)}))))
 expect(slots).not.toContain('conversation.session.header.actions');expect(open).toHaveBeenCalledExactlyOnceWith(resumeId,handoff)
})
it('automatic reveal checks narrow presentation, current binding and late navigation without changing Session',async()=>{
 const {revealResumeActivity}=await import('../../src/client/resume-tab.tsx')
 const sessionId=brandString<SessionId>('ordinary'),resumeId=resumeIdSchema.parse(crypto.randomUUID()),openResource=vi.fn(),sidebar={mounted:{getSnapshot:()=>sessionId,subscribe:()=>()=>{}},isExpanded:()=>false,active:()=>undefined,openResource}
 const activity:import('../../src/client/resume-activity.ts').ResumeActivity={callId:'call',rootCallId:'root',name:'resume_edit',argsRaw:'{}',startSeq:1,seq:2,turn:1,phase:'saved',target:{resumeId,revision:resumeRevisionSchema.parse(2)}}
 let valid=true,finish!:(result:ResumeContextResult)=>void
 const resolve=vi.fn(()=>new Promise<ResumeContextResult>(done=>{finish=done}))
 await revealResumeActivity(activity,()=>valid,{sidebar,resolve,wide:()=>false});expect(resolve).not.toHaveBeenCalled()
 const pending=revealResumeActivity(activity,()=>valid,{sidebar,resolve,wide:()=>true});valid=false;finish({state:'bound',revision:resumeRevisionSchema.parse(2),context:{schemaVersion:1,sessionId,resumeId,source:'explicit-tool',updatedAt:new Date().toISOString()}});await pending;expect(openResource).not.toHaveBeenCalled()
 valid=true;const changed=revealResumeActivity(activity,()=>valid,{sidebar,resolve,wide:()=>true});finish({state:'bound',revision:resumeRevisionSchema.parse(2),context:{schemaVersion:1,sessionId,resumeId:resumeIdSchema.parse(crypto.randomUUID()),source:'explicit-tool',updatedAt:new Date().toISOString()}});await changed;expect(openResource).not.toHaveBeenCalled()
})

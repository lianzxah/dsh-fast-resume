import {it,expect,vi,afterEach} from 'vitest'
import {mkdtemp,rm,readFile,writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {brandString} from '@deepseek-ai/dsh-brand'
import {SessionContextStore} from '../../src/host/session-context.ts'
import {ResumeStore,resolveConfig} from '../../src/host/store.ts'
import {SessionHandoff} from '../../src/client/session-handoff.ts'
import type {AssistantHandoffId,EditorCheckpointId} from '../../src/types.ts'
const roots:string[]=[]
afterEach(async()=>{await Promise.all(roots.splice(0).map(root=>rm(root,{recursive:true,force:true})))})
async function fixture(){const root=await mkdtemp(join(tmpdir(),'assistant-entry-'));roots.push(root);const docs=new ResumeStore(resolveConfig(root,{})),contexts=new SessionContextStore(docs),doc=await docs.create({title:'Entry'});const request={resumeId:doc.id,expectedRevision:doc.revision,requestId:brandString<AssistantHandoffId>(crypto.randomUUID()),workspaceId:brandString<import('../../src/types.ts').AssistantWorkspaceId>('workspace')};return{docs,contexts,doc,request}}
it('allocates once across restart, records the canonical response, and binds without modifying document bytes',async()=>{
 const{docs,contexts,doc,request}=await fixture(),before=await readFile(join(docs.config.storageDir,`${doc.id}.json`),'utf8')
 const a=await contexts.beginAssistantHandoff(request),b=await new SessionContextStore(docs).beginAssistantHandoff(request)
 expect(a.admitted).toBe(true);expect(b.admitted).toBe(false);expect(b.handoff.requestedSessionId).toBe(a.handoff.requestedSessionId)
 const sessionId=brandString<import('@deepseek-ai/dsh-session/types').SessionId>('canonical')
 await contexts.recordAssistantSession({requestId:request.requestId,sessionId});expect((await new SessionContextStore(docs).readAssistantHandoff({requestId:request.requestId}))?.sessionId).toBe(sessionId)
 await contexts.bind({resumeId:request.resumeId,expectedRevision:request.expectedRevision,requestId:request.requestId,sessionId,source:'editor-entry'})
 expect(await readFile(join(docs.config.storageDir,`${doc.id}.json`),'utf8')).toBe(before)
 await expect(contexts.recordAssistantSession({requestId:request.requestId,sessionId:brandString<import('@deepseek-ai/dsh-session/types').SessionId>('different')})).rejects.toThrow()
})
it('keeps canonical identity through binding failure and never replays unknown creation after reload',async()=>{
 const{contexts,request}=await fixture(),create=vi.fn(async()=>({sessionId:brandString<import('@deepseek-ai/dsh-session/types').SessionId>('canonical')})),bind=vi.fn(async():Promise<void>=>{throw Error('bind failed')})
 const calls={workspace:async()=>request.workspaceId,begin:contexts.beginAssistantHandoff.bind(contexts),read:contexts.readAssistantHandoff.bind(contexts),record:contexts.recordAssistantSession.bind(contexts),create,bind,lookup:vi.fn(async()=>false)}
 const flow=new SessionHandoff(calls),input={...request,checkpointId:brandString<EditorCheckpointId>(crypto.randomUUID())}
 await expect(flow.startResumeConversation(input,undefined,new AbortController().signal)).rejects.toThrow('bind failed');bind.mockImplementation(async()=>{})
 expect(await flow.startResumeConversation(input,undefined,new AbortController().signal)).toMatchObject({sessionId:'canonical'});expect(create).toHaveBeenCalledTimes(1)
 const unknown={...input,requestId:brandString<AssistantHandoffId>(crypto.randomUUID())};create.mockRejectedValueOnce(Error('response lost'))
 await expect(flow.startResumeConversation(unknown,undefined,new AbortController().signal)).rejects.toMatchObject({code:'outcome-unknown'})
 await expect(new SessionHandoff(calls).startResumeConversation(unknown,undefined,new AbortController().signal)).rejects.toMatchObject({code:'outcome-unknown'});expect(create).toHaveBeenCalledTimes(2)
})

import {AssistantEntry,type SessionHandoffCalls} from '../../src/client/session-handoff.ts'
import type {EditorReadyHandle} from '../../src/client/editor-handoff.ts'
import type {PortBridge} from '../../src/editor/bridge.ts'
import type {ResumeId,EditorOwnerId,EditorIncarnationId} from '../../src/types.ts'
function gate<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(r=>resolve=r);return{promise,resolve}}
function memoryStorage():Storage{const values=new Map<string,string>();return{get length(){return values.size},clear:()=>values.clear(),getItem:key=>values.get(key)??null,key:index=>[...values.keys()][index]??null,removeItem:key=>{values.delete(key)},setItem:(key,value)=>{values.set(key,value)}}}
async function entryFixture(){
 const f=await fixture(),order:string[]=[],storage=memoryStorage(),create=vi.fn(async()=>({sessionId:brandString<import('@deepseek-ai/dsh-session/types').SessionId>(crypto.randomUUID())})),bind=vi.fn(async(request:import('../../src/types.ts').ResumeContextBindRequest)=>f.contexts.bind(request))
 const calls:SessionHandoffCalls={workspace:vi.fn(async()=>f.request.workspaceId),begin:vi.fn(f.contexts.beginAssistantHandoff.bind(f.contexts)),read:f.contexts.readAssistantHandoff.bind(f.contexts),record:vi.fn(f.contexts.recordAssistantSession.bind(f.contexts)),bind,create,lookup:vi.fn(async()=>false)}
 const call:PortBridge['call']=vi.fn(async(method)=>{order.push(method);return method==='editorCapture'?{revision:f.doc.revision}:true})
 const source:EditorReadyHandle={ownerId:brandString<EditorOwnerId>(crypto.randomUUID()),incarnationId:brandString<EditorIncarnationId>(crypto.randomUUID()),bridge:{call} as PortBridge}
 const retain=vi.fn(()=>{order.push('retain');return()=>{order.push('clearRetained')}}),navigate=vi.fn(()=>{order.push('navigate')}),reveal=vi.fn(async()=>{})
 const entry=new AssistantEntry(new SessionHandoff(calls),()=>({source:()=>source,retain}),storage,navigate,reveal)
 return{...f,order,storage,calls,create,bind,call,source,retain,navigate,reveal,entry}
}
it('guards double entry through capture and create, retains before navigation, and permits a new explicit global entry only after mount ack',async()=>{
 const f=await entryFixture(),created=gate<{sessionId:import('@deepseek-ai/dsh-session/types').SessionId}>(),life=new AbortController()
 f.create.mockReturnValueOnce(created.promise)
 const first=f.entry.open(f.doc.id,undefined,life.signal),second=f.entry.open(f.doc.id,undefined,life.signal);expect(second).toBe(first)
 await vi.waitFor(()=>expect(f.create).toHaveBeenCalledOnce());expect(f.retain).toHaveBeenCalledOnce();expect(f.create.mock.calls[0]).toEqual([{sessionId:expect.any(String),workspaceId:f.request.workspaceId}])
 const canonical=brandString<import('@deepseek-ai/dsh-session/types').SessionId>('canonical');created.resolve({sessionId:canonical});await first
 expect(f.order.indexOf('retain')).toBeLessThan(f.order.indexOf('navigate'));expect(f.navigate).toHaveBeenCalledWith(canonical)
 const incoming=f.entry.snapshot()!;expect(incoming.sessionId).toBe(canonical);expect(f.storage.length).toBe(1)
 // A failed mount leaves this exact descriptor and canonical Session available to the right-pane retry.
 expect(f.entry.snapshot()).toBe(incoming);expect(f.create).toHaveBeenCalledOnce()
 await f.entry.ready({resumeId:f.doc.id,source:'conversation',sessionId:canonical},incoming.handoff);expect(f.storage.length).toBe(0)
 await f.entry.open(f.doc.id,canonical,life.signal);expect(f.reveal).toHaveBeenCalledWith(canonical,life.signal);expect(f.create).toHaveBeenCalledOnce()
 await f.entry.open(f.doc.id,undefined,life.signal);expect(f.create).toHaveBeenCalledTimes(2)
})
it.each(['save','journal','retain','bind'] as const)('keeps safe source recovery on %s failure',async fault=>{
 const f=await entryFixture()
 if(fault==='save')vi.mocked(f.call).mockImplementation(async(method)=>{if(method==='editorCapture')throw Error('save failed');return true})
 if(fault==='journal')vi.mocked(f.calls.begin).mockRejectedValueOnce(Error('journal failed'))
 if(fault==='retain')f.retain.mockImplementationOnce(()=>{throw Error('storage failed')})
 if(fault==='bind')f.bind.mockRejectedValueOnce(Error('bind failed'))
 await expect(f.entry.open(f.doc.id,undefined,new AbortController().signal)).rejects.toThrow()
 expect(f.navigate).not.toHaveBeenCalled();expect(f.call).toHaveBeenCalledWith('editorResume',expect.any(Array))
 expect(f.create).toHaveBeenCalledTimes(fault==='save'||fault==='journal'||fault==='retain'?0:1)
 if(fault==='bind'){await f.entry.open(f.doc.id,undefined,new AbortController().signal);expect(f.create).toHaveBeenCalledOnce()}
})
it('journals a canonical response arriving after source unmount and refuses binding/navigation',async()=>{
 const f=await entryFixture(),created=gate<{sessionId:import('@deepseek-ai/dsh-session/types').SessionId}>(),life=new AbortController();f.create.mockReturnValueOnce(created.promise)
 const pending=f.entry.open(f.doc.id,undefined,life.signal);await vi.waitFor(()=>expect(f.create).toHaveBeenCalledOnce());life.abort()
 const canonical=brandString<import('@deepseek-ai/dsh-session/types').SessionId>('late-canonical');created.resolve({sessionId:canonical})
 await expect(pending).rejects.toThrow();expect(f.calls.record).toHaveBeenCalledWith(expect.objectContaining({sessionId:canonical}));expect(f.bind).not.toHaveBeenCalled();expect(f.navigate).not.toHaveBeenCalled()
})
it('reconciles only an exact catalog identity after a lost create response',async()=>{
 const f=await entryFixture();f.create.mockRejectedValueOnce(Error('lost response'))
 await expect(f.entry.open(f.doc.id,undefined,new AbortController().signal)).rejects.toMatchObject({code:'outcome-unknown'})
 vi.mocked(f.calls.lookup).mockResolvedValueOnce(true)
 await f.entry.open(f.doc.id,undefined,new AbortController().signal);expect(f.create).toHaveBeenCalledOnce();expect(f.navigate).toHaveBeenCalledOnce()
})

it('retires a recovered entry after reload using its canonical Session and keeps a later pointer during async lookup',async()=>{
 const f=await entryFixture(),life=new AbortController();await f.entry.open(f.doc.id,undefined,life.signal)
 const incoming=f.entry.snapshot()!,key=`fast-resume:assistant-entry:v1:${f.doc.id}`,old=f.storage.getItem(key)!
 const read=gate<import('../../src/types.ts').AssistantHandoffRecord|null>(),calls={...f.calls,read:vi.fn(()=>read.promise)}
 const reloaded=new AssistantEntry(new SessionHandoff(calls),()=>({source:()=>undefined,retain:()=>()=>{}}),f.storage,()=>{},async()=>{})
 const ready=reloaded.ready({resumeId:f.doc.id,sessionId:incoming.sessionId,source:'conversation'},incoming.handoff)
 f.storage.setItem(key,crypto.randomUUID());const later=f.storage.getItem(key)
 read.resolve(await f.contexts.readAssistantHandoff({requestId:brandString<AssistantHandoffId>(old)}));await ready;expect(f.storage.getItem(key)).toBe(later)
 f.storage.setItem(key,old);await reloaded.ready({resumeId:f.doc.id,sessionId:incoming.sessionId,source:'conversation'},incoming.handoff);expect(f.storage.getItem(key)).toBeNull()
})
it('leaves a lost differing canonical identity unknown after reload instead of selecting a catalog neighbor',async()=>{
 const f=await entryFixture(),canonical=brandString<import('@deepseek-ai/dsh-session/types').SessionId>('server-canonical'),catalog=[canonical]
 f.create.mockImplementationOnce(async()=>{throw Error('response lost after creating server-canonical')})
 vi.mocked(f.calls.lookup).mockImplementation(async id=>catalog.includes(id))
 await expect(f.entry.open(f.doc.id,undefined,new AbortController().signal)).rejects.toMatchObject({code:'outcome-unknown'})
 const requestId=brandString<AssistantHandoffId>(f.storage.getItem(`fast-resume:assistant-entry:v1:${f.doc.id}`)!),record=await f.contexts.readAssistantHandoff({requestId})
 expect(record?.requestedSessionId).not.toBe(canonical);expect(record?.sessionId).toBeUndefined()
 await expect(new SessionHandoff(f.calls).startResumeConversation({...f.request,requestId,checkpointId:brandString<EditorCheckpointId>(crypto.randomUUID())},undefined,new AbortController().signal)).rejects.toMatchObject({code:'outcome-unknown'})
 expect(f.create).toHaveBeenCalledOnce();expect(f.bind).not.toHaveBeenCalled();expect(f.calls.lookup).toHaveBeenCalledWith(record!.requestedSessionId)
})
it('retries canonical-response journaling with the known ID and refuses unavailable tab storage before capture',async()=>{
 const f=await entryFixture();vi.mocked(f.calls.record).mockRejectedValueOnce(Error('record write failed'))
 await expect(f.entry.open(f.doc.id,undefined,new AbortController().signal)).rejects.toThrow('record write failed')
 await f.entry.open(f.doc.id,undefined,new AbortController().signal);expect(f.create).toHaveBeenCalledOnce();expect(f.calls.record).toHaveBeenCalledTimes(2)
 const blocked=await entryFixture();vi.spyOn(blocked.storage,'setItem').mockImplementation(()=>{throw Error('storage denied')})
 await expect(blocked.entry.open(blocked.doc.id,undefined,new AbortController().signal)).rejects.toThrow('storage denied');expect(blocked.call).not.toHaveBeenCalled();expect(blocked.create).not.toHaveBeenCalled()
})

it('records the Workspace before create and preserves it through bind and mount retry',async()=>{
 const f=await entryFixture(),original=f.request.workspaceId
 f.bind.mockRejectedValueOnce(Error('Bind unavailable'))
 await expect(f.entry.open(f.doc.id,undefined,new AbortController().signal)).rejects.toThrow('Bind unavailable')
 const requestId=brandString<AssistantHandoffId>(f.storage.getItem(`fast-resume:assistant-entry:v1:${f.doc.id}`)!),record=await f.contexts.readAssistantHandoff({requestId})
 expect(record?.workspaceId).toBe(original);expect(f.create).toHaveBeenCalledExactlyOnceWith({sessionId:record!.requestedSessionId,workspaceId:original})
 vi.mocked(f.calls.workspace).mockResolvedValue(brandString<import('../../src/types.ts').AssistantWorkspaceId>('other-workspace'))
 await f.entry.open(f.doc.id,undefined,new AbortController().signal);expect(f.create).toHaveBeenCalledOnce();expect(f.calls.workspace).toHaveBeenCalledOnce()
 expect(f.entry.snapshot()?.sessionId).toBe(record!.sessionId)
 await expect(f.contexts.beginAssistantHandoff({...f.request,requestId,workspaceId:brandString<import('../../src/types.ts').AssistantWorkspaceId>('other')})).rejects.toThrow('Workspace')
})
it('preserves an old ungrouped canonical and source history without creating or inventing a Workspace attachment',async()=>{
 const f=await entryFixture(),admission=await f.contexts.beginAssistantHandoff(f.request),canonical=brandString<import('@deepseek-ai/dsh-session/types').SessionId>('old-canonical')
 const record=await f.contexts.recordAssistantSession({requestId:f.request.requestId,sessionId:canonical}),{workspaceId,...old}=record
 const path=join(f.docs.config.storageDir,'handoffs-v1',`${f.request.requestId}.json`);await writeFile(path,JSON.stringify(old)+'\n')
 f.storage.setItem(`fast-resume:assistant-entry:v1:${f.doc.id}`,f.request.requestId)
 await expect(f.entry.open(f.doc.id,undefined,new AbortController().signal)).rejects.toThrow('cannot attach or replace')
 expect(f.create).not.toHaveBeenCalled();expect(f.calls.workspace).not.toHaveBeenCalled();expect(f.navigate).not.toHaveBeenCalled()
 expect(f.call).toHaveBeenCalledWith('editorResume',expect.any(Array));expect(await f.contexts.readAssistantHandoff({requestId:f.request.requestId})).toEqual(old)
 expect(admission.handoff.requestedSessionId).toBe(old.requestedSessionId)
})

it('retries a failed live Session mount preparation with its recorded Workspace and canonical identity',async()=>{
 const f=await entryFixture(),release=vi.fn(),prepare=vi.fn(async()=>release).mockRejectedValueOnce(Error('Session mount unavailable'))
 const entry=new AssistantEntry(new SessionHandoff(f.calls),()=>({source:()=>f.source,retain:f.retain}),f.storage,f.navigate,f.reveal,prepare)
 await expect(entry.open(f.doc.id,undefined,new AbortController().signal)).rejects.toThrow('Session mount unavailable')
 const record=await f.contexts.readAssistantHandoff({requestId:brandString<AssistantHandoffId>(f.storage.getItem(`fast-resume:assistant-entry:v1:${f.doc.id}`)!)})
 expect(f.navigate).not.toHaveBeenCalled();expect(f.call).toHaveBeenCalledWith('editorResume',expect.any(Array))
 await entry.open(f.doc.id,undefined,new AbortController().signal)
 expect(f.create).toHaveBeenCalledOnce();expect(prepare).toHaveBeenLastCalledWith(record!.sessionId,record!.workspaceId,expect.any(AbortSignal));expect(f.navigate).toHaveBeenCalledExactlyOnceWith(record!.sessionId);expect(release).toHaveBeenCalledOnce()
})

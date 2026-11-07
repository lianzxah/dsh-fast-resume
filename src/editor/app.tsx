/** Original multilayer editor with profile-backed management, recovery and Harness assistance. */
import {applyConversationPlacement} from './placement.ts'
import {editorHandoff} from './handoff.ts'
import type {ViewportHandle} from '../../upstream/editor/src/lib/viewport-handoff.ts'
import React,{useEffect,useRef,useState,useCallback,useId,useSyncExternalStore} from 'react'
import {Trash2,FileText,AlertTriangle,LoaderCircle,ArrowLeft,Check} from 'lucide-react'
import { MemoryRouter,Routes,Route,useNavigate,useParams } from 'react-router-dom'
import { DndProvider } from 'react-dnd'
import { HTML5Backend } from 'react-dnd-html5-backend'
import { MenuBar } from '../../upstream/editor/src/components/layout/MenuBar.tsx'
import { StatusBar } from '../../upstream/editor/src/components/layout/StatusBar.tsx'
import { useEditorStore } from '../../upstream/editor/src/store/editor-store.ts'
import { registerManualSave,registerOpenVersions } from '../../upstream/editor/src/lib/save-bus.ts'
import { parseResumeBackup } from '@resume-editor/shared'
import type { ResumeSnapshot,ResumeSummary,ResumeRevision } from '../types.ts'
import type { Recovery } from '../protocol.ts'
import {installCommittedRevision} from './editor-checkpoint.ts'
import { SaveCoordinator,type DraftState } from './persistence.ts'
import { downloadReceipt,type EditorApi } from './api.ts'
import { en,zh,type Copy } from './locales.ts'
import {resumeIdSchema} from '../identity.ts'
import {Library} from './library.tsx'
import {Modal} from './modal.tsx'
import {Versions} from './versions.tsx'
import {WorkspacePanels} from './workspace-panels.tsx'
import {CreateResumeDialog,ImportResumeDialog} from './document-dialogs.tsx'

function ErrorNotice({error,close}:{error:string;close:()=>void}){return error?<div className="fr-notice" role="alert"><span>{error}</span><button onClick={close} aria-label="×">×</button></div>:null}
function Home({api,copy}:{api:EditorApi;copy:Copy}){
 const deleteDescriptionId=useId()
 const navigate=useNavigate(),[list,setList]=useState<ResumeSummary[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[busy,setBusy]=useState(false),[dialog,setDialog]=useState<'create'|'rename'|'delete'|'import'|null>(null),[target,setTarget]=useState<ResumeSummary|null>(null),[title,setTitle]=useState('')
 const load=useCallback(async()=>{setLoading(true);try{setList(await api.list())}finally{setLoading(false)}},[api]);useEffect(()=>{void load().catch(e=>setError(e.message))},[load])
 const open=(s:ResumeSnapshot)=>navigate(`/resume/${encodeURIComponent(s.id)}`)
 const run=(fn:()=>Promise<void>)=>{setBusy(true);setError('');void fn().catch(e=>setError(e instanceof Error?e.message:copy.error)).finally(()=>setBusy(false))}
 return <Library api={api} copy={copy} documents={list} loading={loading} busy={busy} notice={<>{dialog?null:<ErrorNotice error={error} close={()=>setError('')}/>} {!api.config.recoveryOwnerPersistent&&<p className="fr-notice" role="alert">{copy.recoveryOwnerWarning}</p>}</>} create={()=>{setDialog('create')}} importDocument={()=>setDialog('import')} refresh={()=>run(load)} conversation={()=>run(async()=>{await api.conversation()})} open={s=>open({...s,documentJson:''})} rename={s=>{setTarget(s);setTitle(s.title);setDialog('rename')}} duplicate={s=>run(async()=>open(await api.duplicate(s.id)))} remove={s=>{setTarget(s);setDialog('delete')}}>
 {dialog==='create'&&<CreateResumeDialog api={api} copy={copy} close={()=>setDialog(null)} onOpen={open}/>}
 {dialog==='rename'&&<Modal title={copy.rename} close={()=>setDialog(null)}><ErrorNotice error={error} close={()=>setError('')}/><form onSubmit={e=>{e.preventDefault();run(async()=>{if(target){await api.rename(target.id,target.revision,title);await load()}setDialog(null)})}}><label>{copy.name}<input autoFocus value={title} required maxLength={512} onChange={e=>setTitle(e.target.value)}/></label><button disabled={busy||!title.trim()}>{copy.rename}</button></form></Modal>}
 {dialog==='delete'&&target&&<Modal title={copy.deleteTitle} className="fr-delete-modal" descriptionId={deleteDescriptionId} titleIcon={<span className="fr-delete-emblem"><Trash2 size={23} aria-hidden="true"/></span>} closeLabel={copy.close} dismissible={!busy} close={()=>setDialog(null)}>
  <p id={deleteDescriptionId} className="fr-delete-description">{copy.confirmDelete}</p>
  <div className="fr-delete-document"><span className="fr-delete-file"><FileText size={22} aria-hidden="true"/></span><div><span className="fr-delete-caption">{copy.deleteDocument}</span><strong>{target.title}</strong><p>{target.pageCount} {copy.pages}<span aria-hidden="true">·</span>{copy.revision} {target.revision}</p></div></div>
  <div className="fr-delete-advice"><AlertTriangle size={15} aria-hidden="true"/><p>{copy.deleteBackupHint}</p></div>
  <ErrorNotice error={error} close={()=>setError('')}/>
  <footer className="fr-delete-actions"><button data-modal-initial-focus disabled={busy} onClick={()=>setDialog(null)}>{copy.cancel}</button><button className="fr-delete-confirm" disabled={busy} aria-busy={busy} onClick={()=>run(async()=>{await api.deleteResume(target.id,target.revision);await load();setDialog(null)})}>{busy?<LoaderCircle size={16} className="fr-delete-spinner" aria-hidden="true"/>:<Trash2 size={16} aria-hidden="true"/>}{busy?copy.deleting:copy.deleteConfirm}</button></footer>
 </Modal>}
 {dialog==='import'&&<ImportResumeDialog api={api} copy={copy} close={()=>setDialog(null)} onOpen={open}/>}</Library>
}
function Editor({api,copy}:{api:EditorApi;copy:Copy}){
 const {id:routeId=''}=useParams(),id=resumeIdSchema.parse(routeId),navigate=useNavigate(),coordinator=useRef<SaveCoordinator|null>(null),recovered=useRef<Recovery|null>(null),[state,setState]=useState<DraftState|null>(null),[error,setError]=useState(''),[backups,setBackups]=useState<Recovery[]>([]),[backupError,setBackupError]=useState(false),[versions,setVersions]=useState(false),[importOpen,setImportOpen]=useState(false),[busy,setBusy]=useState(false),[exportInfo,setExportInfo]=useState(''),[loadAttempt,setLoadAttempt]=useState(0)
 const [loadFailure,setLoadFailure]=useState<'ownership'|'missing'|'read'>()
 const assistantPending=useRef(false),[assistantError,setAssistantError]=useState(false)
 const association=useSyncExternalStore(api.subscribeAssociation,api.association)
 const assistantState=useSyncExternalStore(api.subscribeAssistant,api.assistantState)
 const onAssistant=useCallback(()=>{if(assistantPending.current)return;assistantPending.current=true;setAssistantError(false);setError('');void api.assistant(id).catch(error=>{setAssistantError(true);setError(error instanceof Error?error.message:copy.error)}).finally(()=>{assistantPending.current=false})},[api,id,copy])
 const visible=useSyncExternalStore(api.subscribeVisibility,api.visible)
 const recoveryAcquisition=useRef(false),reconciling=useRef(false),pollingWork=useRef(Promise.resolve()),ownershipGeneration=useRef(0)
 // Drain earlier poll failures before explicit acknowledgement clears ownership uncertainty.
 const reconcileOwnership=useCallback(async(revision:ResumeRevision)=>{const generation=ownershipGeneration.current;reconciling.current=true;try{await pollingWork.current;if(generation!==ownershipGeneration.current)throw Error(copy.error);await api.reconcile(id,revision)}finally{reconciling.current=false}},[api,id,copy])
 const viewport=useRef<ViewportHandle|null>(null),onViewport=useCallback((handle:ViewportHandle|null)=>{viewport.current=handle},[]),handoffFenced=useRef(api.pendingHandoff(id))
 const activeGesture=useRef({pointer:false,composing:false}),[incomingPending,setIncomingPending]=useState(false)
 const [ownershipState,setOwnershipState]=useState<'trusted'|'uncertain'|'unknown'>('trusted'),[preparing,setPreparing]=useState(false),fenced=useRef(api.pendingHandoff(id)),recoveryBlocked=useRef(false),ownershipStatus=useRef(ownershipState)
 const uncertain=ownershipState!=='trusted'
 const setOwnership=useCallback((value:typeof ownershipState)=>{ownershipStatus.current=value;setOwnershipState(value)},[])
 const backup=backups[0]??null
 recoveryBlocked.current=!!backup||backupError||!!state?.recoveryError||!!recovered.current
 const ui=useEditorStore(s=>s.ui),selectedIds=useEditorStore(s=>s.selection.selectedIds)
 const run=useCallback((work:()=>Promise<void>)=>{setError('');setBusy(true);void work().catch(e=>setError(e instanceof Error?e.message:copy.error)).finally(()=>setBusy(false))},[copy])
 const install=useCallback((snapshot:ResumeSnapshot)=>{coordinator.current?.dispose();useEditorStore.getState().setDocument(parseResumeBackup(snapshot.documentJson).document);useEditorStore.getState().setResumeId(snapshot.id)
  let instance:SaveCoordinator;instance=new SaveCoordinator(snapshot,api.save,()=>{const next={...instance.state};setState(next);useEditorStore.getState().setSaveState({isSaving:next.saving,saveError:next.error?.message??null,lastSavedAt:next.dirty?null:next.snapshot.updatedAt});if(!next.dirty)useEditorStore.getState().markClean()},async(saved,submittedJson)=>{try{await api.clearBackup(saved.id,saved.revision,submittedJson);const adopted=recovered.current;if(adopted){await api.clearBackup(saved.id,saved.revision,adopted.documentJson,adopted);if(recovered.current===adopted)recovered.current=null}}catch(error){if(coordinator.current===instance){recoveryBlocked.current=true;setBackupError(true)}}});coordinator.current=instance;setState({...instance.state})
 },[api])
 const refresh=useCallback(async()=>{
  const c=coordinator.current;if(handoffFenced.current||!c||c.state.snapshot.id!==id)return
  const fresh=await api.read(id)
  if(!api.visible()||handoffFenced.current||coordinator.current!==c||fresh.revision<=c.state.snapshot.revision)return
  if(c.state.dirty||c.state.saving){setIncomingPending(false);c.receive(fresh);return}
  const receipt=await api.changeReceipt(id,fresh.revision)
  if(!api.visible()||handoffFenced.current||coordinator.current!==c)return
  const focused=document.activeElement
  if(activeGesture.current.pointer||activeGesture.current.composing||focused instanceof HTMLElement&&(focused.isContentEditable||focused.matches('input,textarea,[contenteditable="true"]'))){setIncomingPending(true);return}
  setIncomingPending(false)
  c.receive(fresh,()=>{
   if(!receipt||fresh.revision!==c.state.snapshot.revision+1)throw Object.assign(Error(copy.revisionGap),{code:'history-gap'})
   installCommittedRevision(fresh,{baseRevision:c.state.snapshot.revision,batchId:receipt.requestId},c.state.snapshot)
  })
 },[api,id,copy])
 const save=useCallback(async(name?:string)=>{const c=coordinator.current;if(!c)return;if(fenced.current)throw Error(copy.preparingEdit);if(backup)throw Error(copy.recovery);await c.flush(name)},[backup,copy])
 useEffect(()=>{
  setState(null);setBackups([]);setError('');setLoadFailure(undefined);setBackupError(false);setIncomingPending(false)
  ownershipGeneration.current++
  let active=true,timer:ReturnType<typeof setTimeout>|undefined,loadStage:'read'|'register'|'install'='read'
  void Promise.all([api.read(id),api.recovery(id).catch(()=>{if(active)setBackupError(true);return []})]).then(async([snapshot,recovery])=>{if(!active)return;const pending=recovery.filter(record=>record.documentJson!==snapshot.documentJson);loadStage='register';const ownership=api.pendingHandoff(id)?{uncertain:false}:await api.register(id,pending.length>0,recoveryAcquisition.current?'recover':'available');if(!active){await api.disconnect(id,true);return}loadStage='install';install(snapshot);setBackups(pending);setOwnership(ownership.uncertain?'uncertain':'trusted')}).catch((error:unknown)=>{if(!active)return;const code=typeof error==='object'&&error!==null&&'code'in error?error.code:undefined;setLoadFailure(code==='not-found'?'missing':loadStage==='register'&&code==='editor-unavailable'?'ownership':'read')})
  const unsubscribe=useEditorStore.subscribe((next,previous)=>{
   const c=coordinator.current;if(!active||!c||c.state.snapshot.id!==id||next.document===previous.document||!next.isDirty)return
   const json=JSON.stringify(next.document);c.edit(json)
   const writing=api.backup({id,revision:c.state.snapshot.revision,documentJson:json,updatedAt:Date.now()});c.trackBackup(writing)
   if(fenced.current)void api.disconnect(id).catch(error=>{/* Persisted ownership remains uncertain until explicit reconciliation. */})
   clearTimeout(timer);timer=setTimeout(()=>{if(!active||recoveryBlocked.current||fenced.current)return;void c.flush().catch(error=>{if(active&&!c.state.error)setError(error instanceof Error?error.message:copy.error)})},api.config.autosaveDelayMs)
  })
  const poll=setInterval(()=>{if(!active||!api.visible()||!coordinator.current||coordinator.current.state.saving)return;void refresh().catch(e=>{if(active)setError(e.message)})},api.config.refreshIntervalMs)
  let polling=false,prepared:string|undefined
  const blockGesture=(event:Event)=>{if(fenced.current){event.preventDefault();event.stopImmediatePropagation();return}if(['pointerdown','mousedown','touchstart'].includes(event.type))activeGesture.current.pointer=true;if(['pointerup','pointercancel','mouseup','touchend','touchcancel'].includes(event.type))activeGesture.current.pointer=false;if(event.type==='compositionstart')activeGesture.current.composing=true;if(event.type==='compositionend')activeGesture.current.composing=false}
  const gestures=['click','pointerdown','pointermove','pointerup','pointercancel','mousedown','mousemove','mouseup','touchstart','touchmove','touchend','touchcancel','keydown','keyup','beforeinput','input','compositionstart','compositionend','drop','paste','cut','wheel']
  for(const type of gestures)window.addEventListener(type,blockGesture,{capture:true,passive:false})
  // After a heartbeat failure, loaded reporting needs a confirmed Host fence; unknown disconnects retry before preparing writes.
  const disconnectOwnership=async()=>{setOwnership('unknown');try{await api.disconnect(id)}catch(error){/* Keep the unknown outcome visible and retry on the next heartbeat. */return}if(active&&!handoffFenced.current)setOwnership('uncertain')}
  // Hidden and confirmed-uncertain editors still renew their ownership lease.
  const preparationPoll=setInterval(()=>{if(!active||handoffFenced.current||reconciling.current||polling||!coordinator.current)return;polling=true;pollingWork.current=(async()=>{
   if(ownershipStatus.current==='unknown'){await disconnectOwnership();return}
   const job=await api.poll(id)
   if(!active||!api.visible()||handoffFenced.current||ownershipStatus.current!=='trusted')return
   if(!job){if(prepared){await refresh();prepared=undefined}fenced.current=false;setPreparing(false);return}
   if(prepared===job.id)return
   const c=coordinator.current;if(!c)return
   prepared=job.id
   if(activeGesture.current.pointer||activeGesture.current.composing){await api.acknowledge(id,job.id,c.state.snapshot.revision,false);setOwnership('uncertain');return}
   // Canvas text overlays commit on blur; complete that synchronous edit before capturing the draft generation.
   const focused=document.activeElement;if(focused instanceof HTMLElement)focused.blur()
   fenced.current=true;setPreparing(true)
   try{if(recoveryBlocked.current)throw Error(copy.recovery);const clean=await c.prepare();if(!active||recoveryBlocked.current)throw Error(copy.error);await api.acknowledge(id,job.id,clean.revision,true)}catch(error){await api.acknowledge(id,job.id,c.state.snapshot.revision,false);setOwnership('uncertain')}
  })().catch(async()=>{if(active&&!handoffFenced.current){setPreparing(false);fenced.current=false;if(ownershipStatus.current!=='uncertain')await disconnectOwnership()}}).finally(()=>{polling=false})},api.config.editorPollIntervalMs)
  const leave=(e:BeforeUnloadEvent)=>{if(coordinator.current?.state.dirty){e.preventDefault();e.returnValue=''}};window.addEventListener('beforeunload',leave)
  return()=>{active=false;ownershipGeneration.current++;fenced.current=false;activeGesture.current={pointer:false,composing:false};clearInterval(preparationPoll);for(const type of gestures)window.removeEventListener(type,blockGesture,true);void api.disconnect(id,true).catch(error=>{/* Persisted ownership remains uncertain until explicit reconciliation. */});clearTimeout(timer);clearInterval(poll);unsubscribe();coordinator.current?.dispose();coordinator.current=null;window.removeEventListener('beforeunload',leave)}
 },[api,id,install,refresh,loadAttempt,setOwnership])
 useEffect(()=>{
  if(!state)return
  const lifetime=new AbortController()
  const fence=(value:boolean)=>{handoffFenced.current=value;fenced.current=value;setPreparing(value)}
  const remove=api.onHandoff(editorHandoff({api,coordinator:()=>coordinator.current,viewport:()=>viewport.current,signal:lifetime.signal,blocked:()=>recoveryBlocked.current,begin:()=>{
   if(fenced.current||activeGesture.current.pointer||activeGesture.current.composing)throw Error(copy.preparingEdit)
   const focused=document.activeElement;if(focused instanceof HTMLElement)focused.blur()
   fence(true)
  },fence}))
  return()=>{lifetime.abort();remove()}
 },[api,id,state?.snapshot.id,copy])
 useEffect(()=>{
  if(!state)return
  const lifetime=new AbortController(),revision=state.snapshot.revision
  let frame=0
  const report=(value:typeof revision|undefined)=>{void api.installed(id,value,lifetime.signal).catch(error=>{if(!lifetime.signal.aborted)setError(error instanceof Error?error.message:copy.error)})}
  if(ownershipState==='unknown'||!visible||api.pendingHandoff(id)||handoffFenced.current||state.dirty||state.saving||state.error||backup||backupError||preparing)report(undefined)
  else frame=requestAnimationFrame(()=>{frame=requestAnimationFrame(()=>{const current=coordinator.current?.state;if(viewport.current&&ownershipStatus.current!=='unknown'&&!handoffFenced.current&&current&&!current.dirty&&!current.saving&&current.snapshot.revision===revision&&!lifetime.signal.aborted)report(revision)})})
  return()=>{lifetime.abort();cancelAnimationFrame(frame)}
 },[api,id,visible,ownershipState,state?.snapshot.revision,state?.dirty,state?.saving,state?.error,backup,backupError,preparing,copy])
 useEffect(()=>{registerManualSave(()=>{run(()=>save())});registerOpenVersions(()=>setVersions(true));return()=>{registerManualSave(null);registerOpenVersions(null)}},[save,run])
 const openDocument=async(target?:import('../types.ts').ResumeId,editing?:ResumeSnapshot)=>{if(api.config.launch?.source==='conversation'){if(editing)await api.selectTarget(editing.id,editing.revision);await api.navigate(target)}else navigate(target?`/resume/${target}`:'/')}
 const copyDraft=()=>run(async()=>{const c=coordinator.current;if(!c)return;const json=backup?.documentJson??c.state.draft;const saved=await api.create({title:`${c.state.snapshot.title} (${copy.copy})`,documentJson:json});if(backup)await api.clearBackup(id,backup.revision,backup.documentJson,backup);await openDocument(saved.id,saved)})
 const reload=()=>run(async()=>{const c=coordinator.current;if(c)await api.clearBackup(id,c.state.snapshot.revision,c.state.draft);const snapshot=await api.read(id);install(snapshot);setBackups([])})
 const exportDocument=(format:'json'|'pdf'|'png')=>run(async()=>{await save();const c=coordinator.current;if(!c||c.state.error)throw Error(copy.exportHint);const page=useEditorStore.getState().document.pages[useEditorStore.getState().activePageIndex];const receipt=await api.export({id,expectedRevision:c.state.snapshot.revision,format,pageId:format==='png'?page?.id:undefined});downloadReceipt(receipt);setExportInfo(`${copy.exported}: ${receipt.filename} · ${receipt.byteSize} B · ${receipt.width} × ${receipt.height} ${receipt.dimensionUnit}`)})
 useEffect(()=>{document.documentElement.dataset.editorVisible=String(visible)},[visible])
 if(!state)return <div className="fr-home fr-blocked">{loadFailure?<><h2>{copy[loadFailure==='ownership'?'editorBlocked':loadFailure==='missing'?'resumeMissingTitle':'resumeReadFailedTitle']}</h2><p role="alert">{copy[loadFailure==='ownership'?'activeEditor':loadFailure==='missing'?'resumeMissing':'resumeReadFailed']}</p></>:<p role="status">{copy.loading}</p>}{loadFailure&&<button onClick={()=>setLoadAttempt(n=>n+1)}>{copy.retry}</button>}{loadFailure==='ownership'&&<button onClick={()=>run(async()=>{if(api.config.launch?.source!=='conversation'&&await api.recoverView(id))return;recoveryAcquisition.current=true;setLoadAttempt(n=>n+1)})}>{copy.recoverEditor}</button>}<button onClick={()=>run(()=>openDocument())}>{copy.back}</button></div>
 if(backup)return <main className="fr-home"><h1>{copy.title}</h1>{!api.config.recoveryOwnerPersistent&&<p className="fr-notice" role="alert">{copy.recoveryOwnerWarning}</p>}<div role="alert"><p>{copy.recovery}</p><p>{copy.recoveryDrafts}: {backups.length} · {new Date(backup.updatedAt).toLocaleString()}</p><div className="fr-row"><button onClick={()=>{const doc=parseResumeBackup(backup.documentJson).document;recovered.current=backup;setBackups([]);useEditorStore.getState().restoreDocument(doc)}}>{copy.recover}</button><button onClick={()=>run(async()=>{await api.clearBackup(id,backup.revision,backup.documentJson,backup);setBackups(items=>items.slice(1))})}>{copy.discard}</button><button onClick={copyDraft}>{copy.copy}</button></div>{uncertain&&<div className="fr-notice"><span>{copy.ownerUncertain} {copy.revision} {state.snapshot.revision}</span><button disabled={busy} onClick={()=>run(async()=>{const committed=state.snapshot;try{await reconcileOwnership(committed.revision)}catch(error){install(await api.read(id));throw Error(copy.conflict)}install(committed);setBackups([]);setOwnership('trusted')})}>{copy.acknowledgeOwner}</button></div>}</div><ErrorNotice error={error} close={()=>setError('')}/></main>
 return <DndProvider backend={HTML5Backend}><div className={`fr-editor${api.config.launch?.source==='conversation'?' fr-conversation':''}`}><div className="fr-adapter-bar"><button aria-label={copy.back} title={copy.back} className="fr-space-back" onClick={()=>run(()=>openDocument())}><ArrowLeft size={16} aria-hidden="true"/>{copy.back}</button><div className="fr-editor-document-title" title={state.snapshot.title}>{state.snapshot.title}</div><span className="fr-editor-save-state" role="status">{state.saving?<LoaderCircle size={13} className="fr-history-spinner" aria-hidden="true"/>:state.dirty?<span className="fr-editor-dirty-dot" aria-hidden="true"/>:<Check size={13} aria-hidden="true"/>}<span>{copy.revision} {state.snapshot.revision}<span aria-hidden="true"> · </span>{state.saving?copy.saving:state.dirty?copy.unsaved:copy.saved}</span></span></div>
 <ErrorNotice error={error} close={()=>setError('')}/>{!api.config.recoveryOwnerPersistent&&<p className="fr-notice" role="alert">{copy.recoveryOwnerWarning}</p>}{(backupError||state.recoveryError)&&<p className="fr-notice" role="alert">{copy.recoveryFailure}</p>}{exportInfo&&<div className="fr-notice" role="status">{exportInfo}<button onClick={()=>setExportInfo('')}>×</button></div>}
 {state.error&&<div className="fr-notice" role="alert"><span>{state.error.code==='conflict'?copy.conflict:state.error.message}</span><button onClick={reload}>{copy.reload}</button><button onClick={copyDraft}>{copy.copy}</button>{state.error.code!=='conflict'&&state.error.code!=='history-gap'&&<button onClick={()=>{coordinator.current?.retry();run(()=>save())}}>{copy.retry}</button>}</div>}

 {incomingPending&&<p className="fr-notice" role="status">{copy.incomingPending}</p>}
 {preparing&&<p className="fr-notice fr-floating-status" role="status">{copy.preparingEdit}</p>}
 {uncertain&&<div className="fr-notice" role="alert"><span>{copy.ownerUncertain} {copy.revision} {state.snapshot.revision}</span><button disabled={busy||preparing||state.dirty||state.saving||!!state.error} onClick={()=>run(async()=>{const c=coordinator.current;if(!c) return;try{await reconcileOwnership(c.state.snapshot.revision)}catch(error){await refresh();throw Error(copy.conflict)}setOwnership('trusted')})}>{copy.acknowledgeOwner}</button></div>}
 {!preparing&&(!association||association==='bound')&&(assistantError||assistantState&&assistantState!=='ready')&&<div className="fr-notice fr-floating-status" role="status"><span>{copy[assistantState==='outcome-unknown'?'assistantUnknown':assistantState==='failed'||assistantError?'assistantFailed':assistantState==='creating'?'assistantCreating':assistantState==='binding'?'assistantBinding':assistantState==='mounting'?'assistantMounting':assistantState==='ready'?'assistantReady':'assistantSaving']}</span>{assistantError&&<button onClick={onAssistant}>{copy.retry}</button>}</div>}
 {!preparing&&association&&association!=='bound'&&<p className="fr-notice fr-floating-status" role="status">{copy.associationNotice}</p>}
 <MenuBar onAssistant={onAssistant} assistantLabel={copy.assistant} onHome={()=>run(()=>openDocument())} onExport={exportDocument} onImport={()=>setImportOpen(true)} labels={{save:copy.save,versions:copy.versions,showLeft:copy.showLeft,showRight:copy.showRight}}/>
 <WorkspacePanels onViewport={onViewport} wheelZoomDirection={api.config.wheelZoomDirection} leftLabel={copy.showLeft} rightLabel={copy.showRight}/><StatusBar onAssistant={onAssistant} assistantLabel={copy.assistant}/></div>
 {versions&&<Versions api={api} state={state} copy={copy} close={()=>setVersions(false)} save={save} current={()=>coordinator.current?.state??state} blocked={!!backup||!!recovered.current} refresh={refresh}/>}{importOpen&&<ImportResumeDialog api={api} copy={copy} close={()=>setImportOpen(false)} onOpen={saved=>{setImportOpen(false);run(()=>openDocument(saved.id,saved))}}/>}</DndProvider>
}
function EditorRoute({api,copy}:{api:EditorApi;copy:Copy}){const {id}=useParams();return <Editor key={id} api={api} copy={copy}/>}
/** Separate React root inside the opaque frame; account and independent model UIs are unreachable. */
export function App({api}:{api:EditorApi}){useState(()=>{if(api.config.launch?.source==='conversation')applyConversationPlacement()});const copy=api.config.locale==='zh'?zh:en;return <MemoryRouter initialEntries={api.config.launch?[`/resume/${api.config.launch.resumeId}`]:['/']}><Routes><Route path="/" element={<Home api={api} copy={copy}/>}/><Route path="/resume/:id" element={<EditorRoute api={api} copy={copy}/>}/></Routes></MemoryRouter>}

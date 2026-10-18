/** Original multilayer editor with profile-backed management, recovery and Harness assistance. */
import React,{useEffect,useRef,useState,useCallback,useId} from 'react'
import {Trash2,FileText,AlertTriangle,LoaderCircle,ArrowLeft,Check} from 'lucide-react'
import { MemoryRouter,Routes,Route,useNavigate,useParams } from 'react-router-dom'
import { DndProvider } from 'react-dnd'
import { HTML5Backend } from 'react-dnd-html5-backend'
import { Panel,PanelGroup,PanelResizeHandle } from 'react-resizable-panels'
import { MenuBar } from '../../upstream/editor/src/components/layout/MenuBar.tsx'
import { StatusBar } from '../../upstream/editor/src/components/layout/StatusBar.tsx'
import { useEditorStore } from '../../upstream/editor/src/store/editor-store.ts'
import { registerManualSave,registerOpenVersions } from '../../upstream/editor/src/lib/save-bus.ts'
import { parseResumeBackup } from '@resume-editor/shared'
import { templates } from '@resume-editor/templates'
import type { ResumeSnapshot,ResumeSummary } from '../types.ts'
import type { Recovery } from '../protocol.ts'
import { SaveCoordinator,type DraftState } from './persistence.ts'
import { downloadReceipt,encodeBytes,type EditorApi } from './api.ts'
import { Assistant } from './assistant.tsx'
import { en,zh,type Copy } from './locales.ts'
import {resumeIdSchema} from '../identity.ts'
import {Library} from './library.tsx'
import {Modal} from './modal.tsx'
import {Versions} from './versions.tsx'
import {WorkspacePanels} from './workspace-panels.tsx'

function ErrorNotice({error,close}:{error:string;close:()=>void}){return error?<div className="fr-notice" role="alert"><span>{error}</span><button onClick={close} aria-label="×">×</button></div>:null}
function Import({api,copy,onOpen,close}:{api:EditorApi;copy:Copy;onOpen:(s:ResumeSnapshot)=>void;close:()=>void}){
 const [markdown,setMarkdown]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');const active=useRef(true)
 useEffect(()=>()=>{active.current=false},[])
 const importBytes=async(filename:string,format:'json'|'markdown'|'docx'|'pdf',bytes:Uint8Array)=>{if(bytes.length>api.config.maxImportBytes){setError(copy.tooLarge);return}setBusy(true);setError('');try{const saved=await api.import({filename,format,dataBase64:encodeBytes(bytes)});if(active.current)onOpen(saved)}catch(e){if(active.current)setError(e instanceof Error?e.message:copy.error)}finally{if(active.current)setBusy(false)}}
 return <Modal title={copy.import} close={()=>{if(!busy)close()}}><p>{copy.importHint}</p><input aria-label={copy.selectFile} type="file" accept=".json,.md,.markdown,.docx,.pdf" disabled={busy} onChange={e=>{const file=e.target.files?.[0];if(!file)return;const ext=file.name.split('.').at(-1)?.toLowerCase();const format=ext==='md'||ext==='markdown'?'markdown':ext==='json'||ext==='docx'||ext==='pdf'?ext:null;if(!format){setError(copy.unsupported);return}if(file.size>api.config.maxImportBytes){setError(copy.tooLarge);return}void file.arrayBuffer().then(bytes=>importBytes(file.name,format,new Uint8Array(bytes))).catch(e=>setError(e.message))}}/><label>{copy.markdown}<textarea disabled={busy} value={markdown} onChange={e=>setMarkdown(e.target.value)}/></label><button disabled={busy||!markdown.trim()} onClick={()=>{void importBytes('resume.md','markdown',new TextEncoder().encode(markdown))}}>{busy?copy.pending:copy.importText}</button><ErrorNotice error={error} close={()=>setError('')}/></Modal>
}
function Home({api,copy}:{api:EditorApi;copy:Copy}){
 const deleteDescriptionId=useId()
 const navigate=useNavigate(),[list,setList]=useState<ResumeSummary[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[busy,setBusy]=useState(false),[dialog,setDialog]=useState<'create'|'rename'|'delete'|'import'|null>(null),[target,setTarget]=useState<ResumeSummary|null>(null),[title,setTitle]=useState(''),[template,setTemplate]=useState('')
 const load=useCallback(async()=>{setLoading(true);try{setList(await api.list())}finally{setLoading(false)}},[api]);useEffect(()=>{void load().catch(e=>setError(e.message))},[load])
 const open=(s:ResumeSnapshot)=>navigate(`/resume/${encodeURIComponent(s.id)}`)
 const run=(fn:()=>Promise<void>)=>{setBusy(true);setError('');void fn().catch(e=>setError(e instanceof Error?e.message:copy.error)).finally(()=>setBusy(false))}
 return <Library api={api} copy={copy} documents={list} loading={loading} busy={busy} notice={<>{dialog?null:<ErrorNotice error={error} close={()=>setError('')}/>} {!api.config.recoveryOwnerPersistent&&<p className="fr-notice" role="alert">{copy.recoveryOwnerWarning}</p>}</>} create={()=>{setTitle('');setTemplate('');setDialog('create')}} importDocument={()=>setDialog('import')} refresh={()=>run(load)} conversation={()=>run(async()=>{await api.conversation()})} open={s=>open({...s,documentJson:''})} rename={s=>{setTarget(s);setTitle(s.title);setDialog('rename')}} duplicate={s=>run(async()=>open(await api.duplicate(s.id)))} remove={s=>{setTarget(s);setDialog('delete')}}>
 {(dialog==='create'||dialog==='rename')&&<Modal title={dialog==='create'?copy.new:copy.rename} close={()=>setDialog(null)}><ErrorNotice error={error} close={()=>setError('')}/><form onSubmit={e=>{e.preventDefault();run(async()=>{if(dialog==='create')open(await api.create({title,templateId:template||undefined}));else if(target){await api.rename(target.id,target.revision,title);await load()}setDialog(null)})}}><label>{copy.name}<input autoFocus value={title} required maxLength={512} onChange={e=>setTitle(e.target.value)}/></label>{dialog==='create'&&<div className="fr-templates"><button type="button" className={template===''?'selected':''} onClick={()=>setTemplate('')}>{copy.blank}</button>{templates.map(t=><button type="button" className={template===t.id?'selected':''} onClick={()=>setTemplate(t.id)} key={t.id}><span style={{background:t.theme.primaryColor}}/>{t.name}</button>)}</div>}<button disabled={busy||!title.trim()}>{dialog==='create'?copy.create:copy.rename}</button></form></Modal>}
 {dialog==='delete'&&target&&<Modal title={copy.deleteTitle} className="fr-delete-modal" descriptionId={deleteDescriptionId} titleIcon={<span className="fr-delete-emblem"><Trash2 size={23} aria-hidden="true"/></span>} closeLabel={copy.close} dismissible={!busy} close={()=>setDialog(null)}>
  <p id={deleteDescriptionId} className="fr-delete-description">{copy.confirmDelete}</p>
  <div className="fr-delete-document"><span className="fr-delete-file"><FileText size={22} aria-hidden="true"/></span><div><span className="fr-delete-caption">{copy.deleteDocument}</span><strong>{target.title}</strong><p>{target.pageCount} {copy.pages}<span aria-hidden="true">·</span>{copy.revision} {target.revision}</p></div></div>
  <div className="fr-delete-advice"><AlertTriangle size={15} aria-hidden="true"/><p>{copy.deleteBackupHint}</p></div>
  <ErrorNotice error={error} close={()=>setError('')}/>
  <footer className="fr-delete-actions"><button data-modal-initial-focus disabled={busy} onClick={()=>setDialog(null)}>{copy.cancel}</button><button className="fr-delete-confirm" disabled={busy} aria-busy={busy} onClick={()=>run(async()=>{await api.deleteResume(target.id,target.revision);await load();setDialog(null)})}>{busy?<LoaderCircle size={16} className="fr-delete-spinner" aria-hidden="true"/>:<Trash2 size={16} aria-hidden="true"/>}{busy?copy.deleting:copy.deleteConfirm}</button></footer>
 </Modal>}
 {dialog==='import'&&<Import api={api} copy={copy} close={()=>setDialog(null)} onOpen={open}/>}</Library>
}
function Editor({api,copy}:{api:EditorApi;copy:Copy}){
 const {id:routeId=''}=useParams(),id=resumeIdSchema.parse(routeId),navigate=useNavigate(),coordinator=useRef<SaveCoordinator|null>(null),recovered=useRef<Recovery|null>(null),[state,setState]=useState<DraftState|null>(null),[error,setError]=useState(''),[backups,setBackups]=useState<Recovery[]>([]),[backupError,setBackupError]=useState(false),[versions,setVersions]=useState(false),[importOpen,setImportOpen]=useState(false),[busy,setBusy]=useState(false),[exportInfo,setExportInfo]=useState(''),[loadAttempt,setLoadAttempt]=useState(0)
 const backup=backups[0]??null
 const ui=useEditorStore(s=>s.ui),selectedIds=useEditorStore(s=>s.selection.selectedIds)
 const run=useCallback((work:()=>Promise<void>)=>{setError('');setBusy(true);void work().catch(e=>setError(e instanceof Error?e.message:copy.error)).finally(()=>setBusy(false))},[copy])
 const install=useCallback((snapshot:ResumeSnapshot)=>{coordinator.current?.dispose();useEditorStore.getState().setDocument(parseResumeBackup(snapshot.documentJson).document);useEditorStore.getState().setResumeId(snapshot.id)
  let instance:SaveCoordinator;instance=new SaveCoordinator(snapshot,api.save,()=>{const next={...instance.state};setState(next);useEditorStore.getState().setSaveState({isSaving:next.saving,saveError:next.error?.message??null,lastSavedAt:next.dirty?null:next.snapshot.updatedAt});if(!next.dirty)useEditorStore.getState().markClean()},async(saved,submittedJson)=>{try{await api.clearBackup(saved.id,saved.revision,submittedJson);const adopted=recovered.current;if(adopted){await api.clearBackup(saved.id,saved.revision,adopted.documentJson,adopted);if(recovered.current===adopted)recovered.current=null}}catch(error){if(coordinator.current===instance)setBackupError(true)}});coordinator.current=instance;setState({...instance.state})
 },[api])
 const refresh=useCallback(async()=>{const fresh=await api.read(id);const c=coordinator.current;if(!c||c.state.snapshot.id!==id)return;if(c.receive(fresh)){useEditorStore.getState().setDocument(parseResumeBackup(fresh.documentJson).document);setState({...c.state})}},[api,id])
 const save=useCallback(async(name?:string)=>{const c=coordinator.current;if(!c)return;if(backup)throw Error(copy.recovery);await c.flush(name)},[backup,copy])
 useEffect(()=>{
  setState(null);setBackups([]);setError('');setBackupError(false)
  let active=true,timer:ReturnType<typeof setTimeout>|undefined
  void Promise.all([api.read(id),api.recovery(id).catch(()=>{if(active)setBackupError(true);return []})]).then(([snapshot,recovery])=>{if(!active)return;install(snapshot);setBackups(recovery.filter(record=>record.documentJson!==snapshot.documentJson))}).catch(e=>{if(active)setError(e.message)})
  const unsubscribe=useEditorStore.subscribe((next,previous)=>{
   const c=coordinator.current;if(!active||!c||c.state.snapshot.id!==id||next.document===previous.document||!next.isDirty)return
   const json=JSON.stringify(next.document);c.edit(json)
   void api.backup({id,revision:c.state.snapshot.revision,documentJson:json,updatedAt:Date.now()}).catch(()=>{if(active)setBackupError(true)})
   clearTimeout(timer);timer=setTimeout(()=>{if(!active||backup)return;void c.flush().catch(error=>{if(active&&!c.state.error)setError(error instanceof Error?error.message:copy.error)})},api.config.autosaveDelayMs)
  })
  const poll=setInterval(()=>{if(!active||!coordinator.current||coordinator.current.state.saving)return;void refresh().catch(e=>{if(active)setError(e.message)})},api.config.refreshIntervalMs)
  const leave=(e:BeforeUnloadEvent)=>{if(coordinator.current?.state.dirty){e.preventDefault();e.returnValue=''}};window.addEventListener('beforeunload',leave)
  return()=>{active=false;clearTimeout(timer);clearInterval(poll);unsubscribe();coordinator.current?.dispose();coordinator.current=null;window.removeEventListener('beforeunload',leave)}
 },[api,id,install,refresh,loadAttempt])
 useEffect(()=>{registerManualSave(()=>{run(()=>save())});registerOpenVersions(()=>setVersions(true));return()=>{registerManualSave(null);registerOpenVersions(null)}},[save,run])
 const copyDraft=()=>run(async()=>{const c=coordinator.current;if(!c)return;const json=backup?.documentJson??c.state.draft;const saved=await api.create({title:`${c.state.snapshot.title} (${copy.copy})`,documentJson:json});if(backup)await api.clearBackup(id,backup.revision,backup.documentJson,backup);navigate(`/resume/${saved.id}`)})
 const reload=()=>run(async()=>{const c=coordinator.current;if(c)await api.clearBackup(id,c.state.snapshot.revision,c.state.draft);const snapshot=await api.read(id);install(snapshot);setBackups([])})
 const exportDocument=(format:'json'|'pdf'|'png')=>run(async()=>{await save();const c=coordinator.current;if(!c||c.state.error)throw Error(copy.exportHint);const page=useEditorStore.getState().document.pages[useEditorStore.getState().activePageIndex];const receipt=await api.export({id,expectedRevision:c.state.snapshot.revision,format,pageId:format==='png'?page?.id:undefined});downloadReceipt(receipt);setExportInfo(`${copy.exported}: ${receipt.filename} · ${receipt.byteSize} B · ${receipt.width} × ${receipt.height} ${receipt.dimensionUnit}`)})
 if(!state)return <div className="fr-home"><p>{copy.loading}</p><ErrorNotice error={error} close={()=>setError('')}/>{error&&<button onClick={()=>setLoadAttempt(n=>n+1)}>{copy.retry}</button>}<button onClick={()=>navigate('/')}>{copy.back}</button></div>
 if(backup)return <main className="fr-home"><h1>{copy.title}</h1>{!api.config.recoveryOwnerPersistent&&<p className="fr-notice" role="alert">{copy.recoveryOwnerWarning}</p>}<div role="alert"><p>{copy.recovery}</p><p>{copy.recoveryDrafts}: {backups.length} · {new Date(backup.updatedAt).toLocaleString()}</p><div className="fr-row"><button onClick={()=>{const doc=parseResumeBackup(backup.documentJson).document;recovered.current=backup;setBackups([]);useEditorStore.getState().restoreDocument(doc)}}>{copy.recover}</button><button onClick={()=>run(async()=>{await api.clearBackup(id,backup.revision,backup.documentJson,backup);setBackups(items=>items.slice(1))})}>{copy.discard}</button><button onClick={copyDraft}>{copy.copy}</button></div></div><ErrorNotice error={error} close={()=>setError('')}/></main>
 return <DndProvider backend={HTML5Backend}><div className="fr-editor"><div className="fr-adapter-bar"><button className="fr-space-back" onClick={()=>navigate('/')}><ArrowLeft size={16} aria-hidden="true"/>{copy.back}</button><div className="fr-editor-document-title" title={state.snapshot.title}>{state.snapshot.title}</div><span className="fr-editor-save-state" role="status">{state.saving?<LoaderCircle size={13} className="fr-history-spinner" aria-hidden="true"/>:state.dirty?<span className="fr-editor-dirty-dot" aria-hidden="true"/>:<Check size={13} aria-hidden="true"/>}<span>{copy.revision} {state.snapshot.revision}<span aria-hidden="true"> · </span>{state.saving?copy.saving:state.dirty?copy.unsaved:copy.saved}</span></span></div>
 <ErrorNotice error={error} close={()=>setError('')}/>{!api.config.recoveryOwnerPersistent&&<p className="fr-notice" role="alert">{copy.recoveryOwnerWarning}</p>}{backupError&&<p className="fr-notice" role="alert">{copy.recoveryFailure}</p>}{exportInfo&&<div className="fr-notice" role="status">{exportInfo}<button onClick={()=>setExportInfo('')}>×</button></div>}
 {state.error&&<div className="fr-notice" role="alert"><span>{state.error.code==='conflict'?copy.conflict:state.error.message}</span><button onClick={reload}>{copy.reload}</button><button onClick={copyDraft}>{copy.copy}</button>{state.error.code!=='conflict'&&<button onClick={()=>{coordinator.current?.retry();run(()=>save())}}>{copy.retry}</button>}</div>}

 <MenuBar onExport={exportDocument} onImport={()=>setImportOpen(true)} labels={{save:copy.save,versions:copy.versions,showLeft:copy.showLeft,showRight:copy.showRight}}/>
 <PanelGroup direction="vertical" className="flex-1 min-h-0"><Panel defaultSize={ui.bottomPanelVisible?65:100} minSize={25} order={1}><WorkspacePanels leftLabel={copy.showLeft} rightLabel={copy.showRight}/></Panel>{ui.bottomPanelVisible&&<><PanelResizeHandle className="fr-resize fr-horizontal"/><Panel defaultSize={35} minSize={20} maxSize={70} order={2}><Assistant api={api} copy={copy} snapshot={state.snapshot} selectedIds={selectedIds} dirty={state.dirty||state.saving||!!backup||!!state.error} associate={async sessionId=>{const c=coordinator.current;if(!c)throw Error(copy.notSaved);await c.flush(undefined,sessionId);return c.state.snapshot}} run={run} refresh={refresh}/></Panel></>}</PanelGroup><StatusBar/></div>
 {versions&&<Versions api={api} state={state} copy={copy} close={()=>setVersions(false)} save={save} current={()=>coordinator.current?.state??state} blocked={!!backup||!!recovered.current} refresh={refresh}/>}{importOpen&&<Import api={api} copy={copy} close={()=>setImportOpen(false)} onOpen={saved=>{setImportOpen(false);navigate(`/resume/${saved.id}`)}}/>}</DndProvider>
}
function EditorRoute({api,copy}:{api:EditorApi;copy:Copy}){const {id}=useParams();return <Editor key={id} api={api} copy={copy}/>}
/** Separate React root inside the opaque frame; account and independent model UIs are unreachable. */
export function App({api}:{api:EditorApi}){const copy=api.config.locale==='zh'?zh:en;return <MemoryRouter><Routes><Route path="/" element={<Home api={api} copy={copy}/>}/><Route path="/resume/:id" element={<EditorRoute api={api} copy={copy}/>}/></Routes></MemoryRouter>}

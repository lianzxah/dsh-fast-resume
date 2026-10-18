/** Visual named-version history; preview ownership is isolated from the active editor document. */
import React,{useCallback,useEffect,useId,useRef,useState} from 'react'
import {History,ImageOff,LoaderCircle,Plus,RotateCcw,Check,FileText} from 'lucide-react'
import type {HistoryView,ResumeId} from '../types.ts'
import type {EditorApi} from './api.ts'
import type {Copy} from './locales.ts'
import type {DraftState} from './persistence.ts'
import {Modal} from './modal.tsx'
import {renderSavedPage} from './thumbnail.ts'
import {VersionPreviewQueue,type VersionPreview} from './version-preview.ts'
type Version=HistoryView['versions'][number]
interface VersionsProps {api:EditorApi;state:DraftState;copy:Copy;close:()=>void;save:(name:string)=>Promise<void>;current:()=>DraftState;blocked:boolean;refresh:()=>Promise<void>}
function SavedPage({resumeId,version,queue,copy,detail=false}:{resumeId:ResumeId;version:Version;queue:VersionPreviewQueue|null;copy:Copy;detail?:boolean}){
 const ref=useRef<HTMLDivElement>(null),[visible,setVisible]=useState(detail),[attempt,setAttempt]=useState(0),[page,setPage]=useState(0),[result,setResult]=useState<VersionPreview|null>(null),[failed,setFailed]=useState(false),[pageCount,setPageCount]=useState(1)
 const id=useId()
 useEffect(()=>{
  if(detail)return
  const node=ref.current;if(!node)return
  const observer=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.target===node)setVisible(entry.isIntersecting)})
  observer.observe(node);return()=>observer.disconnect()
 },[detail])
 useEffect(()=>{
  setResult(null);setFailed(false);if(!visible||!queue)return
  const abort=new AbortController()
  void queue.request(resumeId,version,abort.signal,page,detail?768:384).then(next=>{if(!abort.signal.aborted){setResult(next);setPageCount(next.snapshot.pageCount)}},()=>{if(!abort.signal.aborted)setFailed(true)})
  return()=>abort.abort()
 },[resumeId,queue,visible,version.id,version.revision,page,attempt,detail])
 return <div ref={ref} className={detail?'fr-history-page-detail':'fr-history-page-thumb'} aria-busy={visible&&!result&&!failed}>
  {detail&&pageCount>1&&<label className="fr-history-page-picker" htmlFor={id}>{copy.historyPage}<select id={id} value={page} onChange={event=>setPage(Number(event.target.value))}>{Array.from({length:pageCount},(_,index)=><option key={index} value={index}>{index+1} / {pageCount}</option>)}</select></label>}
  {result?<img src={result.url} alt={`${detail?copy.readOnly:copy.firstPage}: ${version.name} · ${page+1}`} draggable={false}/>:failed?<div className="fr-history-preview-state" role="status"><ImageOff size={detail?26:18} aria-hidden="true"/><p>{copy.historyPreviewError}</p><button onClick={()=>setAttempt(n=>n+1)}>{copy.retry}</button></div>:<div className="fr-history-preview-state" aria-label={copy.previewLoading}><LoaderCircle size={20} className="fr-history-spinner" aria-hidden="true"/></div>}
 </div>
}
/** Named saves flush the coordinator; historical restore always reads its latest acknowledged revision.
 * @param props Modal API, current draft owner, localized copy and mutation callbacks.
 * @returns Accessible version collection and selected-page preview.
 */
export function Versions({api,state,copy,close,save,current,blocked,refresh}:VersionsProps){
 const [history,setHistory]=useState<HistoryView|null>(null),[selectedId,setSelectedId]=useState<string|null>(null),[loading,setLoading]=useState(true),[queryError,setQueryError]=useState(false),[error,setError]=useState(''),[name,setName]=useState(''),[pending,setPending]=useState<'save'|'restore'|'check'|null>(null),[uncertain,setUncertain]=useState(false),[queue,setQueue]=useState<VersionPreviewQueue|null>(null)
 const active=useRef(true),mutation=useRef(false),query=useRef(0),latest=useRef({current,blocked});latest.current={current,blocked}
 const namedSelection=useRef<{afterRevision:number;name:string}|null>(null)
 const descriptionId=useId(),nameId=useId(),blockedId=useId()
 useEffect(()=>{active.current=true;const owner=new VersionPreviewQueue(api.version,renderSavedPage,api.config.bridgeTimeoutMs);setQueue(owner);return()=>{active.current=false;query.current++;void owner.dispose()}},[api,state.snapshot.id])
 const load=useCallback(async()=>{
  const request=++query.current;setLoading(true);setQueryError(false)
  try{const next=await api.history(state.snapshot.id);if(active.current&&request===query.current){const ordered={...next,versions:[...next.versions].sort((a,b)=>b.revision-a.revision)},intent=namedSelection.current,named=intent?ordered.versions.find(version=>version.revision>intent.afterRevision&&version.name===intent.name):undefined
    if(named)namedSelection.current=null
    setHistory(ordered);setSelectedId(previous=>named?.id??(ordered.versions.some(v=>v.id===previous)?previous:ordered.versions[0]?.id??null))}}
  catch(error){if(active.current&&request===query.current)setQueryError(true)}
  finally{if(active.current&&request===query.current)setLoading(false)}
 },[api,state.snapshot.id])
 useEffect(()=>{void load()},[load,state.snapshot.revision])
 const selected=history?.versions.find(v=>v.id===selectedId),saveBlocked=blocked||!!state.error||uncertain,restoreBlocked=saveBlocked||state.dirty||state.saving
 const mutate=async(kind:'save'|'restore'|'check')=>{
  if(mutation.current)return
  const draft=latest.current.current()
  if(kind!=='check'&&(latest.current.blocked||draft.error||uncertain))return
  if(kind==='restore'&&(draft.dirty||draft.saving||!selected))return
  const versionName=name.trim(),baseRevision=draft.snapshot.revision;if(kind==='save'&&!versionName)return
  mutation.current=true;setPending(kind);setError('')
  try{
   if(kind==='save'){await save(versionName);if(!active.current)return;namedSelection.current={afterRevision:baseRevision,name:versionName};setName('');await load()}
   else if(kind==='restore'&&selected){await api.restore({id:draft.snapshot.id,expectedRevision:draft.snapshot.revision,versionId:selected.id,requestId:crypto.randomUUID()});await refresh();if(active.current)close()}
   else {await refresh();await load();if(active.current)setUncertain(false)}
  }catch(error){if(active.current){setError(copy.historyMutationError);setUncertain(true)}}
  finally{mutation.current=false;if(active.current)setPending(null)}
 }
 return <Modal title={copy.versions} className="fr-history-modal" descriptionId={descriptionId} titleIcon={<span className="fr-history-emblem"><History size={23} aria-hidden="true"/></span>} closeLabel={copy.close} dismissible={!pending} close={close}>
  <div className="fr-history-intro"><div><span className="fr-history-eyebrow">{copy.historyEyebrow}</span><p id={descriptionId}>{copy.historyDescription}</p></div><span className="fr-history-current">{copy.historyCurrent} <strong>{state.snapshot.revision}</strong></span></div>
  <form className="fr-history-save" onSubmit={event=>{event.preventDefault();void mutate('save')}}><div><label htmlFor={nameId}>{copy.historyNameHint}</label><input id={nameId} aria-label={copy.versionName} placeholder={copy.versionName} maxLength={512} disabled={!!pending||saveBlocked} value={name} onChange={event=>setName(event.target.value)}/><p>{saveBlocked?copy.historySaveBlocked:copy.historySaveHint}</p></div><button type="submit" className="fr-history-primary" disabled={!!pending||saveBlocked||!name.trim()}>{pending==='save'?<LoaderCircle size={16} className="fr-history-spinner" aria-hidden="true"/>:<Plus size={16} aria-hidden="true"/>}{pending==='save'?copy.saving:copy.saveVersion}</button></form>
  {error&&<div className="fr-history-notice" role="alert"><p>{error}</p><button disabled={!!pending} onClick={()=>void mutate('check')}>{pending==='check'?copy.pending:copy.reload}</button></div>}
  {queryError&&<div className="fr-history-notice" role="alert"><p>{copy.historyLoadError}</p><button disabled={loading||!!pending} onClick={()=>void load()}>{copy.retry}</button></div>}
  <div className="fr-history-workspace"><section className="fr-history-collection" aria-label={copy.versions}><div className="fr-history-collection-heading"><History size={15} aria-hidden="true"/><span>{history?.versions.length??'—'} {copy.historyCount}</span>{loading&&<LoaderCircle size={15} className="fr-history-spinner" aria-label={copy.loading}/>}</div>
   {loading&&!history?<div className="fr-history-empty" aria-label={copy.loading}><LoaderCircle size={24} className="fr-history-spinner" aria-hidden="true"/></div>:history?.versions.length===0?<div className="fr-history-empty"><FileText size={30} aria-hidden="true"/><h3>{copy.noVersions}</h3><p>{copy.historyEmptyHint}</p></div>:history?.versions.map(version=><article key={`${version.id}:${version.revision}`} className={`fr-history-card${version.id===selectedId?' is-selected':''}`}><SavedPage resumeId={state.snapshot.id} version={version} queue={queue} copy={copy}/><button className="fr-history-select" disabled={!!pending} aria-label={`${copy.historySelect}: ${version.name}`} aria-pressed={version.id===selectedId} onClick={()=>{namedSelection.current=null;setSelectedId(version.id)}}><span className="fr-history-version-name">{version.name}</span><span className="fr-history-version-meta">{copy.revision} {version.revision}<time dateTime={version.createdAt}>{new Date(version.createdAt).toLocaleString(api.config.locale==='zh'?'zh-CN':'en-US',{dateStyle:'medium',timeStyle:'short'})}</time></span>{version.id===selectedId&&<Check size={16} className="fr-history-selected-check" aria-hidden="true"/>}</button></article>)}
  </section><section className="fr-history-detail" aria-label={copy.readOnly}>{selected?<><div className="fr-history-detail-heading"><span>{copy.readOnly}</span><h3>{selected.name}</h3><p>{copy.revision} {selected.revision}</p></div><SavedPage key={`${selected.id}:${selected.revision}`} resumeId={state.snapshot.id} version={selected} queue={queue} copy={copy} detail/><footer className="fr-history-restore"><p id={blockedId}>{restoreBlocked?copy.historyBlocked:copy.historyRestoreHint}</p><button className="fr-history-primary" disabled={!!pending||restoreBlocked} aria-describedby={blockedId} onClick={()=>void mutate('restore')}>{pending==='restore'?<LoaderCircle size={16} className="fr-history-spinner" aria-hidden="true"/>:<RotateCcw size={16} aria-hidden="true"/>}{pending==='restore'?copy.pending:copy.restore}</button></footer></>:<div className="fr-history-empty"><History size={30} aria-hidden="true"/><p>{copy.historySelectHint}</p></div>}</section></div>
 </Modal>
}

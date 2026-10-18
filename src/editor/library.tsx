/** Management workspace: saved-document browsing and visibility-owned first-page previews. */
import React,{useEffect,useMemo,useRef,useState} from 'react'
import {motion,useReducedMotion} from 'motion/react'
import {ArrowDownUp,ArrowUpRight,Check,Copy as CopyIcon,FilePlus2,FileStack,FileText,ImageOff,Layers3,LayoutTemplate,MessageSquare,Plus,RefreshCw,Search,SquarePen,Trash2,Upload,X} from 'lucide-react'
import {templates} from '@resume-editor/templates'
import type {ResumeSummary} from '../types.ts'
import type {EditorApi} from './api.ts'
import type {Copy} from './locales.ts'
import {PreviewQueue,selectDocuments,StalePreviewError,type LibraryOrder} from './library-model.ts'
import {renderThumbnail} from './thumbnail.ts'

interface LibraryProps {
 api:EditorApi;copy:Copy;documents:ResumeSummary[];busy:boolean;loading:boolean;notice:React.ReactNode;children:React.ReactNode
 create:()=>void;importDocument:()=>void;refresh:()=>void;conversation:()=>void
 open:(summary:ResumeSummary)=>void;rename:(summary:ResumeSummary)=>void;duplicate:(summary:ResumeSummary)=>void;remove:(summary:ResumeSummary)=>void
}
function Thumbnail({summary,queue,copy,refresh}:{summary:ResumeSummary;queue:PreviewQueue|null;copy:Copy;refresh:()=>void}){
 const ref=useRef<HTMLDivElement>(null),[visible,setVisible]=useState(false),[attempt,setAttempt]=useState(0)
 const [result,setResult]=useState<{url?:string;error?:'stale'|'failed'}>({})
 useEffect(()=>{
  const node=ref.current;if(!node)return
  const observer=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.target===node)setVisible(entry.isIntersecting)})
  observer.observe(node);return()=>observer.disconnect()
 },[])
 useEffect(()=>{
  setResult({});if(!visible||!queue)return
  const abort=new AbortController()
  void queue.request(summary,abort.signal).then(url=>{if(!abort.signal.aborted)setResult({url})},error=>{if(!abort.signal.aborted)setResult({error:error instanceof StalePreviewError?'stale':'failed'})})
  return()=>abort.abort()
 },[queue,visible,summary.id,summary.revision,attempt])
 return <div ref={ref} className="fr-library-preview" aria-busy={visible&&!result.url&&!result.error}>
  <div className="fr-library-preview-grid" aria-hidden="true"/>
  {result.url?<img src={result.url} alt={`${copy.firstPage}: ${summary.title}`} draggable={false}/>:result.error?<div className="fr-library-preview-error"><ImageOff size={22} aria-hidden="true"/><span>{result.error==='stale'?copy.previewChanged:copy.previewUnavailable}</span><button type="button" onClick={result.error==='stale'?refresh:()=>setAttempt(n=>n+1)}>{result.error==='stale'?copy.refresh:copy.retry}</button></div>:<div className="fr-library-paper-skeleton" aria-label={copy.previewLoading}><span/><span/><span/><span/><span/></div>}
 </div>
}
/** Search, ordering and preview ownership stay independent of the original editor store. */
export function Library(props:LibraryProps){
 const {api,copy,documents,busy,loading}=props
 const [query,setQuery]=useState(''),[order,setOrder]=useState<LibraryOrder>('recent'),[queue,setQueue]=useState<PreviewQueue|null>(null)
 const searchRef=useRef<HTMLInputElement>(null)
 const clearSearch=()=>{setQuery('');searchRef.current?.focus()}
 const reducedMotion=useReducedMotion()
 useEffect(()=>{const owner=new PreviewQueue(api.read,renderThumbnail,api.config.bridgeTimeoutMs);setQueue(owner);return()=>{void owner.dispose()}},[api])
 const selected=useMemo(()=>selectDocuments(documents,query,order),[documents,query,order])
 const pages=documents.reduce((total,item)=>total+item.pageCount,0)
 return <main className="fr-library">
  <div className="fr-library-aurora" aria-hidden="true"/>
  <div className="fr-library-shell">
   <header className="fr-library-topbar">
    <div className="fr-library-brand"><span className="fr-library-brand-icon"><FileStack size={22} strokeWidth={1.5} aria-hidden="true"/></span><div><span>{copy.title}</span><small>{copy.workspace}</small></div></div>
    <div className="fr-library-top-actions"><button onClick={props.conversation}><MessageSquare size={15} aria-hidden="true"/>{copy.conversation}</button><button disabled={busy||loading} onClick={props.refresh}><RefreshCw size={15} className={loading?'fr-library-spinning':''} aria-hidden="true"/>{copy.refresh}</button></div>
   </header>
   <motion.section className="fr-library-hero" initial={reducedMotion?false:{opacity:0,y:12}} animate={{opacity:1,y:0}} transition={{duration:.45}}>
    <div className="fr-library-hero-copy"><span className="fr-library-eyebrow"><span/>{copy.heroEyebrow}</span><h1>{copy.heroTitle}<span>{copy.heroAccent}</span></h1><p>{copy.heroDescription}</p><div className="fr-library-primary-actions"><button className="fr-library-primary" onClick={props.create}><Plus size={18} aria-hidden="true"/>{copy.new}<ArrowUpRight size={17} aria-hidden="true"/></button><button className="fr-library-secondary" onClick={props.importDocument}><Upload size={17} aria-hidden="true"/>{copy.import}</button></div><div className="fr-library-formats"><Check size={13} aria-hidden="true"/>{copy.importFormats}</div></div>
    <div className="fr-library-statboard"><div className="fr-library-stat-orbit" aria-hidden="true"/><div className="fr-library-stat-main"><span className="fr-library-stat-icon"><FileText size={22} strokeWidth={1.5} aria-hidden="true"/></span><span className="fr-library-stat-label">{copy.savedResumes}</span><strong>{loading?'—':documents.length.toLocaleString()}</strong><span className="fr-library-stat-caption">{copy.collectionCaption}</span></div><div className="fr-library-stat-bottom"><div><Layers3 size={16} aria-hidden="true"/><strong>{loading?'—':pages.toLocaleString()}</strong><span>{copy.totalPages}</span></div><div><LayoutTemplate size={16} aria-hidden="true"/><strong>{templates.length}</strong><span>{copy.templateCount}</span></div></div></div>
   </motion.section>
   {props.notice}
   <section className="fr-library-collection" aria-label={copy.library}>
    <div className="fr-library-collection-top"><div><span className="fr-library-eyebrow">{copy.collectionEyebrow}</span><h2>{copy.library}<span className="fr-library-count">{documents.length}</span></h2></div><p>{copy.libraryDescription}</p></div>
    <div className="fr-library-toolbar"><label className="fr-library-search"><Search size={17} aria-hidden="true"/><input ref={searchRef} type="search" value={query} onChange={event=>setQuery(event.target.value)} aria-label={copy.search} placeholder={copy.search}/>{query&&<button onClick={clearSearch} aria-label={copy.clearSearch}><X size={15} aria-hidden="true"/></button>}</label><label className="fr-library-sort"><ArrowDownUp size={15} aria-hidden="true"/><span className="sr-only">{copy.sort}</span><select aria-label={copy.sort} value={order} onChange={event=>setOrder(event.target.value as LibraryOrder)}><option value="recent">{copy.sortRecent}</option><option value="oldest">{copy.sortOldest}</option><option value="title">{copy.sortTitle}</option></select></label><span className="fr-library-result-count" role="status">{selected.length} / {documents.length} {copy.results}</span></div>
    {loading&&documents.length===0?<div className="fr-library-grid" aria-label={copy.loading}>{[0,1,2].map(i=><div key={i} className="fr-library-card fr-library-loading-card" aria-hidden="true"><div className="fr-library-paper-skeleton"><span/><span/><span/></div></div>)}</div>:documents.length===0?<div className="fr-library-empty"><span className="fr-library-empty-icon"><FilePlus2 size={30} strokeWidth={1.25} aria-hidden="true"/></span><h3>{copy.emptyTitle}</h3><p>{copy.emptyDescription}</p><div className="fr-library-primary-actions"><button className="fr-library-primary" onClick={props.create}><Plus size={17} aria-hidden="true"/>{copy.new}</button><button onClick={props.importDocument}><Upload size={16} aria-hidden="true"/>{copy.import}</button></div></div>:selected.length===0?<div className="fr-library-empty"><span className="fr-library-empty-icon"><Search size={28} strokeWidth={1.25} aria-hidden="true"/></span><h3>{copy.noResults}</h3><p>{copy.noResultsHint}</p><button onClick={clearSearch}>{copy.clearSearch}</button></div>:<div className="fr-library-grid">{selected.map(summary=><article key={summary.id} className="fr-library-card">
     <div className="fr-library-card-visual"><Thumbnail key={`${summary.id}:${summary.revision}`} summary={summary} queue={queue} copy={copy} refresh={props.refresh}/><span className="fr-library-page-badge"><Layers3 size={12} aria-hidden="true"/>{summary.pageCount} {copy.pages}</span></div>
     <div className="fr-library-card-body"><button className="fr-library-card-title" onClick={()=>props.open(summary)}>{summary.title}<ArrowUpRight size={17} aria-hidden="true"/></button><div className="fr-library-card-meta"><span>{copy.updated} <time dateTime={summary.updatedAt}>{new Date(summary.updatedAt).toLocaleDateString(api.config.locale==='zh'?'zh-CN':'en-US',{year:'numeric',month:'short',day:'numeric'})}</time></span><span>{copy.revision} {summary.revision}</span></div><button className="fr-library-open" onClick={()=>props.open(summary)}>{copy.openEditor}<ArrowUpRight size={15} aria-hidden="true"/></button></div>
     <footer className="fr-library-card-actions"><button disabled={busy} onClick={()=>props.rename(summary)}><SquarePen size={14} aria-hidden="true"/>{copy.rename}</button><button disabled={busy} onClick={()=>props.duplicate(summary)}><CopyIcon size={14} aria-hidden="true"/>{copy.duplicate}</button><button disabled={busy} className="fr-library-delete" onClick={()=>props.remove(summary)}><Trash2 size={14} aria-hidden="true"/>{copy.delete}</button></footer>
    </article>)}</div>}
   </section><footer className="fr-library-footnote"><span>{copy.title}</span><span>{copy.libraryFootnote}</span></footer>
  </div>{props.children}
 </main>
}

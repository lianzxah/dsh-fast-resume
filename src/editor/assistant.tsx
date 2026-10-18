/** Normal Harness prompts and durable proposal review in the original editor's assistant position. */
import React,{useEffect,useState} from 'react'
import { renderPageToDataURL } from '@resume-editor/canvas-engine'
import { parseResumeBackup } from '@resume-editor/shared'
import {sendResumePrompt} from './assistant-flow.ts'
import type { EditorApi } from './api.ts'
import type { Copy } from './locales.ts'
import type { ResumeSnapshot,ProposalView,HistoryView } from '../types.ts'
/** Raster previews share the exact canvas export renderer and never change the current draft. */
export function DocumentPreview({json,label}:{json:string;label:string}){
 const [pages,setPages]=useState<string[]>([]),[error,setError]=useState('')
 useEffect(()=>{let active=true;void(async()=>{await document.fonts.ready;const doc=parseResumeBackup(json).document;const images=await Promise.all(doc.pages.map(p=>renderPageToDataURL(p,{...doc.pageConfig,...p.config},{pixelRatio:.5})));if(active)setPages(images)})().catch(e=>{if(active)setError(e.message)});return()=>{active=false}},[json])
 return <section className="fr-preview"><h4>{label}</h4>{error?<p role="alert">{error}</p>:pages.map((url,i)=><img key={i} src={url} alt={`${label} ${i+1}`} />)}</section>
}
export function Assistant({api,snapshot,selectedIds,dirty,copy,run,refresh,associate}:{api:EditorApi;snapshot:ResumeSnapshot;selectedIds:string[];dirty:boolean;copy:Copy;run:(work:()=>Promise<void>)=>void;refresh:()=>Promise<void>;associate:(sessionId:string)=>Promise<ResumeSnapshot>}){
 const [instruction,setInstruction]=useState(''),[history,setHistory]=useState<HistoryView|null>(null),[review,setReview]=useState<string|null>(null),[session,setSession]=useState(snapshot.sessionId),[error,setError]=useState(''),[pending,setPending]=useState(false)
 const load=async()=>{setHistory(await api.history(snapshot.id));setError('')}
 useEffect(()=>{let active=true;void api.history(snapshot.id).then(value=>{if(active)setHistory(value)}).catch(e=>{if(active)setError(`${copy.error} ${e instanceof Error?e.message:''}`)});return()=>{active=false}},[snapshot.id,snapshot.revision,api])
 const prompt=()=>{setPending(true);run(async()=>{try{if(dirty)throw Error(copy.dirtyPrompt);await sendResumePrompt({snapshot,text:instruction,selectedIds,sessionId:session},{createSession:api.createSession,associate,prompt:api.prompt,onSession:setSession});setInstruction('');await refresh()}finally{setPending(false)}})}
 const mutate=(p:ProposalView,revert=false)=>run(async()=>{if(dirty)throw Error(copy.dirtyPrompt);if(revert)await api.revert({id:snapshot.id,expectedRevision:snapshot.revision,proposalId:p.id,requestId:crypto.randomUUID()});else await api.apply({id:snapshot.id,proposalId:p.id,requestId:crypto.randomUUID()});await refresh();await load()})
 return <div className="fr-assistant"><div className="fr-row"><h3>{copy.assistant}</h3><button onClick={()=>run(async()=>{await api.conversation(session)})}>{copy.conversation}</button><button onClick={()=>run(load)}>{copy.refresh}</button></div><p>{copy.promptHint}</p>{error&&<div role="alert"><p>{error}</p><button onClick={()=>run(load)}>{copy.retry}</button></div>}{dirty&&<p role="status">{copy.dirtyPrompt}</p>}<div className="fr-row"><textarea aria-label={copy.instruction} placeholder={copy.instruction} value={instruction} onChange={e=>setInstruction(e.target.value)}/><button disabled={pending||dirty||!instruction.trim()} onClick={prompt}>{copy.prompt}</button></div>{session&&<p>{copy.session}: {session}</p>}<h4>{copy.proposals}</h4>{history?.proposals.length===0&&<p>{copy.noProposals}</p>}{history?.proposals.map(p=>{
  const pair=review===p.id?JSON.parse(p.beforeAfterJson) as {before:unknown;after:unknown}:null
  const reverted=history.changes.some(c=>c.revertedProposalId===p.id)
  return <article key={p.id} className="fr-proposal"><div className="fr-row"><span>{p.summary} · {copy.revision} {p.baseRevision}</span><button onClick={()=>setReview(review===p.id?null:p.id)}>{copy.review}</button>{reverted?<span>{copy.reverted}</span>:<button disabled={dirty} onClick={()=>mutate(p,p.status==='applied')}>{p.status==='applied'?copy.revert:copy.apply}</button>}</div>{pair&&<div className="fr-preview-pair"><DocumentPreview json={JSON.stringify(pair.before)} label={copy.before}/><DocumentPreview json={JSON.stringify(pair.after)} label={copy.after}/></div>}</article>
 })}</div>
}

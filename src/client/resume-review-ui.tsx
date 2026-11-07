/** Persistent public tool cards and the conversation's explicit review/target controls. */
import React,{useEffect,useState,useSyncExternalStore} from 'react'
import {createPortal} from 'react-dom'
import {FileText,Check,ArrowUpRight} from 'lucide-react'
import type {ToolCallViewProps} from '@deepseek-ai/dsh-client-ui-tool/client'
import type {PropsLocale} from '@deepseek-ai/dsh-client-ui-slots'
import type {SessionId} from '@deepseek-ai/dsh-session/types'
import {z} from 'zod'
import {resumeIdSchema,proposalIdSchema} from '../identity.ts'
import type {ResumeId,ResumeSummary,ResumeSnapshot,HistoryView,ProposalView,ResumeContextResult} from '../types.ts'
import type {ResumeActions} from './resume-actions.ts'
import type {EditorViews} from './editor-views.ts'
import {deriveResumeActivity} from './resume-activity.ts'
import {reviewState,reviewEntries,previewDocuments,hasReviewTarget} from './resume-review.ts'
import {reviewStyle} from './review-style.ts'
import {Modal} from '../editor/modal.tsx'
type T=PropsLocale<'fastResume'>['t']
/** Parent-owned reads and actions; every request is drained by the Client lifetime. */
export interface ReviewFace {preview?:(id:ResumeId,revision:ResumeSnapshot['revision'],json:string,pageId:string,signal:AbortSignal)=>Promise<string>;reviewSession:SessionId;actions:ResumeActions;views:EditorViews;read:(id:ResumeId,signal:AbortSignal)=>Promise<ResumeSnapshot>;history:(id:ResumeId,signal:AbortSignal)=>Promise<HistoryView>;list:(signal:AbortSignal)=>Promise<ResumeSummary[]>;context:(signal:AbortSignal)=>Promise<ResumeContextResult>;select:(target:Pick<ResumeSummary,'id'|'revision'>,signal:AbortSignal)=>Promise<void>;open:(id:ResumeId)=>void}
function Styles(){return <style>{reviewStyle}</style>}
function Dialog({title,close,t,children}:{title:string;close:()=>void;t:T;children:React.ReactNode}){return createPortal(<div className="fr-review"><Styles/><Modal title={title} close={close} closeLabel={t('close')}>{children}</Modal></div>,document.body)}
const idleValue={state:'idle' as const},idle=()=>idleValue,noop=()=>()=>{}
/** Immutable page previews reuse the packaged renderer and own cancellation through the review disclosure. */
function ProposalPreview({proposal,id,face,t}:{proposal:ProposalView;id:ResumeId;face:ReviewFace;t:T}){
 const pair=React.useMemo(()=>previewDocuments(proposal.beforeAfterJson),[proposal.beforeAfterJson]),pages=[...new Set([...pair.before.pages.map(p=>p.id),...pair.after.pages.map(p=>p.id)])]
 const [page,setPage]=useState(pages[0]),[images,setImages]=useState<{before?:string;after?:string}>({}),[error,setError]=useState(false),[retry,setRetry]=useState(0)
 useEffect(()=>{const lifetime=new AbortController();setImages({});setError(false);void(async()=>{for(const side of ['before','after']as const){if(!pair[side].pages.some(p=>p.id===page)||!face.preview)continue;const image=await face.preview(id,proposal.baseRevision,JSON.stringify(pair[side]),page,lifetime.signal);if(!lifetime.signal.aborted)setImages(old=>({...old,[side]:image}))}})().catch(()=>{if(!lifetime.signal.aborted)setError(true)});return()=>lifetime.abort()},[face,id,pair,page,proposal.baseRevision,retry])
 if(!face.preview)return null
 return <section><label>{t('page')} <select value={page} onChange={e=>setPage(e.target.value)}>{pages.map((id,index)=><option key={id} value={id}>{index+1}</option>)}</select></label>{error&&<p role="alert">{t('previewUnavailable')} <button onClick={()=>setRetry(n=>n+1)}>{t('retry')}</button></p>}<div className="fr-review-pair">{(['before','after']as const).map(side=><figure key={side} style={{margin:0}}><figcaption>{t(side)}</figcaption>{images[side]?<img style={{width:'100%',height:'auto',borderRadius:6,marginTop:6}} src={images[side]} alt={`${t(side)} · ${t('page')} ${pages.indexOf(page)+1}`}/>:<p>{pair[side].pages.some(p=>p.id===page)?t('reading'):t('pageAbsent')}</p>}</figure>)}</div></section>
}
/** Proposal controls always reconcile live durable history before enabling a write. */
export function ProposalReview({proposal,history,snapshot,face,t,refresh,blocked=false,onLocate}:{blocked?:boolean;onLocate?:()=>void;proposal:ProposalView;history:HistoryView;snapshot:ResumeSnapshot;face:ReviewFace;t:T;refresh:()=>void}){
 const durable=reviewState(proposal,history.changes),[review,setReview]=useState(false)
 useSyncExternalStore(face.actions.subscribe,face.actions.getSnapshot)
 const identity={sessionId:face.reviewSession,id:snapshot.id,proposalId:proposal.id},action=face.actions.find({...identity,kind:'revert'})??face.actions.find({...identity,kind:'apply'})
 const state=useSyncExternalStore(action?.subscribe??noop,action?.getSnapshot??idle)
 const loaded=useSyncExternalStore(face.views.subscribeLoaded,face.views.loadedSnapshot)
 const reconciled=reviewState(proposal,history.changes,state.state==='committed'?state.result.receipt:undefined),receipt=reconciled.receipt
 const localReceipt=state.state==='committed'&&receipt?.requestId===state.result.receipt.requestId
 const initialAction=action?.getSnapshot(),outlined=React.useRef<string|undefined>(initialAction?.state==='committed'?initialAction.result.receipt.requestId:undefined)
 const rendered=receipt&&loaded.some(x=>x.sessionId===face.reviewSession&&x.resumeId===snapshot.id&&x.revision===receipt.revision)
 useEffect(()=>{if(state.state==='committed'||state.state==='rejected')refresh()},[state,refresh])
 useEffect(()=>{if(state.state==='committed'&&localReceipt&&rendered&&outlined.current!==state.result.receipt.requestId){outlined.current=state.result.receipt.requestId;void face.views.feedback(face.reviewSession,snapshot.id,state.result.receipt.revision,state.result.receipt.changedElementIds).catch(()=>{/* View may change after its loaded acknowledgement. */})}},[state,localReceipt,rendered,face,snapshot.id])
 const execute=()=>{const next=face.actions.create({sessionId:face.reviewSession,id:snapshot.id,proposalId:proposal.id,...(durable.state==='applied'?{kind:'revert' as const,expectedRevision:snapshot.revision}:{kind:'apply' as const})});void next.run()}
 let entries:ReturnType<typeof reviewEntries>=[];let invalid=false;try{entries=reviewEntries(proposal.beforeAfterJson)}catch(error){invalid=true}
 const pending=state.state==='pending',unknown=state.state==='unknown'||durable.state==='unknown'
 return <article className="fr-card"><h4>{proposal.summary}</h4><p className="fr-muted">{t('revision')} {proposal.baseRevision} → {receipt?.revision??'…'} · {t('currentRevision')} {snapshot.revision}</p>{receipt&&<p className="fr-status"><Check size={14}/>{t(reconciled.state==='reverted'?'undone':rendered?'loaded':snapshot.revision>receipt.revision?'savedEarlier':'saved')} · {t('revision')} {receipt.revision}</p>}
 {state.state==='committed'&&localReceipt&&state.result.association!=='bound'&&<p role="status">{t('associationNotice')}</p>}
 {state.state==='committed'&&localReceipt&&state.result.editor==='uncertain'&&<p role="status">{t('viewUnavailable')}</p>}
 {pending&&<p role="status">{t('applying')}</p>}{unknown&&<p role="alert">{t('unknownAction')}</p>}{state.state==='rejected'&&<p role="alert">{t('actionConflict')}</p>}
 <div className="fr-actions"><button onClick={()=>setReview(!review)} aria-expanded={review}>{t('reviewChanges')}</button><button onClick={()=>face.open(snapshot.id)}>{t('openResume')}<ArrowUpRight size={12}/></button>{unknown?action&&<button onClick={()=>void action.run()}>{t('checkOutcome')}</button>:durable.state!=='reverted'&&(state.state!=='committed'||durable.state==='applied'&&!state.result.receipt.revertedProposalId)&&<button data-primary disabled={blocked||pending||invalid||durable.state==='proposed'&&!review} onClick={execute}>{t(durable.state==='applied'?'undoBatch':'applyProposal')}</button>}</div>
 {review&&<section aria-label={t('reviewChanges')}>{invalid?<p role="alert">{t('unverified')}</p>:<>{reconciled.state==='proposed'&&<p className="fr-muted">{t('reviewHint')}</p>}<ProposalPreview proposal={proposal} id={snapshot.id} face={face} t={t}/>{entries.map(e=><div key={e.id}><p className="fr-muted">{t('page')} {e.page} · {e.id}</p><div className="fr-review-pair"><div><strong>{t('before')}</strong><p>{e.before||t('layoutChange')}</p></div><div><strong>{t('after')}</strong><p>{e.after||t('removedOrLayout')}</p></div></div>{receipt&&!e.deleted&&hasReviewTarget(snapshot.documentJson,e.id)&&<button onClick={()=>{onLocate?.();void face.views.feedback(face.reviewSession,snapshot.id,snapshot.revision,[e.id],true).catch(()=>face.open(snapshot.id))}}>{t('locate')}</button>}</div>)}{!entries.length&&<p>{t('layoutChange')}</p>}</>}</section>}
 </article>
}
/** Read history only on identity, exact loaded revision, explicit refresh or action settlement. */
export function Changes({id,proposalId,face,t,onLocate,onSnapshot}:{onSnapshot?:(snapshot:ResumeSnapshot)=>void;onLocate?:()=>void;id:ResumeId;proposalId?:string;face:ReviewFace;t:T}){
 const [data,setData]=useState<{snapshot:ResumeSnapshot;history:HistoryView;sessionId:SessionId}>(),[error,setError]=useState(false),[reading,setReading]=useState(true),[count,setCount]=useState(0)
 const loaded=useSyncExternalStore(face.views.subscribeLoaded,face.views.loadedSnapshot),revision=loaded.find(v=>v.sessionId===face.reviewSession&&v.resumeId===id)?.revision
 const refresh=React.useCallback(()=>setCount(n=>n+1),[])
 useEffect(()=>{const owner=new AbortController();setError(false);setReading(true);void Promise.all([face.read(id,owner.signal),face.history(id,owner.signal)]).then(([snapshot,history])=>{if(!owner.signal.aborted){setReading(false);if(history.changes.some(c=>c.revision>snapshot.revision)){setError(true);return}setData({snapshot,history,sessionId:face.reviewSession});onSnapshot?.(snapshot)}},()=>{if(!owner.signal.aborted){setError(true);setReading(false)}});return()=>owner.abort()},[id,face,revision,count,onSnapshot])
 return <div className="fr-review"><Styles/>{error&&<p role="alert">{t('historyUnavailable')} <button onClick={refresh}>{t('retry')}</button></p>}{data&&data.snapshot.id===id&&data.sessionId===face.reviewSession?<><p><strong>{data.snapshot.title}</strong> · {t('currentRevision')} {data.snapshot.revision}</p>{data.history.proposals.filter(p=>!proposalId||p.id===proposalId).slice().reverse().map(p=><ProposalReview key={p.id} proposal={p} history={data.history} snapshot={data.snapshot} face={face} t={t} refresh={refresh} blocked={error||reading} onLocate={onLocate}/>)}{!data.history.proposals.length&&<p>{t('noChanges')}</p>}</>:!error&&<p role="status">{t('reading')}</p>}<button onClick={refresh}>{t('refresh')}</button></div>
}
/** Explicit comparison stays passive; editing selection has its own acknowledged intent. */
export function TargetChooser({face,t,close}:{face:ReviewFace;t:T;close:()=>void}){
 const [items,setItems]=useState<ResumeSummary[]>([]),[target,setTarget]=useState<ResumeId>(),[pending,setPending]=useState(false),[error,setError]=useState(false),[attempt,setAttempt]=useState(0)
 const owner=React.useRef<AbortController>();useEffect(()=>{const lifetime=new AbortController();owner.current=lifetime;setPending(true);setError(false);void Promise.all([face.list(lifetime.signal),face.context(lifetime.signal)]).then(([list,context])=>{if(lifetime.signal.aborted)return;setItems(list);setTarget(context.state==='bound'?context.context.resumeId:undefined)},()=>{if(!lifetime.signal.aborted)setError(true)}).finally(()=>{if(!lifetime.signal.aborted)setPending(false)});return()=>lifetime.abort()},[face,attempt])
 return <Dialog title={t('choose')} close={close} t={t}><p className="fr-muted">{t('targetHint')}</p>{pending&&<p role="status">{t('reading')}</p>}{error&&<p role="alert">{t('selectionFailed')} <button onClick={()=>setAttempt(n=>n+1)}>{t('retry')}</button></p>}{!pending&&!items.length&&<p>{t('noResumes')}</p>}{items.map(item=><article className="fr-target" key={item.id}><strong>{item.title}</strong><p className="fr-muted">{t('revision')} {item.revision} {target===item.id&&` · ${t('currentTarget')}`}</p><div className="fr-actions"><button disabled={pending} onClick={()=>{face.open(item.id);close()}}>{t('compare')}</button><button data-primary disabled={pending} onClick={()=>{const lifetime=owner.current!;setPending(true);setError(false);void face.select(item,lifetime.signal).then(()=>{if(!lifetime.signal.aborted){face.open(item.id);close()}},()=>{if(!lifetime.signal.aborted)setError(true)}).finally(()=>{if(!lifetime.signal.aborted)setPending(false)})}}>{t('useResume')}</button></div></article>)}</Dialog>
}
/** Compact non-reflow actions over the existing editor surface. */
export function ReviewControls({id,face,t}:{id:ResumeId;face:ReviewFace;t:T}){const[panel,setPanel]=useState<'changes'|'targets'>(),[current,setCurrent]=useState<ResumeId>(),[known,setKnown]=useState(false);const loaded=useSyncExternalStore(face.views.subscribeLoaded,face.views.loadedSnapshot),revision=loaded.find(v=>v.sessionId===face.reviewSession&&v.resumeId===id)?.revision;useEffect(()=>{const owner=new AbortController();void face.context(owner.signal).then(value=>{if(!owner.signal.aborted){setCurrent(value.state==='bound'?value.context.resumeId:undefined);setKnown(true)}},()=>{if(!owner.signal.aborted){setCurrent(undefined);setKnown(false)}});return()=>owner.abort()},[face,id,revision,panel]);return <div className="fr-review"><Styles/><div className="fr-controls"><span className="fr-muted" style={{alignSelf:'center',padding:4}}>{t(!known?'unverified':current===id?'currentTarget':'comparisonView')}</span><button onClick={()=>setPanel('changes')}>{t('currentChanges')}</button><button onClick={()=>setPanel('targets')}>{t('choose')}</button></div>{panel==='targets'&&<TargetChooser face={face} t={t} close={()=>setPanel(undefined)}/>} {panel==='changes'&&<Dialog title={t('currentChanges')} close={()=>setPanel(undefined)} t={t}><Changes id={id} face={face} t={t} onLocate={()=>setPanel(undefined)}/></Dialog>}</div>}
function parse(text:string):unknown{try{return JSON.parse(text)}catch(error){return undefined}}
const pointer=z.object({id:resumeIdSchema.optional(),proposalId:proposalIdSchema.optional()})
/** Public raw call/result projection; historical mounts perform reads only and never reveal. */
export function ResumeToolCard(props:ToolCallViewProps&PropsLocale<'fastResume'>&{review:ReviewFace}){
 const {phase,block,toolName,callId,review:face,t}=props,[choose,setChoose]=useState(false),[document,setDocument]=useState<ResumeSnapshot>()
 const argsRaw=phase==='start'&&'argsRaw'in block?block.argsRaw:phase==='result'&&'call'in block?block.call?.argsRaw??'{}':'{}'
 const result=phase==='result'&&'content'in block?parse(block.content.filter(p=>p.type==='text').map(p=>p.text).join('\n'))??null:undefined
 const activity=deriveResumeActivity({callId,rootCallId:callId,name:toolName,argsRaw,startSeq:0,seq:0,result,isError:'isError'in block&&block.isError})
 const loaded=useSyncExternalStore(face.views.subscribeLoaded,face.views.loadedSnapshot)
 const newer=activity?.target&&loaded.some(v=>v.sessionId===face.reviewSession&&v.resumeId===activity.target?.resumeId&&v.revision>activity.target.revision)
 const exact=activity?.target&&loaded.some(v=>v.sessionId===face.reviewSession&&v.resumeId===activity.target?.resumeId&&v.revision===activity.target.revision)
 const description=z.object({summary:z.string().optional(),title:z.string().optional(),filename:z.string().optional()}).safeParse(result)
 const args=pointer.safeParse(parse(argsRaw)),output=pointer.safeParse(result),id=activity?.target?.resumeId??(args.success?args.data.id:undefined)??(toolName==='resume_create'&&output.success?output.data.id:undefined),proposalId=activity?.receipt?.proposalId??(toolName==='resume_propose'&&output.success?output.data.id:args.success?args.data.proposalId:undefined)
 return <article className="fr-review fr-card"><Styles/><h4><FileText aria-hidden="true" size={14} style={{display:'inline',marginRight:6}}/>{document&&document.id===id?document.title:description.success&&description.data.title||t('assistantCard')}</h4>{description.success&&(description.data.summary||description.data.filename)&&<p>{description.data.summary??description.data.filename}</p>}<p className="fr-status" role="status">{t(activity?.phase==='saved'?(exact?'loaded':newer?'savedEarlier':'saved'):activity?.phase??'unverified')}</p>{activity?.target&&<p className="fr-muted">{t('revision')} {activity.target.revision}</p>}{id&&<><button onClick={()=>face.open(id)}>{t('openResume')}</button>{phase==='result'&&<details><summary>{t('currentChanges')}</summary><Changes id={id} proposalId={proposalId} face={face} t={t} onSnapshot={setDocument}/></details>}</>}{(!id||activity?.phase==='choose')&&<button onClick={()=>setChoose(true)}>{t('choose')}</button>}{choose&&<TargetChooser face={face} t={t} close={()=>setChoose(false)}/>}</article>
}

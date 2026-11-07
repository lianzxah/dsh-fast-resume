/** Full editor resource body and explicitly invoked Session header opener. */
import {ReviewControls,TargetChooser,type ReviewFace} from './resume-review-ui.tsx'
import React,{useCallback,useEffect,useMemo,useRef,useState,useSyncExternalStore} from 'react'
import {FileText,LoaderCircle} from 'lucide-react'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {InjectFace,PropsRuntime,PropsLocale,HostObservable} from '@deepseek-ai/dsh-client-ui-slots'
import type {SessionId} from '@deepseek-ai/dsh-session/types'
import type {ResumeId,ResumeContextResult,EditorLaunch} from '../types.ts'
import type {ISessions} from '@deepseek-ai/dsh-api-session-controller/client'
import type {UiConversation} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {ChatSnapshot} from '@deepseek-ai/dsh-client-ui-chat/client'
import {ResumeActivityTracker,type ResumeActivity} from './resume-activity.ts'
import type {AssistantOpen} from './session-handoff.ts'
import type {RetainedEditorHandoff} from './editor-handoff.ts'
import type {EditorViews} from './editor-views.ts'
import {EditorSurface} from './frame.tsx'
import {parseResumeAddress,resumeAddress} from './resume-resource.ts'

declare module '@deepseek-ai/dsh-client-ui-sidebar-right/client' {interface SidebarRightResourceParamsMap {'fast-resume':{fastResume:{handoff?:RetainedEditorHandoff}}}}
export interface ResumeTabFace {review?:ReviewFace;views:EditorViews;library:()=>void;hidden?:(sessionId:SessionId)=>void}
export type ResumeTabProps=Pick<PropsRuntime<'sidebar.right.pane.tab'>,'sessionId'|'useTabInfo'>&PropsLocale<'fastResume'>&InjectFace<ResumeTabFace>
/** Keep the iframe identity stable through visibility, fullscreen and docking changes. */
export function ResumeTab({useTabInfo,sessionId,views,library,hidden,t,review}:ResumeTabProps){
 const {tab}=useTabInfo(),id=parseResumeAddress(tab.navigation.address)
 const params=tab.navigation.params,incoming=params&&'fastResume' in params?params.fastResume.handoff:undefined
 const received=useRef<{id:ResumeId|undefined;sessionId:SessionId;handoff?:RetainedEditorHandoff}>()
 if(!received.current||received.current.id!==id||received.current.sessionId!==sessionId||(incoming&&JSON.stringify(incoming)!==JSON.stringify(received.current.handoff)))received.current={id,sessionId,handoff:incoming}
 const handoff=received.current.handoff
 const launch=useMemo<EditorLaunch|undefined>(()=>id?{resumeId:id,sessionId,source:'conversation'}:undefined,[id,sessionId])
 const navigation=useRef(tab.actions);navigation.current=tab.actions
 const navigate=useCallback((nextId?:ResumeId)=>{if(nextId!==id)hidden?.(sessionId);if(nextId)navigation.current.openResource(resumeAddress(nextId),{replaceTab:true});else library()},[library,hidden,sessionId,id])
 const [consumed,setConsumed]=useState<{expected:RetainedEditorHandoff;signal:AbortSignal}>()
 const consume=useCallback((completed:RetainedEditorHandoff)=>{if(handoff&&handoff.resumeId===completed.resumeId&&handoff.transferId===completed.transferId&&handoff.checkpointId===completed.checkpointId&&handoff.revision===completed.revision)setConsumed({expected:handoff,signal:tab.signal})},[handoff,tab.signal])
 useEffect(()=>{if(!consumed)return;setConsumed(undefined);if(tab.signal!==consumed.signal||tab.signal.aborted||id!==consumed.expected.resumeId||JSON.stringify(incoming)!==JSON.stringify(consumed.expected))return;tab.actions.openResource(resumeAddress(id),{params:{fastResume:{}}})},[consumed,incoming,id,tab.signal,tab.actions])
 const face=useMemo(()=>views.face(launch,handoff,navigate,consume),[views,launch,handoff,navigate,consume])
 const [closed,setClosed]=useState(tab.signal.aborted)
 useEffect(()=>{setClosed(tab.signal.aborted);const close=()=>{face.dispose();setClosed(true)};tab.signal.addEventListener('abort',close,{once:true});return()=>{tab.signal.removeEventListener('abort',close);face.dispose()}},[tab.signal,face])
 useEffect(()=>{face.setVisible(tab.visible);if(!tab.visible)hidden?.(sessionId)},[face,tab.visible,hidden,sessionId])
 useEffect(()=>{const close=()=>hidden?.(sessionId);tab.signal.addEventListener('abort',close);return()=>tab.signal.removeEventListener('abort',close)},[tab.signal,hidden,sessionId])
 if(!id)return <p role="alert">{t('invalidResource')}</p>
 return closed?null:<div style={{position:'relative',height:'100%'}}><EditorSurface {...face} t={t}/>{review&&<ReviewControls id={id} face={review} t={t}/>}</div>
}
/** Public root observer for an explicit entry; blank Sessions omit title actions. */
export interface AssistantMountFace {pending:()=>AssistantOpen|undefined;subscribePending:(listener:()=>void)=>()=>void;mounted:HostObservable<SessionId|undefined>;open:(entry:AssistantOpen)=>void}
/** Open only the pending entry after the right Session surface commits; render no replacement chrome. */
export function AssistantMount({pending,subscribePending,mounted,open}:AssistantMountFace){
 const incoming=useSyncExternalStore(subscribePending,pending),sessionId=useSyncExternalStore(mounted.subscribe,mounted.getSnapshot),opened=useRef<string>()
 useEffect(()=>{if(incoming&&sessionId===incoming.sessionId&&mounted.getSnapshot()===incoming.sessionId&&opened.current!==incoming.handoff.transferId){open(incoming);opened.current=incoming.handoff.transferId}},[incoming,sessionId,mounted,open])
 return null
}
export interface ResumeHeaderFace {
 review?:ReviewFace
 activity?:HostObservable<ResumeActivity|undefined>
 viewFailure?:HostObservable<string|undefined>
 views?:EditorViews
 resolve:()=>Promise<ResumeContextResult>
 open:(id:ResumeId,handoff?:RetainedEditorHandoff)=>void
 pending?:()=>AssistantOpen|undefined
 subscribePending?:(listener:()=>void)=>()=>void
 mounted:()=>SessionId|undefined
 hooks:{sidebarMounted:HostObservable<SessionId|undefined>}
}
export type ResumeHeaderProps=Pick<PropsRuntime<'conversation.session.header.actions'>,'sessionId'>&PropsLocale<'fastResume'>&InjectFace<ResumeHeaderFace>
const noPending=()=>undefined,noSubscribe=()=>()=>{}
/** Resolve historical bindings only on click; explicit entries open after the matching Session commits. */
export function ResumeHeader({sessionId,resolve,open,mounted,useSidebarMounted,t,activity,views,viewFailure,review,pending:readPending=noPending,subscribePending=noSubscribe}:ResumeHeaderProps){
 const [choose,setChoose]=useState(false)
 const incoming=useSyncExternalStore(subscribePending,readPending),opened=useRef<string>()
 const latest=useSyncExternalStore(activity?.subscribe??noSubscribe,activity?.getSnapshot??noPending)
 const failure=useSyncExternalStore(viewFailure?.subscribe??noSubscribe,viewFailure?.getSnapshot??noPending)
 const loaded=useSyncExternalStore(views?.subscribeLoaded??noSubscribe,views?.loadedSnapshot??noPending)
 const viewLoaded=latest?.target&&loaded?.some(value=>value.sessionId===sessionId&&value.resumeId===latest.target?.resumeId&&value.revision===latest.target.revision)
 const status=latest&&(latest.phase==='saved'&&viewLoaded?'loaded':latest.phase)
 const selected=useSidebarMounted(value=>value===sessionId),[pending,setPending]=useState(false),[requested,setRequested]=useState<ResumeId>(),[error,setError]=useState(''),generation=useRef(0)
 useEffect(()=>{generation.current++;setRequested(undefined);setPending(false);return()=>{generation.current++}},[sessionId,selected])
 useEffect(()=>{if(incoming?.sessionId===sessionId&&selected&&mounted()===sessionId&&opened.current!==incoming.handoff.transferId){opened.current=incoming.handoff.transferId;try{open(incoming.resumeId,incoming.handoff)}catch(error){setError(error instanceof Error?error.message:String(error))}}},[incoming,selected,mounted,sessionId,open])
 useEffect(()=>{if(requested&&selected&&mounted()===sessionId){try{open(requested)}catch(error){setError(error instanceof Error?error.message:String(error))}setRequested(undefined)}},[requested,selected,mounted,sessionId,open])
 return <span style={{display:'inline-flex',alignItems:'center',gap:6,position:'relative'}}>{choose&&review&&<TargetChooser face={review} t={t} close={()=>setChoose(false)}/ >}{failure&&!viewLoaded&&<span role="alert" title={failure}>{t('viewUnavailable')}</span>}{status&&<span role="status" style={{fontSize:12,color:'var(--dsh-text-secondary,inherit)'}}>{t(status)}</span>}<button type="button" title={t('openResume')} aria-label={t('openResume')} disabled={pending||!selected} aria-busy={pending} onClick={()=>{
  const request=++generation.current;setPending(true);setError('')
  void resolve().then(result=>{if(request!==generation.current||mounted()!==sessionId)return;if(result.state==='bound')setRequested(result.context.resumeId);else if(review)setChoose(true);else setError(t('unbound'))},error=>{if(request===generation.current)setError(error instanceof Error?error.message:String(error))}).finally(()=>{if(request===generation.current)setPending(false)})
 }} style={{display:'inline-flex',alignItems:'center',justifyContent:'center',width:28,height:28,border:0,borderRadius:6,background:'transparent',color:'inherit',cursor:'pointer'}}>{pending?<LoaderCircle size={16} aria-hidden="true"/>:<FileText size={16} aria-hidden="true"/>}</button>{error&&<span role="alert" style={{position:'absolute',top:'100%',right:0,zIndex:10,padding:12,width:250,borderRadius:8,background:'var(--dsh-color-surface, #24242a)',color:'var(--dsh-color-text, white)',boxShadow:'0 6px 24px #0003',fontSize:12}}>{error}<button type="button" onClick={()=>setError('')} aria-label={t('close')}>×</button></span>}</span>
}

/** Root subscription remains mounted when an empty Session omits its header. */
export interface ResumeActivityMountFace {
 mounted:HostObservable<SessionId|undefined>
 sessions:Pick<ISessions,'binding'|'list'>
 conversation:Pick<UiConversation,'binding'>
 tracker:ResumeActivityTracker
}
/** Subscribe only through the public binding and Chat target, before any first-prompt header paints. */
export function ResumeActivityMount({mounted,sessions,conversation,tracker}:ResumeActivityMountFace){
 const sessionId=useSyncExternalStore(mounted.subscribe,mounted.getSnapshot)
 const catalog=useSyncExternalStore(sessions.list.subscribe,sessions.list.getSnapshot)
 const binding=sessionId?sessions.binding(sessionId):undefined
 useEffect(()=>{
  if(!binding||!sessionId)return
  const bound=conversation.binding(binding),target=bound.target('chat')
  let nodes:ChatSnapshot['nodes']|undefined,stopTurnData=()=>{},turn:number|undefined,baseline=true,watermark=-1
  const collect=(activities:readonly ResumeActivity[])=>{watermark=Math.max(watermark,...activities.map(activity=>activity.seq));tracker.observe(sessionId,activities,watermark,mounted.getSnapshot()===sessionId)}
  const selectTurn=()=>{
   const next=bound.openTurn.getSnapshot()??target.getSnapshot()?.timeline.turnOrder.at(-1);if(next===undefined||next===turn||!nodes)return
   turn=next;stopTurnData();tracker.beginTurn(sessionId,next)
   const source=nodes.turnDataSource(next,'resume-activity')
   const changed=()=>collect(source.getSnapshot())
   stopTurnData=source.subscribe(changed);changed()
  }
  const read=()=>{
   if(binding.session.getSnapshot().openState!=='open'){tracker.leave(sessionId);baseline=true;return}
   const snapshot=target.getSnapshot();if(!snapshot)return
   if(baseline||snapshot.nodes!==nodes){
    baseline=false;nodes=snapshot.nodes;turn=undefined;stopTurnData();tracker.leave(sessionId)
    const values=nodes.values(),activities=values.filter(node=>node.kind==='resume-activity').map(node=>node.data as ResumeActivity)
    watermark=Math.max(-1,...values.map(node=>node.anchorSeq),...activities.map(activity=>activity.seq));collect(activities)
   }
   selectTurn()
  }
  const stopTarget=target.subscribe(read),stopSession=binding.session.subscribe(read),stopTurn=bound.openTurn.subscribe(selectTurn);read()
  return()=>{stopTarget();stopSession();stopTurn();stopTurnData();tracker.leave(sessionId)}
 },[binding,sessionId,conversation,tracker,mounted])
 void catalog
 return null
}

/** Minimal public navigation face used by every explicit and automatic reveal. */
type ResumeSidebar=Pick<import('@deepseek-ai/dsh-client-ui-sidebar-right/client').ISidebarRight,'mounted'|'isExpanded'|'active'|'openResource'>
/** Open the exact resource only in its mounted Session, deduplicating an already selected document.
 * @param sidebar Public right-pane controller.
 * @param sessionId Actual invoking Session.
 * @param id Selected document.
 * @param handoff Optional explicit retained editor transfer.
 */
export function revealResume(sidebar:ResumeSidebar,sessionId:SessionId,id:ResumeId,handoff?:RetainedEditorHandoff):void{
 if(sidebar.mounted.getSnapshot()!==sessionId)return
 if(!handoff&&sidebar.isExpanded()&&sidebar.active()?.contentId===resumeAddress(id))return
 sidebar.openResource(resumeAddress(id),handoff?{params:{fastResume:{handoff}}}:undefined)
}
/** Recheck current binding and user navigation after the context read completes.
 * @param activity Validated logged target evidence.
 * @param valid Foreground batch and navigation generation check.
 * @param face Public navigation, current context lookup and responsive rule.
 * @returns Whether the resource was revealed; narrow screens retain status and the explicit header action.
 */
export async function revealResumeActivity(activity:ResumeActivity,valid:()=>boolean,face:{sidebar:ResumeSidebar;resolve:(sessionId:SessionId)=>Promise<ResumeContextResult>;wide:()=>boolean}):Promise<boolean>{
 const sessionId=face.sidebar.mounted.getSnapshot(),target=activity.target
 if(!sessionId||!target||!face.wide()||!valid())return false
 const current=await face.resolve(sessionId)
 if(face.wide()&&valid()&&current.state==='bound'&&current.context.sessionId===sessionId&&current.context.resumeId===target.resumeId){revealResume(face.sidebar,sessionId,target.resumeId);return true}
 return false
}

/** Serial, modal-owned rendering of immutable saved versions; no active editor state is read or written. */
import type {HistoryView,ResumeId,ResumeSnapshot,ResumeVersionId} from '../types.ts'
type Version=HistoryView['versions'][number]
/** Exact immutable snapshot and its rendered page. */
export interface VersionPreview {snapshot:ResumeSnapshot;url:string}
/** Race a non-cancellable bridge read against the preview owner's deadline. */
function untilAborted<T>(work:Promise<T>,signal:AbortSignal):Promise<T>{
 return new Promise((resolve,reject)=>{
  const abort=()=>reject(signal.reason)
  if(signal.aborted){reject(signal.reason);return}
  signal.addEventListener('abort',abort,{once:true})
  work.then(value=>{signal.removeEventListener('abort',abort);resolve(value)},error=>{signal.removeEventListener('abort',abort);reject(error)})
 })
}
/** Owns a bounded serial render queue for one history modal. */
export class VersionPreviewQueue {
 private owner=new AbortController()
 private tail=Promise.resolve()
 constructor(private read:(id:ResumeId,versionId:ResumeVersionId)=>Promise<ResumeSnapshot>,private render:(snapshot:ResumeSnapshot,signal:AbortSignal,page:number,width:number)=>Promise<string>,private timeoutMs:number){}
 /** Read a version and render only the requested page. Obsolete reads cannot start rendering.
  * @param id Resume owning the saved version.
  * @param version Immutable version identity and revision.
  * @param signal Visibility, selection, retry or modal lifetime.
  * @param page Zero-based page index.
  * @param width Maximum preview width in pixels.
  * @returns Validated saved snapshot and its rendered page URL.
  */
 request(id:ResumeId,version:Version,signal:AbortSignal,page=0,width=384):Promise<VersionPreview>{
  const deadline=new AbortController(),combined=AbortSignal.any([this.owner.signal,signal,deadline.signal])
  const result=this.tail.then(async()=>{
   combined.throwIfAborted()
   const timer=setTimeout(()=>deadline.abort(new Error('Version preview timed out')),this.timeoutMs)
   try{
    const snapshot=await untilAborted(this.read(id,version.id),combined);combined.throwIfAborted()
    if(snapshot.id!==id||snapshot.revision!==version.revision)throw Error('Version preview revision does not match')
    const url=await this.render(snapshot,combined,page,width);combined.throwIfAborted()
    return {snapshot,url}
   }finally{clearTimeout(timer)}
  })
  this.tail=result.then(()=>{},()=>{})
  return result
 }
 /** Abort all visible/queued work and join its cancellation. */
 dispose():Promise<void>{this.owner.abort();return this.tail}
}

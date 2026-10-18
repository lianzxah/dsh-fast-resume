/** Pure library ordering and one owned, serial queue of visible first-page previews. */
import type {ResumeId,ResumeSnapshot,ResumeSummary} from '../types.ts'
export type LibraryOrder='recent'|'oldest'|'title'
/** Filter by title and order a detached list without changing the Host summary order.
 * @param documents Saved document summaries.
 * @param query Case-insensitive title search.
 * @param order Selected ordering.
 * @returns A separately ordered result list.
 */
export function selectDocuments(documents:ResumeSummary[],query:string,order:LibraryOrder):ResumeSummary[]{
 const needle=query.trim().toLocaleLowerCase()
 return documents.filter(item=>item.title.toLocaleLowerCase().includes(needle)).sort((a,b)=>order==='title'?a.title.localeCompare(b.title):((order==='recent'?-1:1)*(Date.parse(a.updatedAt)-Date.parse(b.updatedAt))||a.id.localeCompare(b.id)))
}
/** A changed revision cannot be represented as the requested card preview. */
export class StalePreviewError extends Error{}
/** Owns serial rendering; cancellation prevents queued reads and discards obsolete results. */
export class PreviewQueue {
 private abort=new AbortController()
 private tail=Promise.resolve()
 constructor(private read:(id:ResumeId)=>Promise<ResumeSnapshot>,private render:(snapshot:ResumeSnapshot,signal:AbortSignal)=>Promise<string>,private timeoutMs:number){}
 /** Request the exact visible card revision; callers own display of failures.
  * @param summary Requested saved revision.
  * @param signal Card visibility/revision lifetime.
  * @returns First-page data URL, rejecting obsolete or cancelled work.
  */
 request(summary:ResumeSummary,signal:AbortSignal):Promise<string>{
  const controller=new AbortController(),combined=AbortSignal.any([signal,this.abort.signal,controller.signal])
  const result=this.tail.then(async()=>{
   combined.throwIfAborted()
   const timer=setTimeout(()=>controller.abort(new Error('Preview timed out')),this.timeoutMs)
   try{
    const snapshot=await this.read(summary.id);combined.throwIfAborted()
    if(snapshot.id!==summary.id||snapshot.revision!==summary.revision)throw new StalePreviewError()
    const url=await this.render(snapshot,combined);combined.throwIfAborted();return url
   }finally{clearTimeout(timer)}
  })
  // Each requester reports its own failure; the queue must admit the next visible card.
  this.tail=result.then(()=>{},()=>{})
  return result
 }
 /** Stop queued admission, abort rendering, and join the current request. */
 dispose():Promise<void>{this.abort.abort();return this.tail}
}

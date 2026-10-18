/** First-page thumbnails share the retained export renderer without writing editor state. */
import {parseResumeBackup,mmToPx} from '@resume-editor/shared'
import {renderPageToDataURL} from '@resume-editor/canvas-engine'
import type {ResumeSnapshot} from '../types.ts'
/** Render one committed first page at card resolution.
 * @param snapshot Exact saved revision.
 * @param signal Visibility and queue-owner cancellation.
 * @returns Data URL for the first page only.
 */
export async function renderThumbnail(snapshot:ResumeSnapshot,signal:AbortSignal):Promise<string>{
 return renderSavedPage(snapshot,signal,0,384)
}
/** Render one immutable saved page without changing the active editor.
 * @param snapshot Saved document contents.
 * @param signal Render lifetime and deadline.
 * @param index Zero-based page to render.
 * @param width Maximum pixel width.
 * @returns Data URL released when the owning view discards it.
 */
export async function renderSavedPage(snapshot:ResumeSnapshot,signal:AbortSignal,index:number,width:number):Promise<string>{
 signal.throwIfAborted()
 const doc=parseResumeBackup(snapshot.documentJson).document,page=doc.pages[index]
 if(!page)throw Error('Saved preview page is unavailable')
 const config={...doc.pageConfig,...page.config}
 await new Promise<void>((resolve,reject)=>{
  const abort=()=>reject(signal.reason);signal.addEventListener('abort',abort,{once:true})
  document.fonts.ready.then(()=>{signal.removeEventListener('abort',abort);resolve()},error=>{signal.removeEventListener('abort',abort);reject(error)})
 })
 signal.throwIfAborted()
 return renderPageToDataURL(page,config,{pixelRatio:Math.min(1,width/mmToPx(config.width,config.dpi)),failOnImageError:true,signal})
}

/** Render an immutable Host job with the original engine after font and image readiness. */
import { parseResumeBackup, type ResumeElement } from '@resume-editor/shared'
import { exportDocumentToPDF, renderPageToDataURL } from '@resume-editor/canvas-engine'
import type { RenderJob } from '../types.ts'
import { encodeBytes } from './api.ts'
/** Readiness errors fail export rather than silently emitting missing pictures. */
async function readyImages(elements:ResumeElement[]):Promise<void>{await Promise.all(elements.map(async element=>{if(!element.visible)return;if(element.type==='group')return readyImages(element.children);if(element.type!=='image'||!element.src)return;await new Promise<void>((resolve,reject)=>{const image=new Image();image.crossOrigin='anonymous';image.onload=()=>{if(image.naturalWidth>0)resolve();else reject(Error('Image is empty'))};image.onerror=()=>reject(Error('An image could not be loaded. Replace it before exporting.'));image.src=element.src})}))}
/** Produces actual bytes at job.pixelRatio; caller destroys the frame on cancellation/deadline. */
export async function renderJob(job:RenderJob):Promise<string>{
 const doc=parseResumeBackup(job.documentJson).document
 await document.fonts.ready
 await Promise.all(doc.pages.map(page=>readyImages(page.elements)))
 if(Date.now()>=job.deadline)throw Error('Render deadline exceeded')
 if(job.format==='pdf'){
  const bytes=await exportDocumentToPDF(doc,'resume.pdf',{pixelRatio:job.pixelRatio,returnBytes:true,failOnImageError:true})
  if(!(bytes instanceof Uint8Array))throw Error('PDF bytes missing')
  return encodeBytes(bytes)
 }
 const page=job.pageId?doc.pages.find(page=>page.id===job.pageId):doc.pages[0]
 if(!page)throw Error('Requested page no longer exists')
 const url=await renderPageToDataURL(page,{...doc.pageConfig,...page.config},{pixelRatio:job.pixelRatio,failOnImageError:true})
 return url.slice(url.indexOf(',')+1)
}

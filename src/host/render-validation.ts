/** Maintained binary decoders verify renderer output against the committed page geometry. */
import { PNG } from 'pngjs'
import { mmToPx, pxToMm } from '../../upstream/shared/src/utils/units.ts'
import type { RenderJob, ResumeDocument, PageConfig } from '../types.ts'
import { validateDocument, decodeJson } from './operations.ts'
import { ResumeError } from './errors.ts'
/** Verified encoded bytes and dimensions read from the produced artifact. */
export interface RenderedBinary {bytes:Uint8Array;pageCount:number;width:number;height:number;dimensionUnit:'mm'|'px'}
const PNG_SIGNATURE=Buffer.from([137,80,78,71,13,10,26,10])
// PDF page coordinates are rounded by the retained jsPDF exporter.
const PDF_DIMENSION_TOLERANCE_MM=0.1
function geometry(document:ResumeDocument,pageIndex:number):PageConfig{return{...document.pageConfig,...document.pages[pageIndex].config}}
/** Decode full binary structure and compare page counts/dimensions before admitting bytes.
 * @param bytes Size-bounded encoded renderer response.
 * @param job Exact immutable render request, including pixel ratio.
 * @param maxBytes Configured document input bound.
 * @param maxPixels Configured decoded raster pixel bound.
 * @returns Bytes with actual decoded artifact metadata.
 */
export async function validateRenderedBinary(bytes:Uint8Array,job:RenderJob,maxBytes:number,maxPixels:number):Promise<RenderedBinary>{
 try{
  const document=validateDocument(decodeJson(job.documentJson),maxBytes)
  if(job.format==='png'){
   const pageIndex=job.pageId===undefined?0:document.pages.findIndex(page=>page.id===job.pageId)
   if(pageIndex<0)throw new ResumeError('invalid-input','Selected PNG page does not exist')
   const page=geometry(document,pageIndex)
   const expectedWidth=Math.floor(Math.round(mmToPx(page.width,page.dpi))*job.pixelRatio)
   const expectedHeight=Math.floor(Math.round(mmToPx(page.height,page.dpi))*job.pixelRatio)
   const buffer=Buffer.from(bytes)
   if(buffer.length<33||!buffer.subarray(0,8).equals(PNG_SIGNATURE))throw new ResumeError('invalid-input','Renderer response is not a complete PNG')
   const width=buffer.readUInt32BE(16);const height=buffer.readUInt32BE(20)
   // Reject untrusted allocation dimensions before invoking the full decoder.
   if(width!==expectedWidth||height!==expectedHeight||width*height>maxPixels)throw new ResumeError('invalid-input','PNG dimensions differ from the committed page or exceed the raster pixel limit')
   const decoded=PNG.sync.read(buffer,{checkCRC:true})
   if(decoded.width!==expectedWidth||decoded.height!==expectedHeight)throw new ResumeError('invalid-input','Decoded PNG dimensions differ from the committed page')
   return{bytes,pageCount:1,width:decoded.width,height:decoded.height,dimensionUnit:'px'}
  }
  if(Buffer.from(bytes).subarray(0,5).toString()!=='%PDF-')throw new ResumeError('invalid-input','Renderer response is not PDF')
  const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs')
  const task=getDocument({data:Uint8Array.from(bytes),useWorkerFetch:false,stopAtErrors:true})
  try{
   const pdf=await task.promise
   if(pdf.numPages!==document.pages.length)throw new ResumeError('invalid-input','PDF page count differs from the committed document')
   let firstWidth=0;let firstHeight=0
   for(let index=0;index<pdf.numPages;index++){
    const page=await pdf.getPage(index+1);const viewport=page.getViewport({scale:1})
    const width=pxToMm(viewport.width,72);const height=pxToMm(viewport.height,72);const config=geometry(document,index)
    const expectedWidth=config.orientation==='landscape'?Math.max(config.width,config.height):Math.min(config.width,config.height)
    const expectedHeight=config.orientation==='landscape'?Math.min(config.width,config.height):Math.max(config.width,config.height)
    if(Math.abs(width-expectedWidth)>PDF_DIMENSION_TOLERANCE_MM||Math.abs(height-expectedHeight)>PDF_DIMENSION_TOLERANCE_MM)throw new ResumeError('invalid-input','PDF page dimensions differ from the committed page')
    if(index===0){firstWidth=width;firstHeight=height}
   }
   return{bytes,pageCount:pdf.numPages,width:firstWidth,height:firstHeight,dimensionUnit:'mm'}
  }finally{await task.destroy()}
 }catch(error){if(error instanceof ResumeError)throw error;throw new ResumeError('invalid-input',`Renderer output could not be decoded: ${error instanceof Error?error.message:String(error)}`)}
}

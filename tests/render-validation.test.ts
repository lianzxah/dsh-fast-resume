import {resumeIdSchema,resumeRevisionSchema} from '../src/identity.ts'
const rid=resumeIdSchema.parse.bind(resumeIdSchema),rv=resumeRevisionSchema.parse.bind(resumeRevisionSchema)
import { describe,it,expect } from 'vitest'
import { PNG } from 'pngjs'
import { jsPDF } from 'jspdf'
import { RenderQueue } from '../src/host/render-queue.ts'
import { newDocument } from '../src/host/operations.ts'
import type { RenderJob } from '../src/types.ts'

const limits={timeoutMs:3000,leaseMs:5000,maxRequests:2,maxBytes:1048576,maxPixels:1000000}
function request(format:'pdf'|'png',pages=1):Omit<RenderJob,'id'|'deadline'>{
 const document=newDocument('Export verification');document.pageConfig={...document.pageConfig,width:25.4,height:50.8,dpi:10}
 if(pages===2)document.pages.push({id:rid('second-page'),pageNumber:2,elements:[],config:{width:50.8,height:25.4,orientation:'landscape'}})
 return{resumeId:rid(document.id),revision:rv(1),documentJson:JSON.stringify(document),format,pixelRatio:2}
}
function png(width=20,height=40):Buffer{return PNG.sync.write(new PNG({width,height}))}
function pdf(pages=1,width=25.4,height=50.8):Uint8Array{
 const document=new jsPDF({unit:'mm',format:[width,height],orientation:'portrait'})
 if(pages===2)document.addPage([50.8,25.4],'landscape')
 return new Uint8Array(document.output('arraybuffer'))
}
async function complete(input:Omit<RenderJob,'id'|'deadline'>,bytes:Uint8Array){
 const queue=new RenderQueue(limits);const renderer=queue.register();const pending=queue.request(input)
 const job=queue.poll(renderer.rendererId)!
 const accepted=queue.complete({rendererId:renderer.rendererId,jobId:job.id,dataBase64:Buffer.from(bytes).toString('base64')})
 try{return await Promise.all([pending,accepted]).then(([rendered])=>rendered)}finally{queue.dispose()}
}
describe('decoded renderer artifacts',()=>{
 it.each(['pdf','png'] as const)('rejects a truncated %s header without yielding render bytes',async format=>{
  const bytes=format==='pdf'?Buffer.from('%PDF-'):Buffer.from([137,80,78,71,13,10,26,10])
  await expect(complete(request(format),bytes)).rejects.toMatchObject({code:'invalid-input'})
 })
 it('rejects complete PDFs with wrong page count or any wrong page dimension',async()=>{
  await expect(complete(request('pdf',2),pdf(1))).rejects.toMatchObject({code:'invalid-input'})
  await expect(complete(request('pdf'),pdf(1,30,60))).rejects.toMatchObject({code:'invalid-input'})
  const wrongSecond=new jsPDF({unit:'mm',format:[25.4,50.8]});wrongSecond.addPage([40,25.4],'landscape')
  await expect(complete(request('pdf',2),new Uint8Array(wrongSecond.output('arraybuffer')))).rejects.toMatchObject({code:'invalid-input'})
 })
 it('rejects PNG dimensions that differ from page pixels times the agreed pixel ratio',async()=>{
  await expect(complete(request('png'),png(10,20))).rejects.toMatchObject({code:'invalid-input'})
  const corrupt=png();corrupt[29]^=1
  await expect(complete(request('png'),corrupt)).rejects.toMatchObject({code:'invalid-input'})
 })
 it('returns actual decoded PNG pixels and every PDF page with millimeter dimensions',async()=>{
  const image=await complete(request('png'),png())
  expect({width:image.width,height:image.height,pageCount:image.pageCount,unit:image.dimensionUnit}).toEqual({width:20,height:40,pageCount:1,unit:'px'})
  const document=await complete(request('pdf',2),pdf(2))
  expect(document.pageCount).toBe(2);expect(document.width).toBeCloseTo(25.4,2);expect(document.height).toBeCloseTo(50.8,2);expect(document.dimensionUnit).toBe('mm')
 })
})

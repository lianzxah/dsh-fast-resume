/** Model-visible image references resolve only against the exact committed base. */
import {describe,it,expect} from 'vitest'
import {Context} from '@deepseek-ai/cordis'
import {mkdtemp,readFile,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {PNG} from 'pngjs'
import {FastResumeService} from '../../src/host/index.ts'
import {projectDocumentForModel} from '../../src/host/tools.ts'
import {createImageElement} from '../../upstream/canvas-engine/src/element-factory.ts'
import {parseResumeBackup} from '../../upstream/shared/src/index.ts'
import {resumeRevisionSchema} from '../../src/identity.ts'
import type {ResumeDocument,ResumeElement} from '../../src/types.ts'
describe('document-local image references',()=>{
 it('copies nested projected images, updates sources and exports the original image bytes',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'resume-assets-')),ctx=new Context();ctx.provide('profileContext',{dir:directory})
  try{
   const service=new FastResumeService(ctx,{storageDir:directory}),initial=await service.create({title:'Portrait'})
   const pixels=new PNG({width:1,height:1});pixels.data.set([20,80,180,255]);const bytes=PNG.sync.write(pixels),src=`data:image/png;base64,${bytes.toString('base64')}`
   const image=createImageElement({id:'portrait',src}),document:ResumeDocument=JSON.parse(initial.documentJson);document.pages[0].elements=[image];document.resumeData={personalInfo:{name:'Candidate',avatar:src},experience:[],education:[],skills:[],projects:[],certifications:[],customSections:[]}
   const base=await service.save({id:initial.id,expectedRevision:initial.revision,documentJson:JSON.stringify(document)})
   const read=await service.read(base.id),saved:ResumeDocument=JSON.parse(read.documentJson),modelDocument=projectDocumentForModel(saved),projected=modelDocument.pages[0].elements[0]
   expect(JSON.stringify(modelDocument)).not.toContain(bytes.toString('base64'));expect(projected.type==='image'&&projected.src).toBe('resume-asset:portrait')
   const group:ResumeElement={...image,id:'group',type:'group',children:[{...projected,id:'copied'}]}
   const proposal=await service.propose({id:base.id,expectedRevision:base.revision,requestId:'copy',summary:'Copy portrait',operationsJson:JSON.stringify([{type:'element.insert',pageId:saved.pages[0].id,element:group},{type:'element.update',elementId:'portrait',patch:{src:'resume-asset:portrait'}},{type:'semantic.replace',resumeData:modelDocument.resumeData,relayout:false}])})
   await service.applyProposal({id:base.id,proposalId:proposal.id,requestId:'apply'})
   const receipt=await service.exportDocument({id:base.id,expectedRevision:resumeRevisionSchema.parse(base.revision+1),format:'json'},new AbortController().signal)
   const exported=parseResumeBackup(await readFile(receipt.artifactPath,'utf8')).document
   const copied=exported.pages[0].elements.find(element=>element.id==='group')
   expect(copied?.type==='group'&&copied.children[0].type==='image'&&copied.children[0].src).toBe(src)
   expect(exported.pages[0].elements[0].type==='image'&&exported.pages[0].elements[0].src).toBe(src)
   expect(exported.resumeData?.personalInfo.avatar).toBe(src)
   const decoded=PNG.sync.read(Buffer.from(src.split(',')[1],'base64'));expect([...decoded.data]).toEqual([20,80,180,255])
   const before=await service.read(base.id),history=await service.history(base.id)
   await expect(service.propose({id:base.id,expectedRevision:before.revision,requestId:'unknown',summary:'Missing image',operationsJson:JSON.stringify([{type:'element.update',elementId:'portrait',patch:{src:'resume-asset:missing'}}])})).rejects.toMatchObject({code:'FAST_RESUME_ERROR',details:{code:'invalid-input'}})
   expect(await service.read(base.id)).toEqual(before);expect(await service.history(base.id)).toEqual(history)
  }finally{await ctx.fiber.dispose();await rm(directory,{recursive:true,force:true})}
 })
})

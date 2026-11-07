/** Seeds and verifies synthetic baseline fixtures in this checkout's dedicated QA home. */
import assert from 'node:assert/strict'
import {mkdir,readFile,realpath,writeFile} from 'node:fs/promises'
import {basename,dirname,join,resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import {ResumeStore,resolveConfig} from '../src/host/store.ts'
import {createTextElement,createImageElement,createShapeElement} from '../upstream/canvas-engine/src/element-factory.ts'
import {serializeResumeBackup,mmToPx} from '../upstream/shared/src/index.ts'
import {jsPDF} from 'jspdf'
import {PNG} from 'pngjs'

const root=await realpath(process.cwd())
assert.equal(root,await realpath(fileURLToPath(new URL('..',import.meta.url))),'Run from the plugin checkout')
assert.equal(JSON.parse(await readFile(join(root,'package.json'),'utf8')).name,'dsh-fast-resume','Unexpected package')
const home=resolve(root,process.env.DSH_QA_HOME??'.dev/qa-home')
assert.equal(dirname(home),join(root,'.dev'),'QA home must be a direct child of this checkout .dev')
assert.match(basename(home),/^qa-[a-zA-Z0-9][a-zA-Z0-9_-]*$/,'QA home must be named qa-*')
await mkdir(join(root,'.dev'),{recursive:true})
assert.equal(await realpath(join(root,'.dev')),join(root,'.dev'),'QA parent must not be a symlink outside the checkout')
await mkdir(home,{recursive:true})
assert.equal(await realpath(home),home,'QA home must not be a symlink')
const profile=join(home,'profiles/web'),output=join(root,'.artifacts/assistant-stage0',basename(home))
const store=new ResumeStore(resolveConfig(profile,{}))
assert(!(await store.list()).some(item=>item.title==='Stage0 Rich Fixture'),'Refusing to overwrite an existing named fixture; choose a fresh DSH_QA_HOME')
await mkdir(output,{recursive:true})
const png=new PNG({width:2,height:2})
png.data.set([30,100,200,255,30,100,200,255,30,100,200,255,30,100,200,255])
const imageBytes=PNG.sync.write(png),decoded=PNG.sync.read(imageBytes,{checkCRC:true})
assert.equal(decoded.width,2);assert.equal(decoded.height,2);assert.deepEqual(decoded.data,png.data)
const src=`data:image/png;base64,${imageBytes.toString('base64')}`
await writeFile(join(output,'portrait.png'),imageBytes)
const initial=await store.create({title:'Stage0 Rich Fixture',templateId:'template-classic'})
const document=JSON.parse(initial.documentJson)
const text=createTextElement({name:'QA grouped text',content:'Synthetic grouped text',left:0,top:0,width:200,height:40})
const image=createImageElement({name:'QA grouped image',left:220,top:0,width:50,height:50,src})
const group={...text,id:'qa-group',name:'QA group',type:'group',left:80,top:650,width:300,height:80,children:[text,image]}
const shape=createShapeElement('rectangle',{name:'QA rectangle',left:80,top:730,width:100,height:40})
const rootImage=createImageElement({name:'QA root image',left:80,top:820,width:80,height:80,src})
document.pages[0].elements.push(group,shape,rootImage)
document.pages.push({...structuredClone(document.pages[0]),id:'qa-second-page',pageNumber:2,elements:[createTextElement({content:'Synthetic second page',name:'QA page 2'})]})
await store.save({id:initial.id,expectedRevision:initial.revision,documentJson:JSON.stringify(document),versionName:'Stage0 rich checkpoint'})
await writeFile(join(output,'rich.json'),serializeResumeBackup(document))
const pdf=new jsPDF();pdf.text('Synthetic QA Candidate',20,20);pdf.text('Reduced build time by 30 percent',20,40)
await writeFile(join(output,'candidate.pdf'),Buffer.from(pdf.output('arraybuffer')))
const results=[]
for(const [format,filename,expected] of [['json','rich.json','Synthetic grouped text'],['markdown','candidate.md','linran@example.test'],['docx','candidate.docx','Reduced build time by 30 percent'],['pdf','candidate.pdf','Synthetic QA Candidate']]){
 const bytes=await readFile(format==='markdown'||format==='docx'?join(root,'tests/fixtures',filename):join(output,filename))
 const imported=await store.importDocument({filename,format,dataBase64:bytes.toString('base64')})
 const copy=JSON.parse(imported.documentJson),ids=[copy.id],texts=[],geometry=[]
 for(const page of copy.pages){
  ids.push(page.id)
  const config={...copy.pageConfig,...page.config},width=mmToPx(config.width,config.dpi),height=mmToPx(config.height,config.dpi)
  const inspect=(elements,offsetX=0,offsetY=0)=>{for(const element of elements){
   ids.push(element.id)
   if(element.type==='text')texts.push(element.content)
   const left=offsetX+element.left,top=offsetY+element.top
   if(element.name.startsWith('QA ')){
    assert(left>=0&&top>=0&&left+element.width<=width&&top+element.height<=height,`Out-of-page ${element.name}`)
    geometry.push({name:element.name,id:element.id,left,top,width:element.width,height:element.height})
   }
   if(element.type==='image')assert.deepEqual(PNG.sync.read(Buffer.from(element.src.split(',')[1],'base64'),{checkCRC:true}).data,png.data)
   if(element.type==='group')inspect(element.children,left,top)
  }}
  inspect(page.elements)
 }
 assert.equal(new Set(ids).size,ids.length,'Duplicate recursive identities')
 assert(texts.join('\n').includes(expected),`Missing ${format} content`)
 if(format==='json'){
  assert.equal(copy.pages.length,2)
  assert(ids.every(id=>![initial.id,'qa-group','qa-second-page',text.id,image.id,shape.id,rootImage.id].includes(id)),'Import must replace identities')
  assert.deepEqual(geometry.filter(item=>item.name==='QA grouped text').map(({left,top})=>({left,top})),[{left:80,top:650}])
  assert.deepEqual(geometry.filter(item=>item.name==='QA grouped image').map(({left,top})=>({left,top})),[{left:300,top:650}])
 }
 results.push({format,id:imported.id,pages:copy.pages.length,uniqueIds:ids.length,expectedContent:expected,geometry})
}
await writeFile(join(output,'verification.json'),JSON.stringify({richId:initial.id,profile,storage:store.config.storageDir,image:{bytes:imageBytes.length,width:decoded.width,height:decoded.height},results},null,2)+'\n')
await writeFile(join(output,'fixture-inventory.json'),JSON.stringify(await store.list(),null,2)+'\n')
console.log(JSON.stringify({status:'PASS',richId:initial.id,profile,output,imageBytes:imageBytes.length,formats:results.map(({format,id,pages,uniqueIds})=>({format,id,pages,uniqueIds}))},null,2))

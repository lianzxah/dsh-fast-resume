/** Actual browser Konva in an isolated DOM backed by the native canvas test dependency. */
import {createRequire} from 'node:module'
import {fileURLToPath} from 'node:url'
const root=fileURLToPath(new URL('../../',import.meta.url)),require=createRequire(new URL('../../package.json',import.meta.url))
const {build}=require('esbuild'),{JSDOM}=require('jsdom'),{createCanvas}=require('@napi-rs/canvas')
const built=await build({stdin:{contents:`export {renderPageToDataURL} from './upstream/canvas-engine/src/core/export.ts'; export {createImageElement,createShapeElement} from './upstream/canvas-engine/src/element-factory.ts'; export {DEFAULT_PAGE_CONFIG} from './upstream/shared/src/index.ts'; export {shapes} from 'konva/lib/Shape.js'; export {default as Konva} from 'konva';`,resolveDir:root,loader:'ts'},bundle:true,platform:'browser',format:'iife',globalName:'fixture',write:false,alias:{'@resume-editor/shared':root+'/upstream/shared/src/index.ts'},define:{'process.env.NODE_ENV':'"production"'}})
const dom=new JSDOM('<!doctype html><body></body>',{runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,canvases=new WeakMap(),images=[]
w.HTMLCanvasElement.prototype.getContext=function(type){let canvas=canvases.get(this);if(!canvas){canvas=createCanvas(this.width||300,this.height||150);canvases.set(this,canvas)}return canvas.getContext(type)}
w.HTMLCanvasElement.prototype.toDataURL=function(){return canvases.get(this)?.toDataURL()??''}
w.AbortSignal=AbortSignal;w.AbortController=AbortController
w.Image=class{src='';crossOrigin='';onload=null;onerror=null;constructor(){images.push(this)}}
w.eval(built.outputFiles[0].text)
const p=w.fixture,results=[]
try{
 for(const nested of [false,true])for(const mode of ['abort','failure'])for(const decodedBeforeFailure of [false,true])for(let repetition=0;repetition<2;repetition++){
  images.length=0
  const shape=p.createShapeElement('rectangle',{id:`${nested}-${mode}-${repetition}`}),pending=p.createImageElement({src:'https://example.invalid/pending.png'}),bad=p.createImageElement({src:'https://example.invalid/bad.png'})
  const elements=nested?[{...shape,type:'group',children:[shape,bad,pending]}]:[shape,bad,pending]
  const abort=new AbortController(),render=p.renderPageToDataURL({id:'page',pageNumber:1,elements},p.DEFAULT_PAGE_CONFIG,{signal:abort.signal,failOnImageError:true})
  const lateLoad=images.find(image=>image.src.endsWith('pending.png'))?.onload
  if(decodedBeforeFailure)lateLoad?.();
  if(mode==='abort')abort.abort();else images.find(image=>image.src.endsWith('bad.png')).onerror()
  let failure
  try{await render}catch(error){failure=error.name}
  // A stale native load callback must not allocate another shape after disposal.
  lateLoad?.();await Promise.resolve();await Promise.resolve()
  results.push({nested,mode,decodedBeforeFailure,repetition,failure,retainedShapeIds:Object.values(p.shapes).map(shape=>shape.id()),stages:p.Konva.stages.length,bodyNodes:w.document.body.childElementCount})
 }
 process.stdout.write(JSON.stringify(results))
}finally{for(const stage of [...p.Konva.stages])stage.destroy();for(const shape of Object.values(p.shapes))shape.destroy();w.close()}

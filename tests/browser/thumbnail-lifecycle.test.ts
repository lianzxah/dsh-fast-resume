// @vitest-environment jsdom
/** Cancelling a thumbnail releases pending images and its offscreen engine stage. */
import {describe,it,expect,vi} from 'vitest'
const state=vi.hoisted(()=>({destroy:vi.fn()}))
vi.mock('konva',()=>({default:{Stage:class{add(){}destroy(){state.destroy()}},Layer:class{add(){}},Rect:class{}}}))
import {renderPageToDataURL} from '../../upstream/canvas-engine/src/core/export.ts'
import {createImageElement} from '../../upstream/canvas-engine/src/element-factory.ts'
import {DEFAULT_PAGE_CONFIG} from '../../upstream/shared/src/index.ts'
describe('thumbnail engine cancellation',()=>{
 it('clears image handlers and destroys the stage before cancellation settles',async()=>{
  const images:Array<{src:string;onload:null|(()=>void);onerror:null|(()=>void)}>=[]
  vi.stubGlobal('Image',class{src='';crossOrigin='';onload=null;onerror=null;constructor(){images.push(this)}})
  const abort=new AbortController()
  try{
   const render=renderPageToDataURL({id:'page',pageNumber:1,elements:[createImageElement({src:'https://example.invalid/image.png'})]},DEFAULT_PAGE_CONFIG,{signal:abort.signal,failOnImageError:true})
   const rejected=expect(render).rejects.toMatchObject({name:'AbortError'});expect(images).toHaveLength(1)
   abort.abort();await rejected
   expect(images[0]).toMatchObject({src:'',onload:null,onerror:null});expect(state.destroy).toHaveBeenCalledTimes(1);expect(document.body.childElementCount).toBe(0)
  }finally{abort.abort();vi.unstubAllGlobals()}
 })
})

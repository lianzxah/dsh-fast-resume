// @vitest-environment jsdom
import React,{act} from 'react'
import {createRoot,type Root} from 'react-dom/client'
import {DndProvider} from 'react-dnd'
import {HTML5Backend} from 'react-dnd-html5-backend'
import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {CanvasWorkspace} from '../../upstream/editor/src/components/layout/CanvasWorkspace.tsx'
import {useEditorStore} from '../../upstream/editor/src/store/editor-store.ts'
import {getPageMetrics} from '../../upstream/canvas-engine/src/core/page-metrics.ts'

vi.mock('@resume-editor/canvas-engine',async()=>({ResumeCanvas:()=>null,alignBoxes:vi.fn(),distributeBoxes:vi.fn(),getPageMetrics:(await import('../../upstream/canvas-engine/src/core/page-metrics.ts')).getPageMetrics}))
let root:Root|undefined,notify=()=>{},disconnected=false,width=560,height=570
const initial=useEditorStore.getState()
beforeEach(()=>{
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true)
 vi.stubGlobal('ResizeObserver',class{constructor(callback:()=>void){notify=callback}observe(){}disconnect(){disconnected=true}})
 vi.spyOn(HTMLElement.prototype,'clientWidth','get').mockImplementation(function(this:HTMLElement){return this.classList.contains('canvas-workspace')?width:0})
 vi.spyOn(HTMLElement.prototype,'clientHeight','get').mockImplementation(function(this:HTMLElement){return this.classList.contains('canvas-workspace')?height:0})
 useEditorStore.setState(initial,true);width=560;height=570;disconnected=false
})
afterEach(async()=>{if(root)await act(async()=>root?.unmount());root=undefined;document.body.replaceChildren();vi.restoreAllMocks();vi.unstubAllGlobals()})
async function mount(direction:'auto'|'standard'|'reversed'='auto'){const container=document.createElement('div');document.body.append(container);root=createRoot(container);await act(async()=>root?.render(React.createElement(DndProvider,{backend:HTML5Backend},React.createElement(CanvasWorkspace,{wheelZoomDirection:direction}))))}
function assertPageFits(){const state=useEditorStore.getState(),page=state.document.pages[state.activePageIndex],metrics=getPageMetrics({...state.document.pageConfig,...page?.config});expect(metrics.widthPx*state.viewport.zoom.level).toBeLessThanOrEqual(width-48+.01);expect(metrics.heightPx*state.viewport.zoom.level).toBeLessThanOrEqual(height-76+.01)}
function assertWidthFits(){const state=useEditorStore.getState(),page=state.document.pages[state.activePageIndex],metrics=getPageMetrics({...state.document.pageConfig,...page?.config});expect(metrics.widthPx*state.viewport.zoom.level).toBeCloseTo(width-48,5)}
it('maximizes the initial page width and follows sidebars while keeping long pages vertically scrollable',async()=>{
 const before=useEditorStore.getState().document
 await mount();assertWidthFits();expect(getPageMetrics(initial.document.pageConfig).heightPx*useEditorStore.getState().viewport.zoom.level).toBeGreaterThan(height)
 width=190;height=400;await act(async()=>notify());assertWidthFits();expect(useEditorStore.getState().viewport.zoom.level).toBeLessThan(.25)
 width=950;height=700;await act(async()=>notify());assertWidthFits()
 expect(useEditorStore.getState().document).toBe(before);expect(useEditorStore.getState().isDirty).toBe(false)
 await act(async()=>root?.unmount());root=undefined;expect(disconnected).toBe(true)
})
it('preserves manual zoom on resize and re-enters automatic fit through the existing action',async()=>{
 await mount();await act(async()=>useEditorStore.getState().zoomIn());const manual=useEditorStore.getState().viewport.zoom.level
 width=300;await act(async()=>notify());expect(useEditorStore.getState().viewport.zoom.level).toBe(manual)
 await act(async()=>useEditorStore.getState().zoomToFit());assertPageFits();expect(useEditorStore.getState().fitMode).toBe('page')
})
it('uses page overrides and skips zero-sized hidden views',async()=>{
 const doc=initial.document
 useEditorStore.setState({document:{...doc,pages:[{...doc.pages[0]!,config:{width:297,height:210}}]}})
 await mount();assertWidthFits();const zoom=useEditorStore.getState().viewport.zoom.level
 width=0;height=0;await act(async()=>notify());expect(useEditorStore.getState().viewport.zoom.level).toBe(zoom)
})

it('preserves center and pointer anchors while allowing zoom beyond the canvas width',async()=>{
 const native=HTMLElement.prototype.getBoundingClientRect
 vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockImplementation(function(this:HTMLElement){
  if(this.classList.contains('canvas-workspace'))return new DOMRect(0,0,width,height)
  if(this.classList.contains('shadow-2xl')){
   const canvas=document.querySelector<HTMLElement>('.canvas-workspace')!,paperWidth=parseFloat(this.style.width),paperHeight=parseFloat(this.style.height)
   return new DOMRect(24+Math.max(0,(width-48-paperWidth)/2)-canvas.scrollLeft,24-canvas.scrollTop,paperWidth,paperHeight)
  }
  return native.call(this)
 })
 await mount()
 const canvas=document.querySelector<HTMLElement>('.canvas-workspace')!,paper=document.querySelector<HTMLElement>('.shadow-2xl')!
 const point=(clientX=width/2,clientY=height/2)=>{const rect=paper.getBoundingClientRect(),level=useEditorStore.getState().viewport.zoom.level;return{x:(clientX-rect.left)/level,y:(clientY-rect.top)/level}}
 const before=point()
 await act(async()=>{useEditorStore.getState().setZoom(1.5);await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()))})
 expect(parseFloat(paper.style.width)).toBeGreaterThan(width);expect(canvas.scrollLeft).toBeGreaterThan(0)
 expect(point().x).toBeCloseTo(before.x,4);expect(point().y).toBeCloseTo(before.y,4)
 const pointer=point(420,170)
 await act(async()=>{canvas.dispatchEvent(new WheelEvent('wheel',{ctrlKey:true,clientX:420,clientY:170,deltaY:-80,bubbles:true,cancelable:true}));for(let frame=0;frame<3;frame++)await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()))})
 expect(point(420,170).x).toBeCloseTo(pointer.x,4);expect(point(420,170).y).toBeCloseTo(pointer.y,4)
 await act(async()=>useEditorStore.getState().zoomToWidth());assertWidthFits();expect(canvas.scrollLeft).toBe(0)
})

it.each([
 ['ctrl','auto',false,-80],['meta','auto',false,-80],
 ['ctrl','auto',true,80],['meta','auto',true,80],
 ['ctrl','reversed',false,80],['meta','reversed',false,80],
] as const)('enlarges upward and reduces downward with %s, %s direction and device inversion %s',async(modifier,direction,inverted,upDelta)=>{
 await mount(direction)
 const canvas=document.querySelector<HTMLElement>('.canvas-workspace')!,before=useEditorStore.getState().viewport.zoom.level,doc=useEditorStore.getState().document
 const wheel=async(deltaY:number,modified=true)=>{
  const event=new WheelEvent('wheel',{deltaY,clientX:200,clientY:150,ctrlKey:modified&&modifier==='ctrl',metaKey:modified&&modifier==='meta',bubbles:true,cancelable:true})
  if(inverted)Object.defineProperty(event,'webkitDirectionInvertedFromDevice',{value:true})
  await act(async()=>{canvas.dispatchEvent(event);for(let frame=0;frame<3;frame++)await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()))})
  return event
 }
 await wheel(upDelta);expect(useEditorStore.getState().viewport.zoom.level).toBeGreaterThan(before)
 await wheel(-upDelta);expect(useEditorStore.getState().viewport.zoom.level).toBeCloseTo(before,6)
 const plain=await wheel(upDelta,false);expect(plain.defaultPrevented).toBe(false);expect(useEditorStore.getState().viewport.zoom.level).toBeCloseTo(before,6)
 expect(useEditorStore.getState().document).toBe(doc);expect(useEditorStore.getState().isDirty).toBe(false)
})

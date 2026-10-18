/** Resizable editor sidebars share visibility with the existing toolbar and shortcuts. */
import React,{useLayoutEffect,useRef} from 'react'
import {Panel,PanelGroup,PanelResizeHandle,getResizeHandleElement,type ImperativePanelHandle} from 'react-resizable-panels'
import {LeftPanel} from '../../upstream/editor/src/components/layout/LeftPanel.tsx'
import {RightPanel} from '../../upstream/editor/src/components/layout/RightPanel.tsx'
import {CanvasWorkspace} from '../../upstream/editor/src/components/layout/CanvasWorkspace.tsx'
import {useEditorStore} from '../../upstream/editor/src/store/editor-store.ts'

type SplitterKeyEvent=Pick<React.KeyboardEvent,'key'|'preventDefault'|'stopPropagation'>
type VisibilityKey='leftPanelVisible'|'rightPanelVisible'
function useSidebar(key:VisibilityKey,handleId:string){
 const visible=useEditorStore(state=>state.ui[key]),panel=useRef<ImperativePanelHandle>(null),content=useRef<HTMLDivElement>(null)
 const defaultSize=useRef(visible?22:0).current,lastExpandedSize=useRef(22)
 const setVisible=(next:boolean)=>{
  const store=useEditorStore.getState()
  if(store.ui[key]!==next){if(key==='leftPanelVisible')store.toggleLeftPanel();else store.toggleRightPanel()}
 }
 useLayoutEffect(()=>{
  const current=panel.current
  if(!current)return
  if(!visible)current.collapse()
  else if(current.isCollapsed()){
   const size=lastExpandedSize.current
   current.expand(size)
   // Native drag collapse does not update the library's imperative-collapse size cache.
   if(current.getSize()!==size)current.resize(size)
  }
 },[visible])
 const onKeyDownCapture=(event:SplitterKeyEvent)=>{
  // Native Enter targets the preceding panel, which is the canvas at the right divider.
  if(event.key==='Enter'){event.preventDefault();setVisible(!visible)}
 }
 return {visible,content,onKeyDownCapture,props:{ref:panel,defaultSize,collapsible:true,collapsedSize:0,
  onResize:(size:number)=>{if(size>0)lastExpandedSize.current=size},
  onExpand:()=>setVisible(true),
  onCollapse:()=>{
   if(content.current?.contains(document.activeElement))getResizeHandleElement(handleId)?.focus()
   setVisible(false)
  }}}
}
function isolateSplitterKey(event:SplitterKeyEvent){event.stopPropagation()}
/** Keeps the canvas and sidebar content mounted while native splitters collapse to zero.
 * @param leftLabel Localized accessible name for the left splitter.
 * @param rightLabel Localized accessible name for the right splitter.
 * @returns The horizontal editor workspace.
 */
export function WorkspacePanels({leftLabel,rightLabel}:{leftLabel:string;rightLabel:string}){
 const left=useSidebar('leftPanelVisible','fr-left-resize'),right=useSidebar('rightPanelVisible','fr-right-resize')
 const canvasSize=useRef(100-left.props.defaultSize-right.props.defaultSize).current
 return <PanelGroup direction="horizontal" className="h-full min-h-0">
  <Panel {...left.props} id="fr-left-panel" minSize={15} maxSize={40} order={1}><div ref={left.content} className="h-full min-h-0" hidden={!left.visible}><LeftPanel/></div></Panel>
  <PanelResizeHandle id="fr-left-resize" className="fr-resize" aria-label={leftLabel} onKeyDownCapture={left.onKeyDownCapture} onKeyDown={isolateSplitterKey}/>
  <Panel id="fr-canvas-panel" defaultSize={canvasSize} minSize={25} order={2}><CanvasWorkspace/></Panel>
  <PanelResizeHandle id="fr-right-resize" className="fr-resize" aria-label={rightLabel} onKeyDownCapture={right.onKeyDownCapture} onKeyDown={isolateSplitterKey}/>
  <Panel {...right.props} id="fr-right-panel" minSize={16} maxSize={40} order={3}><div ref={right.content} className="h-full min-h-0" hidden={!right.visible}><RightPanel/></div></Panel>
 </PanelGroup>
}

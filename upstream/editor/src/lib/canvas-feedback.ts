/** Local DOM feedback never repaints canvas nodes or changes focus. */
export interface FeedbackRectangle {id:string;x:number;y:number;width:number;height:number}
/** Outline rendered rectangles for 1.2 seconds, removing them on hidden state or owner disposal.
 * @param page Owned page wrapper.
 * @param rectangles Actual scaled canvas bounds, including page bounds when requested.
 * @param signal Mounted canvas lifetime.
 */
export function paintFeedback(page:HTMLElement,rectangles:FeedbackRectangle[],signal:AbortSignal):void{
 if(signal.aborted||document.hidden||document.documentElement.dataset.editorVisible==='false')return
 const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches
 const nodes=rectangles.map(rect=>{const node=document.createElement('div');node.className='fr-change-outline';node.dataset.changedId=rect.id;node.setAttribute('aria-hidden','true');Object.assign(node.style,{left:`${rect.x}px`,top:`${rect.y}px`,width:`${rect.width}px`,height:`${rect.height}px`,animation:reduced?'none':''});page.append(node);return node})
 const cleanup=()=>{clearTimeout(timer);nodes.forEach(n=>n.remove());signal.removeEventListener('abort',cleanup);document.removeEventListener('visibilitychange',hidden)}
 const hidden=()=>{if(document.hidden)cleanup()},timer=setTimeout(cleanup,1200)
 signal.addEventListener('abort',cleanup,{once:true});document.addEventListener('visibilitychange',hidden)
}

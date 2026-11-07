/** DOM-owned canvas geometry shared with the embedding editor adapter. */
export interface ViewportPosition {scrollX:number;scrollY:number;anchor?:{x:number;y:number}}
/** Lifecycle-owned access to the mounted canvas; no application DOM selectors are needed. */
export interface ViewportHandle {
 /** Mark exact mounted element/page rectangles; only explicit locate changes selection or scroll. */
 feedback?:(ids:string[],locate:boolean)=>void
 capture:()=>ViewportPosition
 restore:(position:ViewportPosition,signal:AbortSignal)=>Promise<void>
}
/** Preserve a document point at the canvas center across dimensions and manual zoom.
 * @param container Actual scroll owner.
 * @param page Active page wrapper after layout.
 * @param zoom Current document scale.
 * @returns Scroll evidence and unscaled page point at the visible center.
 */
export function captureViewport(container:HTMLElement,page:HTMLElement,zoom:number):ViewportPosition{
 if(!container.clientWidth||!container.clientHeight)throw Error('Canvas is not visible')
 const area=container.getBoundingClientRect(),paper=page.getBoundingClientRect()
 return{scrollX:container.scrollLeft,scrollY:container.scrollTop,anchor:{x:(area.left+container.clientWidth/2-paper.left)/zoom,y:(area.top+container.clientHeight/2-paper.top)/zoom}}
}
/** Restore after committed layout; width/page fit keep the fitted horizontal position.
 * @param container Actual scroll owner.
 * @param page Active page wrapper.
 * @param zoom Resolved target zoom, including target canvas fit.
 * @param position Captured document point and original scroll fallback.
 * @param manual Whether horizontal overflow is user controlled.
 */
export function restoreViewport(container:HTMLElement,page:HTMLElement,zoom:number,position:ViewportPosition,manual:boolean):void{
 if(!container.clientWidth||!container.clientHeight)throw Error('Canvas is not visible')
 const area=container.getBoundingClientRect(),paper=page.getBoundingClientRect(),anchor=position.anchor
 container.scrollLeft=manual?Math.max(0,anchor?container.scrollLeft+paper.left+anchor.x*zoom-area.left-container.clientWidth/2:position.scrollX):0
 container.scrollTop=Math.max(0,anchor?container.scrollTop+paper.top+anchor.y*zoom-area.top-container.clientHeight/2:position.scrollY)
}

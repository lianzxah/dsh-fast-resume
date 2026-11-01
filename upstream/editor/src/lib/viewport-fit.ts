/** Page and width fits use the canvas area, independent of the surrounding sidebars. */
import type {PageConfig} from '@resume-editor/shared'
import {getPageMetrics} from '@resume-editor/canvas-engine'

/** Calculate a zoom that fits one page, without enlarging it beyond actual size.
 * @param config Active page dimensions, including page overrides.
 * @param width Canvas scroll area's client width.
 * @param height Canvas scroll area's client height.
 * @returns A positive fit scale; zero-sized hidden views retain their previous scale at the caller.
 */
export function pageFitZoom(config:PageConfig,width:number,height:number):number{
 const metrics=getPageMetrics(config)
 return Math.max(.01,Math.min(1,Math.max(1,width-48)/metrics.widthPx,Math.max(1,height-76)/metrics.heightPx))
}

/** Calculate the largest zoom that fills the available canvas width.
 * @param config Active page dimensions, including page overrides.
 * @param width Canvas scroll area's client width.
 * @returns A positive fit scale; the caller applies its editor zoom limit.
 */
export function pageWidthZoom(config:PageConfig,width:number):number{
 return Math.max(.01,Math.max(1,width-48)/getPageMetrics(config).widthPx)
}

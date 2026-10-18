import {describe,it,expect} from 'vitest'
import {resolvePdfRenderOptions} from '../../upstream/canvas-engine/src/core/pdf-export-options.ts'
describe('agreed renderer pixel ratio',()=>{
 it('preserves the complete Host-supported pixel ratio range for PDF rasterization',()=>{
  expect(resolvePdfRenderOptions({pixelRatio:0.1}).pixelRatio).toBe(0.1)
  expect(resolvePdfRenderOptions({pixelRatio:4}).pixelRatio).toBe(4)
 })
})

/** Native Konva registry observations cover unattached nodes and late image callbacks. */
import {describe,it,expect} from 'vitest'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {fileURLToPath} from 'node:url'
interface Observation{nested:boolean;mode:'abort'|'failure';repetition:number;failure:string;retainedShapeIds:string[];stages:number;bodyNodes:number}
describe('actual canvas preview node ownership',()=>{
 it('releases successful siblings and nested children after repeated cancellation and image failure',async()=>{
  const result=await promisify(execFile)(process.execPath,[fileURLToPath(new URL('../fixtures/preview-node-ownership.mjs',import.meta.url))],{maxBuffer:1024*1024})
  const observations:Observation[]=JSON.parse(result.stdout)
  expect(observations).toHaveLength(16)
  for(const item of observations){expect(item.failure).toBe(item.mode==='abort'?'AbortError':'Error');expect(item.retainedShapeIds,JSON.stringify(item)).toEqual([]);expect(item.stages).toBe(0);expect(item.bodyNodes).toBe(0)}
 })
})

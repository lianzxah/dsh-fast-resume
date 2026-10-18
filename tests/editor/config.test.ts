import {describe,it,expect} from 'vitest'
import {resolveConfig} from '../../src/host/store.ts'
describe('configured browser lifecycle budgets',()=>{
 it('derives the bridge deadline from the configured render and frame budgets',()=>{
  const config=resolveConfig('/profile',{renderTimeoutMs:60000,frameConnectTimeoutMs:20000})
  expect(config.bridgeTimeoutMs).toBe(80000);expect(config.rendererPollIntervalMs).toBe(1000);expect(config.refreshIntervalMs).toBe(2000)
 })
 it('rejects premature bridge deadlines, nonrenewing poll intervals and invalid budgets',()=>{
  expect(()=>resolveConfig('/profile',{renderTimeoutMs:60000,bridgeTimeoutMs:45000})).toThrow()
  expect(()=>resolveConfig('/profile',{rendererLeaseMs:500,rendererPollIntervalMs:500})).toThrow()
  expect(()=>resolveConfig('/profile',{frameConnectTimeoutMs:0})).toThrow()
  expect(()=>resolveConfig('/profile',{refreshIntervalMs:0.5})).toThrow()
 })
})

import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'
export default defineConfig({resolve:{alias:{'@':resolve('upstream/editor/src'),'@resume-editor/canvas-engine':resolve('upstream/canvas-engine/src/index.ts'),'@resume-editor/shared':resolve('upstream/shared/src/index.ts'),'@resume-editor/templates':resolve('upstream/templates/src/index.ts')}},test:{testTimeout:10000}})

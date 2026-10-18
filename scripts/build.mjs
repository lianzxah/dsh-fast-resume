/** Standalone Host build and real Typert generation through a temporary synthetic workspace. */
import { build } from 'esbuild'
import { cp, mkdir, mkdtemp, readFile, writeFile, symlink, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { WorkspaceAnalyzer, FaceModelEmitter, writePackageArtifacts } from '@deepseek-ai/dsh-typert-generator'
import { repairDeclarations } from './repair-declarations.mjs'
const root=process.cwd()
const manifest=JSON.parse(await readFile('package.json','utf8'))
await mkdir('lib',{recursive:true})
const typecheck=spawnSync(process.execPath,['node_modules/typescript/bin/tsc','-p','tsconfig.host.json'],{stdio:'inherit'})
if(typecheck.status!==0)process.exit(typecheck.status??1)
await repairDeclarations(resolve('lib/types'))
const alias={'@resume-editor/shared':resolve('upstream/shared/src/index.ts'),'@resume-editor/templates':resolve('upstream/templates/src/index.ts'),'@resume-editor/canvas-engine':resolve('upstream/canvas-engine/src/index.ts')}
await build({entryPoints:{index:'src/host/index.ts',tools:'src/host/tools.ts',types:'src/types.ts'},bundle:true,platform:'node',format:'esm',target:'node22',outdir:'lib',packages:'external',alias,sourcemap:false,tsconfig:'tsconfig.host.json'})
// The published generator discovers only referenced packages below packages/.
// Staging source copies keeps this adaptation independent of the original source tree.
const workspace=await mkdtemp(join(tmpdir(),'fast-resume-typert-'))
try{
 const packageRoot=join(workspace,'packages/plugin');await mkdir(packageRoot,{recursive:true})
 for(const name of ['src','upstream'])await cp(join(root,name),join(packageRoot,name),{recursive:true})
 await symlink(join(root,'node_modules'),join(workspace,'node_modules'),'dir')
 const staged=structuredClone(manifest)
 staged.exports['.']={types:'./src/host/index.ts',default:'./src/host/index.ts'}
 staged.exports['./types']={types:'./src/types.ts',default:'./src/types.ts'}
 staged.exports['./tools']={types:'./src/host/tools.ts',default:'./src/host/tools.ts'}
 delete staged.exports['./client']
 await writeFile(join(packageRoot,'package.json'),JSON.stringify(staged))
 const base=JSON.parse(await readFile('tsconfig.base.json','utf8')),host=JSON.parse(await readFile('tsconfig.host.json','utf8'));const config={...host,compilerOptions:{...base.compilerOptions,...host.compilerOptions}};delete config.extends;config.compilerOptions.noEmit=true;config.compilerOptions.emitDeclarationOnly=false;config.compilerOptions.rootDir='.'
 const protocolRoot=join(workspace,'packages/protocol')
 await cp(join(root,'node_modules/@deepseek-ai/dsh-typert-protocol'),protocolRoot,{recursive:true})
 await cp(join(protocolRoot,'lib/types'),join(protocolRoot,'declarations'),{recursive:true})
 const protocolManifest=JSON.parse(await readFile(join(protocolRoot,'package.json'),'utf8'))
 protocolManifest.exports['.']={types:'./declarations/index.d.ts',default:'./declarations/index.d.ts'}
 await writeFile(join(protocolRoot,'package.json'),JSON.stringify(protocolManifest))
 await writeFile(join(protocolRoot,'tsconfig.host.json'),JSON.stringify({compilerOptions:{skipLibCheck:true},include:['declarations/**/*.d.ts']}))
 config.compilerOptions.paths['@deepseek-ai/dsh-typert-protocol']=[join(protocolRoot,'declarations/index.d.ts')]
 await writeFile(join(packageRoot,'tsconfig.host.json'),JSON.stringify(config))
 const aggregateOptions={...config.compilerOptions,baseUrl:packageRoot}
 await writeFile(join(workspace,'tsconfig.host.json'),JSON.stringify({compilerOptions:aggregateOptions,files:[],references:[{path:'./packages/plugin/tsconfig.host.json'},{path:'./packages/protocol/tsconfig.host.json'}]}))
 const model=new WorkspaceAnalyzer({root:workspace,packages:[manifest.name],faces:['host']}).analyze()
 const artifacts=model.faces.map(face=>({...new FaceModelEmitter(face).emit(manifest.name),packageRoot:'packages/plugin'}))
 if(artifacts.length!==1||!artifacts[0].remote)throw Error('Expected generated Host and Remote metadata')
 writePackageArtifacts(root,artifacts)
 console.log(`Generated ${artifacts[0].package} Host metadata and Remote client`)
}finally{await rm(workspace,{recursive:true,force:true})}

await (await import('./build-browser.mjs')).buildBrowser()

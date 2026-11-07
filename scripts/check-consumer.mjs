/** Artifact-plane NodeNext consumer with no plugin source tree or compiler paths. */
import { mkdtemp, readFile, writeFile, rm, lstat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync, execFileSync } from 'node:child_process'
import {runInNewContext} from 'node:vm'
const root=process.cwd();const temporary=await mkdtemp(join(tmpdir(),'resume-consumer-'))
try {
 const modules=join(temporary,'node_modules')
 await writeFile(join(temporary,'package.json'),JSON.stringify({type:'module',private:true}))
 const pack=JSON.parse(execFileSync('npm',['pack','--workspaces=false','--ignore-scripts','--json','--pack-destination',temporary],{cwd:root,encoding:'utf8'}))[0]
 execFileSync('npm',['install','--workspaces=false','--ignore-scripts','--no-audit','--no-fund',join(temporary,pack.filename),'typescript@6.0.3','@types/node@24'],{cwd:temporary,stdio:'inherit'})
 const installed=join(modules,'dsh-fast-resume')
 if((await lstat(installed)).isSymbolicLink())throw Error('Consumer must install a tarball, not a source link')
 await writeFile(join(temporary,'consumer.ts'),`import FastResumeService from 'dsh-fast-resume'\nimport { TYPERT_REMOTE } from 'dsh-fast-resume/remote'\nimport type { ResumeSnapshot, ResumeDocument } from 'dsh-fast-resume/types'\nconst service: typeof FastResumeService = FastResumeService\nconst methods = TYPERT_REMOTE\nimport type * as Client from 'dsh-fast-resume/client'\nexport type ClientApply = typeof Client.apply\nexport { service, methods }\nexport type { ResumeSnapshot, ResumeDocument }\nimport { resumeIdSchema, resumeRevisionSchema, proposalIdSchema } from 'dsh-fast-resume/types'\nimport type { SaveRequest } from 'dsh-fast-resume/types'\ndeclare const api: FastResumeService\nconst resumeId = resumeIdSchema.parse('consumer-resume')\napi.read(resumeId)\n// @ts-expect-error proposal identities cannot address documents\napi.read(proposalIdSchema.parse('consumer-proposal'))\nconst request: SaveRequest = { id: resumeId, expectedRevision: resumeRevisionSchema.parse(1), documentJson: '{}' }\n// @ts-expect-error raw numbers cannot substitute for acknowledged revisions\nconst invalidRevision: SaveRequest = { ...request, expectedRevision: 1 }\nvoid invalidRevision\nimport type { ResumeUiMutationRequest, ResumeSessionSaveRequest, ResumeUiMutationResult, ResumeSessionSaveResult } from 'dsh-fast-resume/types'\ndeclare const uiRequest: ResumeUiMutationRequest\ndeclare const sessionSave: ResumeSessionSaveRequest\nconst uiResult: Promise<ResumeUiMutationResult> = api.uiMutation(uiRequest, new AbortController().signal)\nconst saveResult: Promise<ResumeSessionSaveResult> = api.saveInSession(sessionSave)\nvoid uiResult; void saveResult\n// @ts-expect-error UI actions require their own branded identity\nconst invalidAction: ResumeUiMutationRequest = { ...uiRequest, actionId: 'tool-call' }\nvoid invalidAction\nimport type { EditorTransferRead, EditorTransferDisposition } from 'dsh-fast-resume/types'\ndeclare const transferRead: EditorTransferRead\nconst disposition: Promise<EditorTransferDisposition> = api.editorTransferRead(transferRead)\nvoid disposition\n// @ts-expect-error transfer lookups require a branded checkpoint identity\napi.editorTransferRead({ ...transferRead, checkpointId: 'raw-checkpoint' })\n`)
 await writeFile(join(temporary,'tsconfig.json'),JSON.stringify({compilerOptions:{target:'ES2022',module:'NodeNext',moduleResolution:'NodeNext',strict:true,skipLibCheck:false,noEmit:true,types:['node']},include:['consumer.ts']}))
 const result=spawnSync(process.execPath,[join(modules,'typescript/bin/tsc'),'-p',join(temporary,'tsconfig.json')],{stdio:'inherit',cwd:temporary})
 if(result.error)throw result.error
 if(result.signal)throw Error('Consumer compiler terminated: '+result.signal)
 if(result.status!==0)throw Error('Consumer compiler exited '+result.status)
 else console.log('NodeNext installed-artifact consumer passed without source aliases')
 const manifest=JSON.parse(await readFile(join(installed,'package.json'),'utf8'))
 for(const name of ['@deepseek-ai/dsh-client-ui-chat','@deepseek-ai/dsh-api-workspace-controller','@deepseek-ai/dsh-api-session-controller','@deepseek-ai/dsh-client-ui-sidebar-right','@deepseek-ai/dsh-client-ui-conversation','@deepseek-ai/dsh-client-ui-session']){
  if(!manifest.dsh.client.inject.includes(name)||manifest.peerDependencies[name]!=='0.2.1-rc.2')throw Error('Missing pinned browser peer '+name)
  let loaded=false
  runInNewContext(await readFile(join(modules,name,'lib/client.js'),'utf8'),{window:{__ModuleLoader__:{load:entry=>{if(entry.id!==name||typeof entry.factory!=='function')throw Error('Invalid published browser module '+name);loaded=true}}}})
  if(!loaded)throw Error('Published browser peer did not register '+name)
 }
 console.log('Published Session/Workspace controllers, sidebar, Chat, conversation and Session browser modules registered through ModuleLoader')
}finally {await rm(temporary,{recursive:true,force:true})}

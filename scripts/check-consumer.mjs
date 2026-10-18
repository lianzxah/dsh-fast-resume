/** Artifact-plane NodeNext consumer with no plugin source tree or compiler paths. */
import { cp, mkdir, mkdtemp, readdir, symlink, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
const root=process.cwd();const temporary=await mkdtemp(join(tmpdir(),'resume-consumer-'))
try {
 const modules=join(temporary,'node_modules');await mkdir(modules)
 for(const entry of await readdir('node_modules',{withFileTypes:true})) {
  if(entry.name.startsWith('.'))continue
  await symlink(join(root,'node_modules',entry.name),join(modules,entry.name),'dir')
 }
 const installed=join(modules,'dsh-fast-resume');await mkdir(installed)
 for(const entry of ['lib','package.json'])await cp(entry,join(installed,entry),{recursive:true})
 await writeFile(join(temporary,'package.json'),JSON.stringify({type:'module'}))
 await writeFile(join(temporary,'consumer.ts'),`import FastResumeService from 'dsh-fast-resume'\nimport { TYPERT_REMOTE } from 'dsh-fast-resume/remote'\nimport type { ResumeSnapshot, ResumeDocument } from 'dsh-fast-resume/types'\nconst service: typeof FastResumeService = FastResumeService\nconst methods = TYPERT_REMOTE\nimport type * as Client from 'dsh-fast-resume/client'\nexport type ClientApply = typeof Client.apply\nexport { service, methods }\nexport type { ResumeSnapshot, ResumeDocument }\nimport { resumeIdSchema, resumeRevisionSchema, proposalIdSchema } from 'dsh-fast-resume/types'\nimport type { SaveRequest } from 'dsh-fast-resume/types'\ndeclare const api: FastResumeService\nconst resumeId = resumeIdSchema.parse('consumer-resume')\napi.read(resumeId)\n// @ts-expect-error proposal identities cannot address documents\napi.read(proposalIdSchema.parse('consumer-proposal'))\nconst request: SaveRequest = { id: resumeId, expectedRevision: resumeRevisionSchema.parse(1), documentJson: '{}' }\n// @ts-expect-error raw numbers cannot substitute for acknowledged revisions\nconst invalidRevision: SaveRequest = { ...request, expectedRevision: 1 }\nvoid invalidRevision\n`)
 await writeFile(join(temporary,'tsconfig.json'),JSON.stringify({compilerOptions:{target:'ES2022',module:'NodeNext',moduleResolution:'NodeNext',strict:true,skipLibCheck:false,noEmit:true,types:['node']},include:['consumer.ts']}))
 const result=spawnSync(process.execPath,[resolve('node_modules/typescript/bin/tsc'),'-p',join(temporary,'tsconfig.json')],{stdio:'inherit',cwd:temporary})
 if(result.status!==0)process.exitCode=result.status??1
 else console.log('NodeNext installed-artifact consumer passed without source aliases')
}finally {await rm(temporary,{recursive:true,force:true})}

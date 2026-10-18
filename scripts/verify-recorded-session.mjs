/** Replays an actual recorded model turn through the installed plugin without credentials. */
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {mkdtemp,mkdir,readFile,writeFile,readdir,copyFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import assert from 'node:assert/strict'

const cli=process.env.DSH_TEST_CLI,replay=process.env.DSH_TEST_REPLAY
if(!cli||!replay||!process.argv[2])throw Error('Set DSH_TEST_CLI and DSH_TEST_REPLAY to the installed same-version public entries; pass the plugin .tgz path')
const fixture=resolve(import.meta.dirname,'../tests/fixtures/live-read')
const [seed,prompt,expected]=await Promise.all(['resume.json','prompt.txt','expected.json'].map(file=>readFile(join(fixture,file),'utf8')))
const envelope=JSON.parse(seed),expectedOutput=JSON.parse(expected)
const root=await mkdtemp(join(tmpdir(),'fast-resume-recorded-'))
const env={...process.env,DSH_HOME:join(root,'home'),DSH_AGENTS_HOME:join(root,'agents'),DSH_TELEMETRY_DISABLED:'1',DSH_TOOLS_MODE:'native'}
delete env.DEEPSEEK_API_KEY;delete env.DEEPSEEK_BASE_URL
const run=promisify(execFile)
const invoke=args=>run(process.execPath,[cli,...args],{cwd:root,env,timeout:240000,maxBuffer:32*1024*1024})
const installed=await invoke(['plugin','--profile','headless','add',resolve(process.argv[2]),...(process.argv.includes('--offline')?['--offline']:[]),...(process.env.DSH_TEST_REGISTRY?[`--registry=${process.env.DSH_TEST_REGISTRY}`]:[])])
await writeFile(join(root,'install.log'),installed.stdout+installed.stderr)
const storage=join(root,'resume-data');await mkdir(storage)
await copyFile(join(fixture,'resume.json'),join(storage,`${envelope.document.id}.json`))
const overlay=[
 {id:'agent-default-model',config:{provider:'resume-live-replay',model:'recorded'}},
 {id:'session-title-llm',disabled:true},
 {id:'session-persistence-jsonl',config:{root:join(root,'sessions'),compression:'none'}},
 {id:'fast-resume',config:{storageDir:storage}},
 {insert:[{id:'resume-live-replay',name:resolve(replay),config:{file:join(fixture,'session.v4.jsonl'),providers:[{id:'resume-live-replay',name:'Recorded live model',models:[{id:'recorded',contextWindow:128000}]}]}}]},
]
const overlayPath=join(root,'replay-overlay.json');await writeFile(overlayPath,JSON.stringify(overlay,null,2)+'\n')
const result=await invoke(['--profile','headless','--patch',overlayPath,'--json',prompt.trim()])
await writeFile(join(root,'output.jsonl'),result.stdout);await writeFile(join(root,'diagnostics.log'),result.stderr)
assert.equal(result.stderr.trim(),'','Replay emitted unexpected diagnostics')
const events=result.stdout.trim().split('\n').map(JSON.parse),results=events.filter(event=>event.type==='tool_result')
assert.equal(results.length,1,'The recorded scenario must inspect the resume through one real tool call')
assert.equal(results[0].status,'completed')
const read=typeof results[0].result==='string'?JSON.parse(results[0].result):results[0].result
assert.equal(read.element?.type,'image','Recorded tool must select the saved image layer')
assert.ok(read.element.src.startsWith('resume-asset:'),'Model reads must not expose inline image bytes')
assert.ok(result.stdout.includes(expectedOutput.finish),'The recorded final answer must complete')
async function logs(directory){const entries=await readdir(directory,{withFileTypes:true});const found=[];for(const entry of entries){const path=join(directory,entry.name);if(entry.isDirectory())found.push(...await logs(path));else if(entry.name==='session.v4.jsonl')found.push(path)}return found}
const sessionFiles=await logs(join(root,'sessions'));assert.equal(sessionFiles.length,1)
const stored=(await readFile(sessionFiles[0],'utf8')).trim().split('\n').map(JSON.parse)
const projection={toolNames:stored.filter(event=>event.type==='tool/call').map(event=>event.data.name),revision:read.revision,elementName:read.element.name,elementType:read.element.type,assetReference:read.element.src,modelCalls:stored.filter(event=>event.type==='assistant/message'||event.type==='assistant/attempt').length,finish:expectedOutput.finish}
assert.deepEqual(projection,expectedOutput,'Actual Session behavior must match the recorded owner-local snapshot')
assert.deepEqual(JSON.parse(await readFile(join(storage,`${envelope.document.id}.json`),'utf8')),envelope,'Read-only replay must retain the seeded resume')
await writeFile(join(root,'verification.json'),JSON.stringify({source:'recorded-live-model',providerIO:false,...projection},null,2)+'\n')
process.stdout.write(`PASS: recorded live Session replay, real installed resume_read, image-byte redaction and expected output\nEvidence: ${root}\n`)

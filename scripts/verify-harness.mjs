/** Installs a tarball and exercises normal Harness Sessions with an explicit scripted test provider. */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, readFile, writeFile, stat, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import assert from 'node:assert/strict'

const run = promisify(execFile)
const cli = process.env.DSH_TEST_CLI
const replay = process.env.DSH_TEST_REPLAY
if (!cli || !replay || !process.argv[2]) {
  throw new Error('Set DSH_TEST_CLI to the installed dsh/lib/bin.js and DSH_TEST_REPLAY to dsh-llm-replay/lib/index.js; pass the plugin .tgz path')
}
const tarball = resolve(process.argv[2])
const installOptions = [...(process.argv.includes('--offline') ? ['--offline'] : []), ...(process.env.DSH_TEST_REGISTRY ? [`--registry=${process.env.DSH_TEST_REGISTRY}`] : [])]
const root = await mkdtemp(join(tmpdir(), 'fast-resume-harness-'))
const env = { ...process.env, DSH_HOME: join(root, 'home'), DSH_AGENTS_HOME: join(root, 'agents'), DSH_TELEMETRY_DISABLED: '1', DSH_TOOLS_MODE: 'native' }
// Model selection comes only from the test profile; ambient credentials are unnecessary.
delete env.DEEPSEEK_API_KEY
delete env.DEEPSEEK_BASE_URL
const invoke = async args => {
  const result = await run(process.execPath, [cli, ...args], { cwd: root, env, timeout: 240000, maxBuffer: 32 * 1024 * 1024 })
  return result
}
const installed = await invoke(['plugin', '--profile', 'headless', 'add', tarball, ...installOptions])
await writeFile(join(root, 'install.log'), installed.stdout + installed.stderr)
const from = pattern => `{{fromRequest:${pattern}}}`
const id = from('id.{3}([a-f0-9-]+).,.title.{3}Offline Resume')
const elementId = from('elements.*?id.{3}([a-f0-9-]+)')
const proposalId = from('id.{3}([a-f0-9-]+).,.baseRevision.:1')
const text = '测试候选人｜可验证的简历修改'
const tool = (name, args, index) => {
  const id = `resume-test-call-${index}`
  const argumentsJson = JSON.stringify(args)
  return { kind: 'chunks', chunks: [
    { type: 'block-start', index: 0, blockType: 'tool-call' },
    { type: 'tool-call-delta', index: 0, id, name, argumentsDelta: argumentsJson },
    { type: 'block-end', index: 0, block: { type: 'tool-call', id, name, arguments: argumentsJson } },
    { type: 'finish', reason: { kind: 'tool-calls' } },
  ] }
}
const finish = text => ({ kind: 'chunks', chunks: [
  { type: 'block-start', index: 0, blockType: 'text' },
  { type: 'text-delta', index: 0, text },
  { type: 'block-end', index: 0, block: { type: 'text', text } },
  { type: 'finish', reason: { kind: 'stop' } },
] })
const finalText = 'OFFLINE_RESUME_FLOW_COMPLETE'
const script = [
  tool('resume_create', { title: 'Offline Resume', templateId: 'template-classic' }, 1),
  tool('resume_read', { id }, 2),
  tool('resume_propose', { id, expectedRevision: 1, requestId: 'offline-proposal', operationsJson: JSON.stringify([{ type: 'text.replace', elementId, content: text }]), summary: 'Apply a deterministic resume text change' }, 3),
  tool('resume_apply', { id, proposalId, requestId: 'offline-apply' }, 4),
  tool('resume_export', { id, expectedRevision: 2, format: 'json' }, 5),
  tool('resume_read', { id }, 6),
  finish(finalText),
]
await writeFile(join(root, 'fixture.jsonl'), JSON.stringify({ type: 'session', version: 3, id: 'offline-fixture', createdAt: 200, cwd: root, isSeeded: false, delegationDepth: 0 }) + '\n')
await writeFile(join(root, 'script.json'), JSON.stringify(script, null, 2) + '\n')
const overlay = [
  { id: 'agent-default-model', config: { provider: 'resume-test', model: 'fixture' } },
  { id: 'session-title-llm', disabled: true },
  { id: 'session-persistence-jsonl', config: { root: join(root, 'sessions'), compression: 'none' } },
  { insert: [{ id: 'resume-test-replay', name: resolve(replay), config: {
    file: join(root, 'fixture.jsonl'), overrideFile: join(root, 'script.json'),
    providers: [{ id: 'resume-test', name: 'Offline Test', models: [{ id: 'fixture', contextWindow: 128000 }] }],
  } }] },
]
const overlayPath = join(root, 'test-overlay.json')
await writeFile(overlayPath, JSON.stringify(overlay, null, 2) + '\n')
const result = await invoke(['--profile', 'headless', '--patch', overlayPath, '--json', 'Create the synthetic Offline Resume, read it, propose and apply the requested text change, then export JSON and verify the committed text. This is a deterministic test.'])
await writeFile(join(root, 'session-output.jsonl'), result.stdout)
await writeFile(join(root, 'diagnostics.log'), result.stderr)
assert.equal(result.stderr.trim(), '', 'Harness emitted unexpected diagnostics')
const events = result.stdout.trim().split('\n').map(line => JSON.parse(line))
const results = events.filter(event => event.type === 'tool_result')
assert.equal(results.length, 6, 'All six normal tool calls must execute')
for (const event of results) assert.equal(event.status, 'completed', JSON.stringify(event))
const exported = results.find(event => event.callId === 'resume-test-call-5')
assert.ok(exported, 'The JSON export tool result must be logged')
const receipt = typeof exported.result === 'string' ? JSON.parse(exported.result) : exported.result
assert.equal(receipt.revision, 2)
assert.equal(receipt.dataBase64, undefined, 'Binary output must not enter the model transcript')
const data = JSON.parse(await readFile(receipt.artifactPath, 'utf8'))
assert.equal(data.document.pages[0].elements[0].content, text, 'Committed exported content must contain the actual edit')
assert.ok(result.stdout.includes(finalText), 'The scripted turn must finish')
const removed = await invoke(['plugin', '--profile', 'headless', 'remove', 'dsh-fast-resume'])
await writeFile(join(root, 'uninstall.log'), removed.stdout + removed.stderr)
assert.ok((await stat(receipt.artifactPath)).size > 0, 'Uninstall must retain resume exports')
const reinstalled = await invoke(['plugin', '--profile', 'headless', 'add', tarball, ...installOptions])
await writeFile(join(root, 'reinstall.log'), reinstalled.stdout + reinstalled.stderr)
const disabledText = 'DISABLED_RESUME_TOOLS_ABSENT'
await writeFile(join(root, 'script.json'), JSON.stringify([finish(disabledText)], null, 2) + '\n')
await writeFile(overlayPath, JSON.stringify([...overlay, {id:'fast-resume',disabled:true}, {id:'fast-resume-tools',disabled:true}], null, 2) + '\n')
const disabled = await invoke(['--profile','headless','--patch',overlayPath,'--json','Run the disabled-plugin smoke.'])
assert.equal(disabled.stderr.trim(),'')
assert.ok(disabled.stdout.includes(disabledText))
await writeFile(join(root,'disabled-output.jsonl'),disabled.stdout)
async function sessionLogs(directory) {
  const logs=[]
  for(const entry of await readdir(directory,{withFileTypes:true})) {
    const path=join(directory,entry.name)
    if(entry.isDirectory())logs.push(...await sessionLogs(path))
    else if(entry.name==='session.v4.jsonl')logs.push((await readFile(path,'utf8')).trim().split('\n').map(JSON.parse))
  }
  return logs
}
const recordedLogs=await sessionLogs(join(root,'sessions'))
const initialLog=recordedLogs.find(rows=>rows.some(row=>row.type==='assistant/message'&&JSON.stringify(row.data).includes(finalText)))
assert.ok(initialLog)
function resumeToolNames(header){assert.ok(Array.isArray(header.data.header.tools));return header.data.header.tools.map(tool=>tool.name).filter(name=>name.startsWith('resume_')).sort()}
const initialHeader=initialLog.find(row=>row.type==='request/header');assert.ok(initialHeader)
assert.deepEqual(resumeToolNames(initialHeader),['resume_apply','resume_create','resume_export','resume_history','resume_list','resume_propose','resume_read','resume_restore','resume_revert'])
const disabledLog=recordedLogs.find(rows=>rows.some(row=>row.type==='assistant/message'&&JSON.stringify(row.data).includes(disabledText)))
assert.ok(disabledLog,'The disabled turn must be persisted')
const headers=disabledLog.filter(row=>row.type==='request/header')
assert.ok(headers.length>0,'The disabled turn must log its actual model tools')
for(const header of headers)assert.deepEqual(resumeToolNames(header),[],'Disabled plugins must contribute no resume tools')
await writeFile(join(root,'script.json'),JSON.stringify([tool('resume_read',{id:receipt.resumeId,elementId:data.document.pages[0].elements[0].id},1),finish('REINSTALLED_RESUME_READ_COMPLETE')],null,2)+'\n')
await writeFile(overlayPath,JSON.stringify([...overlay,{id:'fast-resume',disabled:false},{id:'fast-resume-tools',disabled:false}],null,2)+'\n')
const resumed=await invoke(['--profile','headless','--patch',overlayPath,'--json','Read the retained resume after re-enabling the plugin.'])
assert.equal(resumed.stderr.trim(),'')
const resumedResults=resumed.stdout.trim().split('\n').map(JSON.parse).filter(event=>event.type==='tool_result')
assert.equal(resumedResults.length,1)
assert.equal(resumedResults[0].status,'completed')
const retained=typeof resumedResults[0].result==='string'?JSON.parse(resumedResults[0].result):resumedResults[0].result
assert.equal(retained.revision,2)
assert.equal(retained.element.content,text)
assert.ok(resumed.stdout.includes('REINSTALLED_RESUME_READ_COMPLETE'))
await writeFile(join(root,'reinstalled-output.jsonl'),resumed.stdout)
await writeFile(join(root, 'verification.json'), JSON.stringify({ provider: 'scripted-test', liveModel: false, normalToolCalls: results.length, revision: receipt.revision, artifactPath: receipt.artifactPath, uninstallRetainedData: true, reinstalledRead:true, disabledToolsAbsent:true, reenabledRead:true }, null, 2) + '\n')
process.stdout.write(`PASS: packed plugin install, six logged Session tools, committed JSON, uninstall/reinstall retention and disable/re-enable\nEvidence: ${root}\nThis scripted provider is not live-model optimization evidence.\n`)

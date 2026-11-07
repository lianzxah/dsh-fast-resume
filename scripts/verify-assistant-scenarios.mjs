/** Installed CLI acceptance for curated live turns and separate deterministic scripts. */
import { mkdir, readFile, writeFile, readdir, realpath } from 'node:fs/promises'
import { join, resolve, basename } from 'node:path'
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'

const catalog=['resume_apply','resume_context','resume_create','resume_edit','resume_export','resume_history','resume_list','resume_propose','resume_read','resume_restore','resume_revert']
const json=async path=>JSON.parse(await readFile(path,'utf8'))
const rows=async path=>(await readFile(path,'utf8')).trim().split('\n').map(JSON.parse)
const uuid=value=>assert.match(value,/^[a-f0-9]{8}-[a-f0-9-]{27}$/)
const iso=value=>assert.equal(new Date(value).toISOString(),value)
/** Collect completed plaintext persistence files under this scenario's private root. */
async function logs(directory){
 const result=[]
 for(const entry of await readdir(directory,{withFileTypes:true})){
  const path=join(directory,entry.name)
  if(entry.isDirectory())result.push(...await logs(path))
  else if(entry.name==='session.v4.jsonl')result.push(await rows(path))
 }
 return result
}
/** Exclude only the document save timestamp; compare every other document field. */
function documentValue(document){const value=structuredClone(document);iso(value.metadata.updatedAt);delete value.metadata.updatedAt;return value}
/** Produce separate scripted-test responses from recorded arguments; never used in recorded mode. */
function scripted(expected){
 const script=expected.calls.map(call=>({kind:'chunks',chunks:[
  {type:'block-start',index:0,blockType:'tool-call'},
  {type:'tool-call-delta',index:0,id:call.callId,name:call.name,argumentsDelta:JSON.stringify(call.arguments)},
  {type:'block-end',index:0,block:{type:'tool-call',id:call.callId,name:call.name,arguments:JSON.stringify(call.arguments)}},
  {type:'finish',reason:{kind:'tool-calls'}},
 ]}))
 script.push({kind:'chunks',chunks:[{type:'block-start',index:0,blockType:'text'},{type:'text-delta',index:0,text:expected.finish},{type:'block-end',index:0,block:{type:'text',text:expected.finish}},{type:'finish',reason:{kind:'stop'}}]})
 return script
}
/** Run each seeded scenario through the supported headless --session-id continuation. */
export async function verifyAssistantScenarios({root,invoke,replay,mode}){
 for(const name of ['plugin-entry','ordinary-entry','proposal-model-undo']){
  const fixture=resolve(import.meta.dirname,'../tests/fixtures/live-assistant',name)
  const [seed,committed,context,expected,prefix]=await Promise.all(['resume.json','committed.json','context.json','expected.json'].map(file=>json(join(fixture,file))).concat(rows(join(fixture,'prefix.jsonl'))))
  const scenario=join(root,mode,name),storage=join(scenario,'resume-data'),sessions=join(scenario,'sessions')
  await mkdir(join(storage,'contexts-v1'),{recursive:true})
  assert.equal(prefix.length,4);assert.equal(prefix[0].cwd,'{{cwd}}')
  const cwd=await realpath(root)
  prefix[0].cwd=cwd
  assert.equal(prefix[0].agentPreset,'standard','Only the recorded Web Standard preset may be projected')
  delete prefix[0].agentPreset // Headless intentionally cannot compose Web agent presets.
  const sessionId=prefix[0].id,resumeId=seed.document.id
  assert.equal(context.context.sessionId,sessionId);assert.equal(context.context.resumeId,resumeId)
  assert.equal(seed.revision,expected.baseRevision)
  await writeFile(join(storage,`${resumeId}.json`),JSON.stringify(seed))
  const contextPath=join(storage,'contexts-v1',createHash('sha256').update(sessionId).digest('hex')+'.json')
  await writeFile(contextPath,JSON.stringify(context))
  // Persistence groups an absolute working directory by its encoded path components.
  const encoded=cwd.replace(/[\\/:]+/g,'-').replace(/[^A-Za-z0-9._-]/g,char=>'~'+char.charCodeAt(0).toString(16).toUpperCase().padStart(4,'0')).replace(/^-+/,'')
  const sessionDirectory=join(sessions,`--${encoded.slice(0,251)}--`,sessionId)
  await mkdir(sessionDirectory,{recursive:true})
  await writeFile(join(sessionDirectory,'session.v4.jsonl'),prefix.map(row=>JSON.stringify(row)).join('\n')+'\n')
  const replayConfig={file:join(fixture,'session.v4.jsonl'),providers:[{id:'resume-acceptance',name:'Keyless acceptance',models:[{id:'recorded',contextWindow:128000}]}]}
  if(mode==='scripted'){
   const path=join(scenario,'script.json');await writeFile(path,JSON.stringify(scripted(expected)))
   replayConfig.overrideFile=path
  }
  const overlay=[
   {id:'agent-default-model',config:{provider:'resume-acceptance',model:'recorded'}},
   {id:'session-title-llm',disabled:true},
   {id:'session-persistence-jsonl',config:{root:sessions,compression:'none'}},
   {id:'fast-resume',config:{storageDir:storage}},
   {insert:[{id:'resume-acceptance-replay',name:resolve(replay),config:replayConfig}]},
  ]
  const patch=join(scenario,'overlay.json');await writeFile(patch,JSON.stringify(overlay))
  const output=await invoke(['--profile','headless','--patch',patch,'--session-id',sessionId,'--json',(await readFile(join(fixture,'prompt.txt'),'utf8')).trim()])
  await writeFile(join(scenario,'output.jsonl'),output.stdout);await writeFile(join(scenario,'diagnostics.log'),output.stderr)
  assert.equal(output.stderr.trim(),'')
  const events=output.stdout.trim().split('\n').map(JSON.parse),results=events.filter(row=>row.type==='tool_result')
  assert.equal(results.length,expected.calls.length,`${name}: every recorded tool executes`)
  const stored=await logs(sessions);assert.equal(stored.length,1);assert.equal(stored[0][0].id,sessionId)
  const persistedResults=stored[0].filter(row=>row.type==='tool/result').map(row=>row.data.message)
  assert.equal(persistedResults.length,expected.calls.length)
  const actual=await json(join(storage,`${resumeId}.json`))
  assert.equal(actual.schemaVersion,1);assert.equal(actual.revision,expected.revision)
  assert.deepEqual(documentValue(actual.document),documentValue(committed.document),`${name}: complete saved document`)
  assert.equal(actual.versions.length,committed.versions.length)
  assert.deepEqual(actual.versions.slice(0,seed.versions.length),seed.versions,'Prior version snapshots remain intact')
  assert.deepEqual(actual.changes.slice(0,seed.changes.length),seed.changes,'Prior receipts remain intact')
  const changes=actual.changes.slice(seed.changes.length);assert.equal(changes.length,1)
  const recordedChange=committed.changes.at(-1),change=changes[0]
  const expectedChange={...recordedChange,createdAt:change.createdAt};iso(change.createdAt)
  if(recordedChange.proposalId){uuid(change.proposalId);expectedChange.proposalId=change.proposalId}
  assert.deepEqual(change,expectedChange,'Exact request, batch, revision and changed element receipt')
  assert.equal(actual.proposals.length,committed.proposals.length)
  const expectedProposals=structuredClone(committed.proposals)
  if(recordedChange.proposalId){
   const proposal=expectedProposals.find(value=>value.id===recordedChange.proposalId);assert.ok(proposal)
   proposal.id=change.proposalId
  }
  assert.deepEqual(actual.proposals,expectedProposals,'Durable proposal payload and status')
  const version=actual.versions.at(-1),expectedVersion=committed.versions.at(-1)
  uuid(version.id);iso(version.createdAt)
  assert.deepEqual(version,{...expectedVersion,id:version.id,createdAt:version.createdAt,document:actual.document},'Saved history matches the full committed document')
  for(let index=0;index<results.length;index++){
   const result=results[index],oracle=expected.results[index],call=expected.calls[index]
   assert.equal(result.callId,call.callId)
   const persisted=persistedResults[index]
   assert.equal(persisted.toolCallId,call.callId);assert.equal(persisted.isError,oracle.isError)
   const persistedText=persisted.content.filter(block=>block.type==='text').map(block=>block.text).join('')
   if(oracle.isError){
    assert.equal(result.status,'error','The malformed recorded edit must remain rejected')
    assert.equal(persistedText,oracle.value)
    continue
   }
   assert.equal(result.status,'completed',JSON.stringify(result))
   const value=JSON.parse(persistedText),wanted=structuredClone(oracle.value)
   if(call.name==='resume_read'&&value.document){value.document=documentValue(value.document);wanted.document=documentValue(wanted.document)}
   if(call.name==='resume_edit'){
    assert.deepEqual(value.receipt,change);wanted.receipt=expectedChange
   }
   if(call.name==='resume_revert'){
    assert.deepEqual(value,change);Object.assign(wanted,expectedChange)
   }
   if(call.name==='resume_export'){
    uuid(value.id);assert.equal(basename(value.artifactPath),value.id+'.json')
    assert.equal(resolve(value.artifactPath),join(storage,'exports',value.id+'.json'))
    const bytes=await readFile(value.artifactPath);assert.equal(bytes.length,value.byteSize)
    const exported=JSON.parse(bytes);assert.equal(value.revision,expected.revision)
    assert.equal(exported.format,'fast-resume-backup');assert.equal(exported.schemaVersion,1);iso(exported.exportedAt)
    assert.deepEqual(exported.document,actual.document,'JSON contains the exact saved revision')
    wanted.id=value.id;wanted.artifactPath=value.artifactPath
   }
   assert.deepEqual(value,wanted,`${name}: ${call.name} result`)
  }
  const updatedContext=await json(contextPath)
  assert.equal(updatedContext.context.sessionId,sessionId);assert.equal(updatedContext.context.resumeId,resumeId)
  assert.equal(updatedContext.context.source,'committed-edit')
  const calls=stored[0].filter(row=>row.type==='tool/call').map(row=>({name:row.data.name,arguments:JSON.parse(row.data.arguments),callId:row.data.callId}))
  assert.deepEqual(calls,expected.calls,'Actual persisted tool names and arguments remain unchanged')
  const headers=stored[0].filter(row=>row.type==='request/header');assert.ok(headers.length)
  for(const header of headers)assert.deepEqual(header.data.header.tools.map(tool=>tool.name).filter(name=>name.startsWith('resume_')).sort(),catalog)
  const assistant=stored[0].filter(row=>row.type==='assistant/message')
  assert.equal(assistant.length,mode==='recorded'?expected.modelCalls:expected.calls.length+1)
  const final=assistant.at(-1).data.message.content.filter(block=>block.type==='text').map(block=>block.text).join('')
  assert.equal(final,expected.finish)
  await writeFile(join(scenario,'verification.json'),JSON.stringify({mode,name,sessionId,resumeId,baseRevision:seed.revision,revision:actual.revision,change,toolCalls:calls.length,errors:expected.results.filter(result=>result.isError).length,providerIO:false},null,2)+'\n')
  console.log(`PASS: ${mode} ${name}, explicit headless projection, ${calls.length} calls, revision ${seed.revision}→${actual.revision}, complete document/receipts/catalog`)
 }
}

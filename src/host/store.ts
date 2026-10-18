/** Profile-local atomic envelopes, revisions, durable proposals, and import parsing. */
import {brandString,brandNumber} from '@deepseek-ai/dsh-brand'
import {resumeRevisionSchema,versionIdSchema,proposalIdSchema} from '../identity.ts'
import type {ResumeId,ResumeRevision,ResumeVersionId,ResumeProposalId} from '../types.ts'
import { randomUUID, createHash } from 'node:crypto'
import { mkdir, readFile, readdir, rm, stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { z } from 'zod'
import { writeFileAtomic, withFileLock } from '@deepseek-ai/dsh-atomic-write'
import { parseResumeBackup, resumeDataToPages } from '../../upstream/shared/src/index.ts'
import { docxToParsedDocument, pdfToParsedDocument, parseMarkdown, toResumeDataWithFallback } from '../../upstream/server/document-parser.ts'
import type { Config, ResolvedConfig, ResumeDocument, ResumeSnapshot, ResumeSummary, ResumeEnvelope, CreateRequest, SaveRequest, ProposeRequest, ApplyRequest, RevertRequest, RestoreRequest, ProposalView, ChangeReceipt, HistoryView, ImportRequest } from '../types.ts'
import { reverseChange } from './revert.ts'
import { ResumeError } from './errors.ts'
import { applyOperations, decodeJson, duplicateDocument, newDocument, validateDocument } from './operations.ts'

const positive=z.number().int().positive().safe()
const configSchema=z.strictObject({storageDir:z.string().min(1).optional(),autosaveDelayMs:positive.default(2000),maxDocumentBytes:positive.default(10485760),maxImportBytes:positive.default(10485760),maxVersions:positive.default(100),renderTimeoutMs:positive.default(30000),lockWaitMs:positive.default(10000),maxRenderRequests:positive.default(8),rendererLeaseMs:positive.default(15000),maxProposalOperations:positive.default(256),renderPixelRatio:z.number().min(0.1).max(4).default(2),maxRenderPixels:positive.default(32000000),frameConnectTimeoutMs:positive.default(15000),bridgeTimeoutMs:positive.optional(),rendererPollIntervalMs:positive.default(1000),refreshIntervalMs:positive.default(2000)})
/** Resolve defaults explicitly once, before the store/service accepts work.
 * @param profileDir Launcher-owned selected profile directory.
 * @param input User plugin configuration.
 * @returns Complete validated deployment choices.
 */
export function resolveConfig(profileDir:string,input:Config):ResolvedConfig {
 const parsed=configSchema.safeParse(input)
 if(!parsed.success)throw new ResumeError('invalid-input',`Invalid Fast Resume configuration: ${parsed.error.message}`)
 const bridgeTimeoutMs=parsed.data.bridgeTimeoutMs??(parsed.data.renderTimeoutMs+parsed.data.frameConnectTimeoutMs)
 if(!Number.isSafeInteger(bridgeTimeoutMs)||bridgeTimeoutMs<parsed.data.renderTimeoutMs+parsed.data.frameConnectTimeoutMs)throw new ResumeError('invalid-input','bridgeTimeoutMs must cover renderTimeoutMs plus frameConnectTimeoutMs')
 if(parsed.data.rendererPollIntervalMs>=parsed.data.rendererLeaseMs)throw new ResumeError('invalid-input','rendererPollIntervalMs must be less than rendererLeaseMs')
 return{...parsed.data,bridgeTimeoutMs,storageDir:resolve(parsed.data.storageDir??join(profileDir,'data/fast-resume'))}
}
const versionSchema=z.object({id:z.string().uuid().transform(brandString<ResumeVersionId>),revision:resumeRevisionSchema,name:z.string(),createdAt:z.string(),document:z.unknown()})
const changeSchema=z.object({requestId:z.string().min(1),proposalId:proposalIdSchema.optional(),versionId:versionIdSchema.optional(),revertedProposalId:proposalIdSchema.optional(),revision:resumeRevisionSchema,changedElementIds:z.array(z.string()),createdAt:z.string()})
const proposalSchema=z.object({id:z.string().uuid().transform(brandString<ResumeProposalId>),baseRevision:resumeRevisionSchema,summary:z.string(),operationsJson:z.string(),beforeAfterJson:z.string(),status:z.enum(['proposed','applied']),requestId:z.string(),fingerprint:z.string(),document:z.unknown(),changedElementIds:z.array(z.string())})
const envelopeSchema=z.strictObject({schemaVersion:z.literal(1),revision:resumeRevisionSchema,document:z.unknown(),versions:z.array(versionSchema),proposals:z.array(proposalSchema),changes:z.array(changeSchema),sessionId:z.string().optional(),deleted:z.boolean().optional()})
const requestIdSchema=z.string().min(1).max(256)
const requestRevision=z.number().int().positive().safe()
const fingerprint=(input:unknown):string=>createHash('sha256').update(JSON.stringify(input)).digest('hex')
/** Atomic write callback, injectable only at the infrastructure owner for failure tests. */
export type EnvelopeWriter=(path:string,data:string)=>Promise<void>
/** CRUD and revision changes for one independent profile-local store. */
export class ResumeStore {
 constructor(readonly config:ResolvedConfig,private readonly write:EnvelopeWriter=(path,data)=>writeFileAtomic(path,data,{mode:0o600,dirMode:0o700})){}
 private filename(id:string):string {if(!z.string().uuid().safeParse(id).success)throw new ResumeError('invalid-input','Invalid resume id');return join(this.config.storageDir,`${id}.json`)}
 private async locked<T>(id:string,operation:()=>Promise<T>):Promise<T>{await mkdir(this.config.storageDir,{recursive:true,mode:0o700});try{return await withFileLock(this.filename(id),operation,{waitMs:this.config.lockWaitMs})}catch(error){if(error instanceof ResumeError)throw error;throw new ResumeError('storage-failure',`Resume transaction failed: ${error instanceof Error?error.message:String(error)}`)}}
 private async envelope(id:string):Promise<ResumeEnvelope>{
  let raw:unknown
  try{const path=this.filename(id);if((await stat(path)).size>this.config.maxDocumentBytes*(this.config.maxVersions+2))throw new ResumeError('invalid-storage','Envelope exceeds configured storage limit');raw=JSON.parse(await readFile(path,'utf8'))}
  catch(error){if(error instanceof ResumeError)throw error;if((error as NodeJS.ErrnoException).code==='ENOENT')throw new ResumeError('not-found','Resume does not exist');throw new ResumeError('invalid-storage',`Resume cannot be read: ${error instanceof Error?error.message:String(error)}`)}
  const parsed=envelopeSchema.safeParse(raw)
  if(!parsed.success)throw new ResumeError('invalid-storage',`Unsupported or invalid resume envelope: ${parsed.error.message}`)
  try{
   const data=parsed.data;const document=validateDocument(data.document,this.config.maxDocumentBytes)
   if(document.id!==id)throw new ResumeError('invalid-storage','Envelope document id differs from filename')
   const versions=data.versions.map(version=>({...version,document:validateDocument(version.document,this.config.maxDocumentBytes)}))
   const proposals=data.proposals.map(proposal=>({...proposal,document:validateDocument(proposal.document,this.config.maxDocumentBytes)}))
   if(versions.some(version=>version.document.id!==id||version.revision>data.revision)||proposals.some(proposal=>proposal.document.id!==id||proposal.baseRevision>data.revision)||data.changes.some(change=>change.revision>data.revision))throw new ResumeError('invalid-storage','History has inconsistent identities or future revisions')
   return{...data,document,versions,proposals}
  }catch(error){if(error instanceof ResumeError&&error.code==='invalid-storage')throw error;throw new ResumeError('invalid-storage',`Invalid persisted document: ${error instanceof Error?error.message:String(error)}`)}
 }
 private snapshot(envelope:ResumeEnvelope):ResumeSnapshot{return{id:brandString<ResumeId>(envelope.document.id),title:envelope.document.metadata.title,revision:envelope.revision,pageCount:envelope.document.pages.length,updatedAt:envelope.document.metadata.updatedAt,documentJson:JSON.stringify(envelope.document),...(envelope.sessionId===undefined?{}:{sessionId:envelope.sessionId})}}
 private async persist(envelope:ResumeEnvelope):Promise<void>{const text=JSON.stringify(envelope)+'\n';if(Buffer.byteLength(text)>this.config.maxDocumentBytes*(this.config.maxVersions+2))throw new ResumeError('storage-failure','Resume history exceeds configured storage limit; archive a copy before continuing');try{await this.write(this.filename(envelope.document.id),text)}catch(error){throw new ResumeError('storage-failure',`Resume was not saved: ${error instanceof Error?error.message:String(error)}`)}}
 private check(envelope:ResumeEnvelope,revision:number):void {if(!requestRevision.safeParse(revision).success)throw new ResumeError('invalid-input','Expected revision must be a positive safe integer');if(envelope.revision!==revision)throw new ResumeError('conflict','Resume changed; reload or save your draft as a copy',envelope.revision)}
 private version(envelope:ResumeEnvelope,name:string):void {envelope.versions.push({id:brandString<ResumeVersionId>(randomUUID()),revision:envelope.revision,name,createdAt:new Date().toISOString(),document:structuredClone(envelope.document)});envelope.versions=envelope.versions.slice(-this.config.maxVersions)}
 private commit(envelope:ResumeEnvelope,document:ResumeDocument,name:string):void {envelope.document=validateDocument(document,this.config.maxDocumentBytes);envelope.revision=brandNumber<ResumeRevision>(envelope.revision+1);envelope.document.metadata.updatedAt=new Date().toISOString();this.version(envelope,name)}
 /** List summaries in the active profile.
  * @returns No complete documents or image data.
  */
 async list():Promise<ResumeSummary[]> {await mkdir(this.config.storageDir,{recursive:true,mode:0o700});const result:ResumeSummary[]=[];for(const filename of await readdir(this.config.storageDir)){if(!filename.endsWith('.json'))continue;try{const {documentJson:_document,sessionId:_session,...summary}=await this.read(brandString<ResumeId>(filename.slice(0,-5)));result.push(summary)}catch(error){if(error instanceof ResumeError&&error.code==='not-found')continue;throw error}}return result.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))}
 /** Read the exact committed revision.
  * @param id Profile-local resume id.
  * @returns Detached snapshot.
  */
 async read(id:ResumeId):Promise<ResumeSnapshot>{return this.snapshot(await this.envelope(id))}
 /** Create a blank, template, or imported document.
  * @param request Initial content and optional associated Session.
  * @returns Revision-one snapshot with fresh recursive identities.
  */
 async create(request:CreateRequest):Promise<ResumeSnapshot>{if(typeof request.title!=='string'||request.title.trim().length===0)throw new ResumeError('invalid-input','A resume title is required');const document=request.documentJson===undefined?newDocument(request.title,request.templateId):duplicateDocument(validateDocument(decodeJson(request.documentJson),this.config.maxDocumentBytes),request.title);const envelope:ResumeEnvelope={schemaVersion:1,revision:brandNumber<ResumeRevision>(1),document:validateDocument(document,this.config.maxDocumentBytes),versions:[],proposals:[],changes:[],...(request.sessionId===undefined?{}:{sessionId:request.sessionId})};this.version(envelope,'Created');await this.locked(document.id,()=>this.persist(envelope));return this.snapshot(envelope)}
 /** Save a browser draft against its last acknowledged revision.
  * @param request Exact document, expected revision, optional version name.
  * @returns Next committed snapshot.
  */
 async save(request:SaveRequest):Promise<ResumeSnapshot>{const document=validateDocument(decodeJson(request.documentJson),this.config.maxDocumentBytes);if(document.id!==request.id)throw new ResumeError('invalid-input','Saved document id must match the requested resume');return this.locked(request.id,async()=>{const envelope=await this.envelope(request.id);this.check(envelope,request.expectedRevision);this.commit(envelope,document,request.versionName??'Saved');if(request.sessionId!==undefined)envelope.sessionId=request.sessionId;await this.persist(envelope);return this.snapshot(envelope)})}
 /** Rename without changing document contents.
  * @param id Resume id.
  * @param expectedRevision Last acknowledged revision.
  * @param title Nonempty replacement title.
  * @returns Committed snapshot.
  */
 async rename(id:ResumeId,expectedRevision:ResumeRevision,title:string):Promise<ResumeSnapshot>{if(typeof title!=='string'||!title.trim())throw new ResumeError('invalid-input','Title is required');const snapshot=await this.read(id);const document=validateDocument(decodeJson(snapshot.documentJson),this.config.maxDocumentBytes);document.metadata.title=title;return this.save({id,expectedRevision,documentJson:JSON.stringify(document)})}
 /** Duplicate recursively with fresh document, page, and element identities.
  * @param id Source resume id.
  * @returns Independent revision-one snapshot.
  */
 async duplicate(id:ResumeId):Promise<ResumeSnapshot>{const source=await this.read(id);return this.create({title:`${source.title} (copy)`,documentJson:source.documentJson})}
 /** Explicitly delete one resume under its writer lock.
  * @param id Document identity.
  * @param expectedRevision Last acknowledged revision.
  * @returns True after removal.
  */
 async remove(id:ResumeId,expectedRevision:ResumeRevision):Promise<boolean>{return this.locked(id,async()=>{const envelope=await this.envelope(id);this.check(envelope,expectedRevision);await rm(this.filename(id));return true})}
 /** Validate and persist a proposal without changing the document revision.
  * @param request Bounded typed operations and base revision.
  * @returns Durable readable preview.
  */
 async propose(request:ProposeRequest):Promise<ProposalView>{if(!requestIdSchema.safeParse(request.requestId).success)throw new ResumeError('invalid-input','Proposal request id is required');return this.locked(request.id,async()=>{const envelope=await this.envelope(request.id);const hash=fingerprint(request);const old=envelope.proposals.find(p=>p.requestId===request.requestId);if(old){if(old.fingerprint!==hash)throw new ResumeError('conflict','Request id already belongs to different proposal inputs');return this.proposalView(old)}this.check(envelope,request.expectedRevision);const applied=applyOperations(envelope.document,request.operationsJson,this.config.maxProposalOperations,this.config.maxDocumentBytes);const proposal={id:brandString<ResumeProposalId>(randomUUID()),baseRevision:envelope.revision,summary:request.summary,operationsJson:request.operationsJson,beforeAfterJson:JSON.stringify({before:envelope.document,after:applied.document}),status:'proposed' as const,requestId:request.requestId,fingerprint:hash,document:applied.document,changedElementIds:applied.changedElementIds};envelope.proposals.push(proposal);await this.persist(envelope);return this.proposalView(proposal)})}
 private proposalView(proposal:ResumeEnvelope['proposals'][number]):ProposalView {return{id:proposal.id,baseRevision:proposal.baseRevision,summary:proposal.summary,operationsJson:proposal.operationsJson,beforeAfterJson:proposal.beforeAfterJson,status:proposal.status}}
 /** Apply one proposal once, atomically committing receipt and version.
  * @param request Explicit proposal and idempotency key.
  * @returns The original receipt for an identical retried request.
  */
 async apply(request:ApplyRequest):Promise<ChangeReceipt>{if(!requestIdSchema.safeParse(request.requestId).success)throw new ResumeError('invalid-input','Apply request id is required');return this.locked(request.id,async()=>{const envelope=await this.envelope(request.id);const old=envelope.changes.find(change=>change.requestId===request.requestId);if(old){if(old.proposalId!==request.proposalId||old.revertedProposalId!==undefined)throw new ResumeError('conflict','Request id already belongs to a different mutation');return old}const proposal=envelope.proposals.find(p=>p.id===request.proposalId);if(!proposal)throw new ResumeError('not-found','Proposal does not exist');if(proposal.status==='applied')throw new ResumeError('conflict','Proposal was already applied');this.check(envelope,proposal.baseRevision);this.commit(envelope,structuredClone(proposal.document),proposal.summary);proposal.status='applied';const receipt:ChangeReceipt={requestId:request.requestId,proposalId:proposal.id,revision:envelope.revision,changedElementIds:proposal.changedElementIds,createdAt:new Date().toISOString()};envelope.changes.push(receipt);await this.persist(envelope);return receipt})}
 /** Undo one applied proposal through a three-way comparison.
  * @param request Applied proposal, expected revision, and idempotency key.
  * @returns Receipt for a new revision preserving unrelated current fields.
  */
 async revert(request:RevertRequest):Promise<ChangeReceipt>{if(!requestIdSchema.safeParse(request.requestId).success)throw new ResumeError('invalid-input','Undo request id is required');return this.locked(request.id,async()=>{const envelope=await this.envelope(request.id);const old=envelope.changes.find(change=>change.requestId===request.requestId);if(old){if(old.revertedProposalId!==request.proposalId)throw new ResumeError('conflict','Request id already belongs to a different mutation');return old}this.check(envelope,request.expectedRevision);const proposal=envelope.proposals.find(proposal=>proposal.id===request.proposalId);if(!proposal||proposal.status!=='applied')throw new ResumeError('not-found','Applied proposal does not exist');if(envelope.changes.some(change=>change.revertedProposalId===proposal.id))throw new ResumeError('conflict','Proposal was already undone');const raw=z.object({before:z.unknown(),after:z.unknown()}).safeParse(decodeJson(proposal.beforeAfterJson));if(!raw.success)throw new ResumeError('invalid-storage','Stored change preview is invalid');const before=validateDocument(raw.data.before,this.config.maxDocumentBytes);const after=validateDocument(raw.data.after,this.config.maxDocumentBytes);const document=validateDocument(reverseChange(before,after,envelope.document),this.config.maxDocumentBytes);this.commit(envelope,document,`Undid ${proposal.summary}`);const receipt:ChangeReceipt={requestId:request.requestId,revertedProposalId:proposal.id,revision:envelope.revision,changedElementIds:proposal.changedElementIds,createdAt:new Date().toISOString()};envelope.changes.push(receipt);await this.persist(envelope);return receipt})}
 /** List named versions, proposals and committed receipts.
  * @param id Resume identity.
  * @returns Detached history summaries and previews.
  */
 async history(id:ResumeId):Promise<HistoryView>{const envelope=await this.envelope(id);return{versions:envelope.versions.map(({document:_document,...summary})=>summary),proposals:envelope.proposals.map(proposal=>this.proposalView(proposal)),changes:envelope.changes}}
 /** Load a historical document without mutating the current revision.
  * @param id Resume identity.
  * @param versionId Retained version identity.
  * @returns Snapshot at its historical revision.
  */
 async versionRead(id:ResumeId,versionId:ResumeVersionId):Promise<ResumeSnapshot>{const envelope=await this.envelope(id);const version=envelope.versions.find(v=>v.id===versionId);if(!version)throw new ResumeError('not-found','Version is no longer retained');return this.snapshot({...envelope,revision:version.revision,document:version.document})}
 /** Restore a retained version as a new revision.
  * @param request Expected current revision and idempotent restore key.
  * @returns Durable receipt; revisions never roll back.
  */
 async restore(request:RestoreRequest):Promise<ChangeReceipt>{if(!requestIdSchema.safeParse(request.requestId).success)throw new ResumeError('invalid-input','Restore request id is required');return this.locked(request.id,async()=>{const envelope=await this.envelope(request.id);const old=envelope.changes.find(change=>change.requestId===request.requestId);if(old){if(old.versionId!==request.versionId||old.proposalId!==undefined||old.revertedProposalId!==undefined)throw new ResumeError('conflict','Request id already belongs to a different mutation');return old}this.check(envelope,request.expectedRevision);const version=envelope.versions.find(v=>v.id===request.versionId);if(!version)throw new ResumeError('not-found','Version is no longer retained');this.commit(envelope,structuredClone(version.document),`Restored ${version.name}`);const receipt:ChangeReceipt={requestId:request.requestId,versionId:version.id,revision:envelope.revision,changedElementIds:[],createdAt:new Date().toISOString()};envelope.changes.push(receipt);await this.persist(envelope);return receipt})}
 /** Import upstream backup or semantic Markdown/DOCX/PDF into an independent document.
  * @param request Size-bounded base64 file and declared format.
  * @returns New editable document snapshot.
  */
 async importDocument(request:ImportRequest):Promise<ResumeSnapshot>{if(typeof request.dataBase64!=='string'||request.dataBase64.length>Math.ceil(this.config.maxImportBytes/3)*4||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(request.dataBase64))throw new ResumeError('invalid-input','Invalid or oversized import');const bytes=Buffer.from(request.dataBase64,'base64');if(bytes.length>this.config.maxImportBytes)throw new ResumeError('invalid-input','Import exceeds configured byte limit');try{if(request.format==='json'){const parsed=parseResumeBackup(bytes.toString('utf8'));return await this.create({title:request.title??parsed.document.metadata.title,documentJson:JSON.stringify(parsed.document)})}const data=request.format==='markdown'?parseMarkdown(bytes.toString('utf8')):request.format==='docx'?toResumeDataWithFallback(await docxToParsedDocument(Uint8Array.from(bytes).buffer)):request.format==='pdf'?toResumeDataWithFallback(await pdfToParsedDocument(Uint8Array.from(bytes).buffer)):undefined;if(data===undefined)throw new ResumeError('invalid-input','Unsupported import format');const document=newDocument(request.title??request.filename);document.resumeData=data;document.pages=resumeDataToPages(data);return await this.create({title:document.metadata.title,documentJson:JSON.stringify(document)})}catch(error){if(error instanceof ResumeError)throw error;throw new ResumeError('invalid-input',`Import failed: ${error instanceof Error?error.message:String(error)}`)}}
}

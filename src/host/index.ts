/** Atomic Fast Resume service and generated authenticated Remote methods. */
import { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-app-boot'
import { TypertRemoteService, Remote, RemoteError } from '@deepseek-ai/dsh-typert-protocol'
import Schema from '@deepseek-ai/schemastery'
import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'
import { serializeResumeBackup } from '../../upstream/shared/src/index.ts'
import type { ResumeId,ResumeRevision,ResumeVersionId,Config, ResolvedConfig, ResumeSnapshot, ResumeSummary, CreateRequest, SaveRequest, ProposeRequest, ApplyRequest, RevertRequest, RestoreRequest, ProposalView, ChangeReceipt, HistoryView, ImportRequest, ExportRequest, ExportReceipt, RendererLease, RenderJob, RenderCompletion, EditorAssets } from '../types.ts'
import { ResumeStore, resolveConfig } from './store.ts'
import { RenderQueue } from './render-queue.ts'
import { ResumeError } from './errors.ts'
import { decodeJson, validateDocument } from './operations.ts'
export type * from '../types.ts'
export { ResumeError } from './errors.ts'

declare module '@deepseek-ai/cordis' {interface Context {fastResume:FastResumeService}}
/** One service instance owns the selected profile's store and connected render queue. */
export class FastResumeService extends TypertRemoteService {
 static inject=['profileContext']
 static Config=Schema.object({storageDir:Schema.string(),autosaveDelayMs:Schema.number().min(1).step(1).default(2000),maxDocumentBytes:Schema.number().min(1).step(1).default(10485760),maxImportBytes:Schema.number().min(1).step(1).default(10485760),maxVersions:Schema.number().min(1).step(1).default(100),renderTimeoutMs:Schema.number().min(1).step(1).default(30000),lockWaitMs:Schema.number().min(1).step(1).default(10000),maxRenderRequests:Schema.number().min(1).step(1).default(8),rendererLeaseMs:Schema.number().min(1).step(1).default(15000),maxProposalOperations:Schema.number().min(1).step(1).default(256),renderPixelRatio:Schema.number().min(0.1).max(4).default(2),maxRenderPixels:Schema.number().min(1).step(1).default(32000000),frameConnectTimeoutMs:Schema.number().min(1).step(1).default(15000),bridgeTimeoutMs:Schema.number().min(1).step(1),rendererPollIntervalMs:Schema.number().min(1).step(1).default(1000),refreshIntervalMs:Schema.number().min(1).step(1).default(2000)})
 private readonly store:ResumeStore
 private readonly queue:RenderQueue
 private readonly config:ResolvedConfig
 constructor(ctx:Context,config:Config={}) {super(ctx,'fastResume');this.config=resolveConfig(ctx.profileContext.dir,config);this.store=new ResumeStore(this.config);this.queue=new RenderQueue({timeoutMs:this.config.renderTimeoutMs,leaseMs:this.config.rendererLeaseMs,maxRequests:this.config.maxRenderRequests,maxBytes:this.config.maxDocumentBytes,maxPixels:this.config.maxRenderPixels});ctx.effect(()=>()=>this.queue.dispose(),'fastResume.renderers()')}
 private async guard<T>(operation:()=>T|Promise<T>):Promise<T>{try{return await operation()}catch(error){if(error instanceof ResumeError)throw new RemoteError('FAST_RESUME_ERROR',error.message,{code:error.code,...(error.currentRevision===undefined?{}:{currentRevision:error.currentRevision})});throw error}}
 /** List resume summaries.
  * @returns Active profile documents.
  */
 @Remote async list():Promise<ResumeSummary[]>{return this.guard(()=>this.store.list())}
 /** Create a blank, template, or supplied document.
  * @param request Initial document selection.
  * @returns Revision-one independent snapshot.
  */
 @Remote async create(request:CreateRequest):Promise<ResumeSnapshot>{return this.guard(()=>this.store.create(request))}
 /** Read a committed document.
  * @param id Resume identity.
  * @returns Current snapshot.
  */
 @Remote async read(id:ResumeId):Promise<ResumeSnapshot>{return this.guard(()=>this.store.read(id))}
 /** Persist an optimistic draft.
  * @param request Full document and expected revision.
  * @returns New snapshot or a structured conflict.
  */
 @Remote async save(request:SaveRequest):Promise<ResumeSnapshot>{return this.guard(()=>this.store.save(request))}
 /** Rename one document with revision checking.
  * @param id Resume identity.
  * @param expectedRevision Current acknowledged revision.
  * @param title Replacement title.
  * @returns Committed snapshot.
  */
 @Remote async rename(id:ResumeId,expectedRevision:ResumeRevision,title:string):Promise<ResumeSnapshot>{return this.guard(()=>this.store.rename(id,expectedRevision,title))}
 /** Duplicate a document and all recursive ids.
  * @param id Source resume identity.
  * @returns New independent snapshot.
  */
 @Remote async duplicate(id:ResumeId):Promise<ResumeSnapshot>{return this.guard(()=>this.store.duplicate(id))}
 /** Remove a document explicitly.
  * @param id Resume identity.
  * @param expectedRevision Last acknowledged revision.
  * @returns True after deletion.
  */
 @Remote async deleteResume(id:ResumeId,expectedRevision:ResumeRevision):Promise<boolean>{return this.guard(()=>this.store.remove(id,expectedRevision))}
 /** Validate a durable proposal without mutating the current document.
  * @param request Revision-bound editing operations.
  * @returns Reviewable proposal and before/after preview.
  */
 @Remote async propose(request:ProposeRequest):Promise<ProposalView>{return this.guard(()=>this.store.propose(request))}
 /** Apply a proposal with a durable idempotency receipt.
  * @param request Explicit proposal selection.
  * @returns New revision receipt or original identical receipt.
  */
 @Remote async applyProposal(request:ApplyRequest):Promise<ChangeReceipt>{return this.guard(()=>this.store.apply(request))}
 /** Undo one applied proposal while retaining unrelated later changes.
  * @param request Expected revision and applied proposal identity.
  * @returns New mutation receipt or an overlapping-edit conflict.
  */
 @Remote async revert(request:RevertRequest):Promise<ChangeReceipt>{return this.guard(()=>this.store.revert(request))}
 /** List retained versions and proposals.
  * @param id Resume identity.
  * @returns History summaries and receipts.
  */
 @Remote async history(id:ResumeId):Promise<HistoryView>{return this.guard(()=>this.store.history(id))}
 /** Read one historical document.
  * @param id Resume identity.
  * @param versionId Retained snapshot identity.
  * @returns Historical snapshot.
  */
 @Remote async versionRead(id:ResumeId,versionId:ResumeVersionId):Promise<ResumeSnapshot>{return this.guard(()=>this.store.versionRead(id,versionId))}
 /** Restore as a new committed revision.
  * @param request Version and expected current revision.
  * @returns Durable receipt.
  */
 @Remote async restore(request:RestoreRequest):Promise<ChangeReceipt>{return this.guard(()=>this.store.restore(request))}
 /** Import a size-bounded file through retained upstream parsers.
  * @param request Declared format and base64 bytes.
  * @returns New editable snapshot.
  */
 @Remote async importDocument(request:ImportRequest):Promise<ResumeSnapshot>{return this.guard(()=>this.store.importDocument(request))}
 /** Read packaged editor HTML through the authenticated transport.
  * @returns Complete srcdoc and resolved adapter limits.
  */
 @Remote async editorAssets():Promise<EditorAssets>{return{html:await readFile(new URL('../assets/editor.html',import.meta.url),'utf8'),autosaveDelayMs:this.config.autosaveDelayMs,maxImportBytes:this.config.maxImportBytes,maxDocumentBytes:this.config.maxDocumentBytes,frameConnectTimeoutMs:this.config.frameConnectTimeoutMs,bridgeTimeoutMs:this.config.bridgeTimeoutMs,rendererPollIntervalMs:this.config.rendererPollIntervalMs,refreshIntervalMs:this.config.refreshIntervalMs}}
 /** Register one live client renderer.
  * @returns Lease token renewed by polling.
  */
 @Remote async rendererRegister():Promise<RendererLease>{return this.guard(()=>this.queue.register())}
 /** Renew a renderer and claim one job.
  * @param rendererId Private renderer lease token.
  * @returns Exact committed render job or null.
  */
 @Remote async rendererPoll(rendererId:string):Promise<RenderJob|null>{return this.guard(()=>this.queue.poll(rendererId))}
 /** Complete a claimed job with validated bytes or an explicit failure.
  * @param completion Renderer lease and result.
  * @returns True when the job was settled.
  */
 @Remote async rendererComplete(completion:RenderCompletion):Promise<boolean>{return this.guard(()=>this.queue.complete(completion))}
 /** Disconnect a renderer and reject its outstanding jobs.
  * @param rendererId Private lease token.
  * @returns True after cancellation.
  */
 @Remote async rendererUnregister(rendererId:string):Promise<boolean>{return this.guard(()=>{this.queue.unregister(rendererId);return true})}
 /** Store verified export bytes before returning a receipt.
  * @param request Exact revision and requested format/page.
  * @param signal Transport or tool cancellation signal.
  * @returns Downloadable bytes and durable artifact metadata.
  */
 @Remote async exportDocument(request:ExportRequest,signal:AbortSignal):Promise<ExportReceipt>{return this.guard(async()=>{
   const snapshot=await this.store.read(request.id)
   if(snapshot.revision!==request.expectedRevision)throw new ResumeError('conflict','Export revision changed',snapshot.revision)
   const document=validateDocument(decodeJson(snapshot.documentJson),this.config.maxDocumentBytes)
   const page=request.pageId===undefined?document.pages[0]:document.pages.find(page=>page.id===request.pageId)
   if(!page)throw new ResumeError('invalid-input','Selected export page does not exist')
   const rendered=request.format==='json'?undefined:await this.queue.request({resumeId:request.id,revision:snapshot.revision,documentJson:snapshot.documentJson,format:request.format,pixelRatio:this.config.renderPixelRatio,...(request.pageId===undefined?{}:{pageId:request.pageId})},signal)
   const bytes=rendered?.bytes??Buffer.from(serializeResumeBackup(document))
   signal.throwIfAborted()
   const id=randomUUID();const filename=`resume-${request.id}-r${snapshot.revision}.${request.format}`
   const artifactPath=join(this.config.storageDir,'exports',`${id}.${request.format}`)
   await writeFileAtomic(artifactPath,bytes,{mode:0o600,dirMode:0o700})
   if(signal.aborted){await import('node:fs/promises').then(fs=>fs.rm(artifactPath,{force:true}));throw new ResumeError('render-cancelled','Export was cancelled')}
   const dimensions={...document.pageConfig,...page.config}
   return{id,resumeId:request.id,revision:snapshot.revision,format:request.format,filename,byteSize:bytes.byteLength,pageCount:rendered?.pageCount??document.pages.length,width:rendered?.width??dimensions.width,height:rendered?.height??dimensions.height,dimensionUnit:rendered?.dimensionUnit??'mm',dataBase64:Buffer.from(bytes).toString('base64'),artifactPath}
 })}
}
export default FastResumeService

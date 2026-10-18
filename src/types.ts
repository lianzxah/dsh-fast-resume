/** Fast Resume persistence and authenticated wire DTOs. */
import type { Branded, BrandedNumber } from '@deepseek-ai/dsh-brand'
import type { ResumeDocument, ResumeElement, ResumePage, PageConfig, ResumeData } from '../upstream/shared/src/index.ts'
import type {} from '@deepseek-ai/dsh-typert-protocol'
import type {ResumeFailureCode} from './host/errors.ts'
declare module '@deepseek-ai/dsh-typert-protocol' {interface RemoteErrorDetailsMap {FAST_RESUME_ERROR:{code:ResumeFailureCode;currentRevision?:number}}}
export type { ResumeDocument, ResumeElement, ResumePage, PageConfig, ResumeData }
/** Profile-local document identity. */
export type ResumeId = Branded<'FastResumeId'>
/** Monotonically increasing committed document revision. */
export type ResumeRevision = BrandedNumber<'FastResumeRevision'>
/** Version identity independent of its source revision. */
export type ResumeVersionId = Branded<'FastResumeVersionId'>
/** Durable proposed operation set identity. */
export type ResumeProposalId = Branded<'FastResumeProposalId'>
/** Deployment choices; durations and limits are positive safe integers, and renderPixelRatio allows fractional scales. */
export interface Config {
  storageDir?: string
  autosaveDelayMs?: number
  maxDocumentBytes?: number
  maxImportBytes?: number
  maxVersions?: number
  renderTimeoutMs?: number
  lockWaitMs?: number
  maxRenderRequests?: number
  rendererLeaseMs?: number
  maxProposalOperations?: number
  renderPixelRatio?: number
  maxRenderPixels?: number
  frameConnectTimeoutMs?: number
  bridgeTimeoutMs?: number
  rendererPollIntervalMs?: number
  refreshIntervalMs?: number
}
/** Resolved deployment values. */
export interface ResolvedConfig extends Required<Omit<Config, 'storageDir'>> { storageDir: string }
/** Summary safe for model listing. */
export interface ResumeSummary { id: ResumeId; title: string; revision: ResumeRevision; pageCount: number; updatedAt: string }
/** Wire document JSON preserves all upstream fields without flattening recursive groups. */
export interface ResumeSnapshot extends ResumeSummary { documentJson: string; sessionId?: string }
/** Initial document selection. */
export interface CreateRequest { title: string; templateId?: string; documentJson?: string; sessionId?: string }
/** Optimistic document replacement; versionName commits a named snapshot atomically. */
export interface SaveRequest { id: ResumeId; expectedRevision: ResumeRevision; documentJson: string; versionName?: string; sessionId?: string }
/** Typed operation list represented as JSON on the Remote carrier. */
export interface ProposeRequest { id: ResumeId; expectedRevision: ResumeRevision; requestId: string; operationsJson: string; summary: string }
/** Explicit application of one durable proposal. */
export interface ApplyRequest { id: ResumeId; proposalId: ResumeProposalId; requestId: string }
/** Undo one applied proposal while retaining unrelated later edits. */
export interface RevertRequest { id: ResumeId; expectedRevision: ResumeRevision; proposalId: ResumeProposalId; requestId: string }
/** Named revision restoration creates a new committed revision. */
export interface RestoreRequest { id: ResumeId; expectedRevision: ResumeRevision; versionId: ResumeVersionId; requestId: string }
/** Version summary; historical documents are loaded separately. */
export interface VersionSummary { id: ResumeVersionId; revision: ResumeRevision; name: string; createdAt: string }
/** Durable proposal preview. */
export interface ProposalView { id: ResumeProposalId; baseRevision: ResumeRevision; summary: string; operationsJson: string; beforeAfterJson: string; status: 'proposed' | 'applied' }
/** Idempotent mutation receipt. */
export interface ChangeReceipt { requestId: string; proposalId?: ResumeProposalId; versionId?: ResumeVersionId; revertedProposalId?: ResumeProposalId; revision: ResumeRevision; changedElementIds: string[]; createdAt: string }
/** Document history including pending proposals. */
export interface HistoryView { versions: VersionSummary[]; proposals: ProposalView[]; changes: ChangeReceipt[] }
/** Parser input; textual formats use UTF-8 base64 like binary formats. */
export interface ImportRequest { filename: string; format: 'json' | 'markdown' | 'docx' | 'pdf'; dataBase64: string; title?: string }
/** Export an exact committed revision; PNG selects one page id. */
export interface ExportRequest { id: ResumeId; expectedRevision: ResumeRevision; format: 'json' | 'pdf' | 'png'; pageId?: string }
/** Receipt emitted only after bytes are durably stored. */
export interface ExportReceipt { id: string; resumeId: ResumeId; revision: ResumeRevision; format: 'json' | 'pdf' | 'png'; filename: string; byteSize: number; pageCount: number; width: number; height: number; dimensionUnit: 'mm' | 'px'; dataBase64: string; artifactPath: string }
/** Renderer lease token identifies one connected Client instance. */
export interface RendererLease { rendererId: string; leaseMs: number }
/** Render job delivered exclusively to its leased renderer. */
export interface RenderJob { id: string; resumeId: ResumeId; revision: ResumeRevision; documentJson: string; format: 'pdf' | 'png'; pixelRatio: number; pageId?: string; deadline: number }
/** Renderer response is validated before any export receipt can exist. */
export interface RenderCompletion { rendererId: string; jobId: string; dataBase64?: string; error?: string }
/** Bounded supported editing operations; every resulting document is revalidated. */
export type ResumeOperation =
  | { type: 'text.replace'; elementId: string; content: string }
  | { type: 'element.update'; elementId: string; patch: Partial<ResumeElement> }
  | { type: 'element.insert'; pageId: string; parentId?: string; element: ResumeElement }
  | { type: 'element.delete'; elementId: string }
  | { type: 'element.reorder'; elementId: string; index: number }
  | { type: 'page.insert'; page: ResumePage; index?: number }
  | { type: 'page.delete'; pageId: string }
  | { type: 'page.update'; pageId: string; config: Partial<PageConfig> }
  | { type: 'template.apply'; templateId: string }
  | { type: 'semantic.replace'; resumeData: ResumeData; relayout: boolean }
/** Private complete version; historical revision stays immutable. */
export interface StoredVersion extends VersionSummary { document: ResumeDocument }
/** Private proposal includes the exact validated target for atomic apply. */
export interface StoredProposal extends ProposalView { requestId: string; fingerprint: string; document: ResumeDocument; changedElementIds: string[] }
/** One atomic profile-local persistence unit. */
export interface ResumeEnvelope { schemaVersion: 1; revision: ResumeRevision; document: ResumeDocument; versions: StoredVersion[]; proposals: StoredProposal[]; changes: ChangeReceipt[]; sessionId?: string; deleted?: boolean }

/** Packaged srcdoc and resolved adapter limits. */
export interface EditorAssets { html: string; autosaveDelayMs: number; maxImportBytes: number; maxDocumentBytes: number; frameConnectTimeoutMs: number; bridgeTimeoutMs: number; rendererPollIntervalMs: number; refreshIntervalMs: number }

export {resumeIdSchema,resumeRevisionSchema,versionIdSchema,proposalIdSchema} from './identity.ts'

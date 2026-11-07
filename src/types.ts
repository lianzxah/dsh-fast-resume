/** Fast Resume persistence and authenticated wire DTOs. */
import type { SessionId } from '@deepseek-ai/dsh-session/types'
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
/** Plugin-owned target selection, stored independently of document envelopes. */
export interface ResumeSessionContextV1 { schemaVersion: 1; sessionId: SessionId; resumeId: ResumeId; updatedAt: string; source: 'editor-entry' | 'explicit-tool' | 'committed-edit' }
/** Current target and document revision, or a request for explicit selection. */
export type ResumeContextResult = { state: 'bound'; context: ResumeSessionContextV1; revision: ResumeRevision } | { state: 'choose'; reason: 'missing' | 'deleted' | 'ambiguous' }
/** Nonbinding authenticated Session context lookup. */
export interface ResumeContextReadRequest {sessionId:SessionId;explicitResumeId?:ResumeId}
/** Explicit selection against an acknowledged document revision; retries retain their original result. */
export interface ResumeContextBindRequest { sessionId: SessionId; resumeId: ResumeId; expectedRevision: ResumeRevision; requestId: string; source?: ResumeSessionContextV1['source'] }

/** Deployment choices; durations and limits are positive safe integers, and renderPixelRatio allows fractional scales. */
export interface Config {
  storageDir?: string
  autosaveDelayMs?: number
  maxAssistantCheckpointBytes?: number
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
  /** Auto honors the device inversion flag; explicit modes follow raw or reversed wheel deltas. */
  wheelZoomDirection?: 'auto' | 'standard' | 'reversed'
  editorPrepareTimeoutMs?: number
  editorLeaseMs?: number
  editorPollIntervalMs?: number
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
/** Correlation for an explicit UI mutation; never a logged tool call identity. */
export type ResumeUiActionId = Branded<'FastResumeUiActionId'>
/** Explicit authenticated proposal approval or selective undo, with stable retry inputs. */
export type ResumeUiMutationRequest = {sessionId:SessionId;actionId:ResumeUiActionId;kind:'apply';request:ApplyRequest} | {sessionId:SessionId;actionId:ResumeUiActionId;kind:'revert';request:RevertRequest}
/** Durable mutation success independent of target association and editor release acknowledgement. */
export interface ResumeUiMutationResult {resumeId:ResumeId;sessionId:SessionId;receipt:ChangeReceipt;association:'bound'|'superseded'|'ambiguous'|'failed';editor:'released'|'uncertain'|'not-required'}
/** Conversation editing Session is separate from the legacy document association in save.sessionId. */
export interface ResumeSessionSaveRequest {contextSessionId:SessionId;save:SaveRequest;token:EditorToken}
/** A failed target association never invalidates an acknowledged document save. */
export interface ResumeSessionSaveResult {snapshot:ResumeSnapshot;association:'bound'|'superseded'|'failed'}
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
export interface EditorAssets { maxAssistantCheckpointBytes:number; wheelZoomDirection: 'auto' | 'standard' | 'reversed'; html: string; autosaveDelayMs: number; maxImportBytes: number; maxDocumentBytes: number; frameConnectTimeoutMs: number; bridgeTimeoutMs: number; rendererPollIntervalMs: number; refreshIntervalMs: number; editorPollIntervalMs:number }

export {resumeIdSchema,resumeRevisionSchema,versionIdSchema,proposalIdSchema} from './identity.ts'

/** Stable browser recovery owner, independent of a frame lifetime. */
export type EditorOwnerId = Branded<'FastResumeEditorOwnerId'>
/** One frame lifetime, permanently fenced after retirement. */
export type EditorIncarnationId = Branded<'FastResumeEditorIncarnationId'>
/** Private document-scoped writable editor capability. */
export type EditorToken = Branded<'FastResumeEditorToken'>
/** One host preparation request. */
export type EditorPreparationId = Branded<'FastResumeEditorPreparationId'>
/** Register the actual document only after inspecting local recovery. */
export interface EditorRegistration { resumeId:ResumeId; ownerId:EditorOwnerId; incarnationId:EditorIncarnationId; /** Local recovery remains pending. */ recoveryPending:boolean; /** Available never replaces; recover explicitly revokes disposed or unknown ownership and stays uncertain. */ acquisition?:'available'|'recover' }
/** Registration retains uncertainty until explicit committed-revision acknowledgement. */
export interface EditorOwnership { token:EditorToken; uncertain:boolean }
/** Preparation is visible until host release; gestures remain fenced while it exists. */
export interface EditorPreparation { id:EditorPreparationId; expectedRevision:ResumeRevision; deadline:number }
/** Browser acknowledgement after saves and local backup writes have drained. */
export interface EditorAcknowledgement { resumeId:ResumeId; token:EditorToken; preparationId:EditorPreparationId; revision:ResumeRevision; clean:boolean }
/** Explicit ownership reconciliation preserves all local recovery copies. */
export interface EditorReconciliation { resumeId:ResumeId; token:EditorToken; expectedRevision:ResumeRevision }
/** Atomic edit output for the additive tool; legacy receipts stay unchanged. */
export interface ResumeEditResult { schemaVersion:1; resumeId:ResumeId; sessionId:SessionId; baseRevision:ResumeRevision; receipt:ChangeReceipt; summary:string }

/** Private one-use transfer and retained history identities. */
export type EditorTransferId=Branded<'FastResumeEditorTransferId'>
export type EditorCheckpointId=Branded<'FastResumeEditorCheckpointId'>
/** Presentation context is independent of the document's stored Session association. */
export interface EditorLaunch {resumeId:ResumeId;sessionId?:SessionId;source:'space'|'conversation';checkpointId?:EditorCheckpointId}
/** Source has fenced gestures and drained the acknowledged revision before submission. */
export interface EditorTransfer {resumeId:ResumeId;sourceToken:EditorToken;sourceIncarnationId:EditorIncarnationId;targetOwnerId:EditorOwnerId;targetIncarnationId:EditorIncarnationId;transferId:EditorTransferId;checkpointId:EditorCheckpointId;revision:ResumeRevision;checkpointJson:string}
/** Only the designated target may consume a retained checkpoint. */
export interface EditorClaim {resumeId:ResumeId;transferId:EditorTransferId;checkpointId:EditorCheckpointId;incarnationId:EditorIncarnationId}
/** Sent after actual editor commit and viewport layout. */
export interface EditorActivation extends EditorClaim {token:EditorToken;revision:ResumeRevision}
/** Source credentials permit revocation; they never grant target writes. */
export interface EditorRollback {resumeId:ResumeId;transferId:EditorTransferId;sourceToken:EditorToken;sourceIncarnationId:EditorIncarnationId}
/** Claim token remains fenced until activation. */
export interface EditorClaimed extends EditorOwnership {checkpointJson:string;revision:ResumeRevision}
/** Replace a lost source/target view with a fresh generation from retained history. */
export interface EditorRecovery {resumeId:ResumeId;transferId:EditorTransferId;checkpointId:EditorCheckpointId;fromIncarnationId:EditorIncarnationId;targetOwnerId:EditorOwnerId;targetIncarnationId:EditorIncarnationId}
/** Exact retained transfer identity for a nonmutating disposition lookup. */
export interface EditorTransferRead {resumeId:ResumeId;transferId:EditorTransferId;checkpointId:EditorCheckpointId}
/** Validated transfer state and revisions; no capability or checkpoint content is exposed. */
export type EditorTransferDisposition={state:'active'|'pending';revision:ResumeRevision;currentRevision:ResumeRevision}|{state:'unknown'}
/** Exact retained revision available to the newly designated recovery frame. */
export interface EditorRecovered {revision:ResumeRevision}

/** Durable identity of one explicit global assistant entry. */
export type AssistantHandoffId = Branded<'FastResumeAssistantHandoffId'>
/** Workspace identity retained with an explicit assistant admission. */
export type AssistantWorkspaceId = Branded<'WorkspaceId'>
/** Workspace selection is fixed before a new Session admission. */
export interface AssistantHandoffBegin {resumeId:ResumeId;expectedRevision:ResumeRevision;requestId:AssistantHandoffId;workspaceId:AssistantWorkspaceId}
/** Lookup a previously admitted entry; absent records never imply creation failed. */
export interface AssistantHandoffRead {requestId:AssistantHandoffId}
/** Canonical response from the ordinary Session creation API. */
export interface AssistantSessionRecord extends AssistantHandoffRead {sessionId:SessionId}
/** Independent handoffs-v1 persistence; never modifies ResumeEnvelope. */
export interface AssistantHandoffRecord extends Omit<AssistantHandoffBegin,'workspaceId'> {schemaVersion:1;requestedSessionId:SessionId;sessionId?:SessionId;workspaceId?:AssistantWorkspaceId}
/** Only the first durable admission permits dispatching create. */
export interface AssistantHandoffAdmission {handoff:AssistantHandoffRecord;admitted:boolean}
/** In-place progress for an explicit assistant entry. */
export type AssistantEntryState = 'saving'|'creating'|'binding'|'mounting'|'ready'|'failed'|'outcome-unknown'

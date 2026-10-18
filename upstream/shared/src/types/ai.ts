import type { ResumeElement, ResumeSemanticRef, TextElement, TextSegment } from './elements';
import type { ResumeDocument } from './document';
import type { LeftPanelTab } from './editor';

export interface AiTextIndexItem {
  elementId: string;
  pageIndex: number;
  name: string;
  content: string;
  semanticRef?: ResumeSemanticRef;
  box: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
}

export type AiContextScope = 'selection' | 'activePage' | 'document';

export interface AiElementSnapshot {
  elementId: string;
  content?: string;
  updatedHash: string;
}

export interface AiEditorContext {
  resumeId: string;
  document: ResumeDocument;
  /** 当前上下文对应的文档指纹；用于 AI 响应回来前后的冲突检测 */
  documentHash?: string;
  /** 编辑器本地递增修订号；没有持久化版本时用于前端会话内冲突检测 */
  documentRevision?: number;
  activePageIndex: number;
  selectedIds: string[];
  viewport: {
    zoom: number;
  };
  visibleTextIndex: AiTextIndexItem[];
  currentTemplateId?: string;
  /** 本次发送给模型的上下文范围，用于隐私与成本控制 */
  contextScope?: AiContextScope;
}

export type ViewCommand =
  | { type: 'view.setActivePage'; pageIndex: number }
  | { type: 'view.selectElements'; elementIds: string[] }
  | { type: 'view.openLeftPanel'; tab: LeftPanelTab }
  | { type: 'view.openRightPanel' }
  | { type: 'view.openAssistant' }
  | { type: 'view.zoomToFit' }
  | { type: 'view.scrollToElement'; elementId: string };

export interface JsonPatchOperation {
  op: 'add' | 'remove' | 'replace';
  path: string;
  value?: unknown;
}

export type TextStylePatch = Partial<
  Pick<
    TextElement,
    | 'fontSize'
    | 'fontFamily'
    | 'fontWeight'
    | 'fontStyle'
    | 'textAlign'
    | 'lineHeight'
    | 'letterSpacing'
    | 'color'
  >
>;

export type ElementLayoutPatch = Partial<
  Pick<ResumeElement, 'left' | 'top' | 'width' | 'height' | 'visible' | 'locked' | 'opacity'>
>;

export type ResumeEditCommand =
  | {
      type: 'text.replace';
      elementId: string;
      nextContent: string;
      nextSegments?: TextSegment[];
    }
  | {
      type: 'element.patch';
      elementId: string;
      patch: ElementLayoutPatch;
    }
  | {
      type: 'element.styleText';
      elementId: string;
      patch: TextStylePatch;
    }
  | {
      type: 'element.delete';
      elementId: string;
    }
  | {
      type: 'resumeData.patch';
      patch: JsonPatchOperation[];
      relayout: 'none' | 'section' | 'document';
    };

/**
 * 客户端使用画布字体度量后产生的派生高度。
 * 服务端只允许它作用于同一提案中 text.replace 的普通文本元素。
 */
export interface AiTextHeightAdjustment {
  elementId: string;
  height: number;
}

export interface AiEditProposal {
  id: string;
  title: string;
  rationale: string;
  risk: 'low' | 'medium' | 'high';
  /** 提案基于哪个文档生成；应用前必须与当前文档比对 */
  baseDocumentHash?: string;
  baseRevision?: number;
  /** 目标元素快照；比整份文档 hash 更细，用于允许非目标区域的小改动 */
  targetSnapshots?: AiElementSnapshot[];
  /** 用户指令中明确提供、可被模型新增的事实 token */
  allowedFacts?: string[];
  /** 校验策略：自动应用始终强制 strict；人工审阅后可使用 reviewed-enhancement。 */
  validationProfile?: 'strict' | 'reviewed-enhancement';
  commands: ResumeEditCommand[];
  preview: {
    changedElementIds: string[];
    summary: string[];
    beforeAfter?: Array<{
      elementId: string;
      before: string;
      after: string;
    }>;
  };
  requiresConfirmation: boolean;
  autoApply?: boolean;
  riskReasons?: string[];
}

export type AiProposalStatus = 'proposed' | 'applied' | 'declined' | 'failed';

export type AiEvent =
  | { type: 'thinking.started'; label: string }
  | { type: 'thinking.delta'; text: string }
  | { type: 'thinking.done' }
  | { type: 'message.delta'; text: string }
  | { type: 'message.done'; messageId: string }
  | { type: 'view.command'; command: ViewCommand }
  | { type: 'edit.proposal'; proposal: AiEditProposal }
  | { type: 'edit.applied'; proposalId: string; changedElementIds: string[] }
  | { type: 'question'; question: string; options?: string[] }
  | { type: 'error'; message: string; recoverable: boolean };

export interface AiTurnRequest {
  resumeId: string;
  message: string;
  context: AiEditorContext;
  modelProfileId?: string;
}

export interface AiTurnResponse {
  sessionId: string;
  status: 'completed' | 'failed';
  events: AiEvent[];
  errorCode?: string;
  model?: AiModelRuntimeSnapshot;
}

export type AiStreamFrame =
  | { type: 'event'; event: AiEvent }
  | {
      type: 'done';
      response: Omit<AiTurnResponse, 'events'>;
    };

export interface AiModelProfile {
  id: string;
  name: string;
  provider: 'openai-compatible';
  scope?: 'environment' | 'system' | 'user';
  presetId?: string;
  providerLabel?: string;
  baseUrl: string;
  model: string;
  temperature: number;
  maxTokens?: number;
  supportsJsonMode: boolean;
  enabled: boolean;
  isDefault: boolean;
  /** 只允许后端返回掩码，不回传真实 key */
  apiKeyConfigured: boolean;
  apiKeyPreview?: string;
  readonly?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface AiModelProfileInput {
  id?: string;
  name?: string;
  provider?: 'openai-compatible';
  presetId?: string;
  baseUrl?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  supportsJsonMode?: boolean;
  enabled?: boolean;
  apiKey?: string;
}

export type AiModelPresetProviderId = 'deepseek';

export interface AiModelPreset {
  id: string;
  providerId: AiModelPresetProviderId;
  providerLabel: string;
  label: string;
  baseUrl: string;
  model: string;
  temperature: number;
  maxTokens?: number;
  supportsJsonMode: boolean;
  notes?: string;
}

export interface AiModelProviderPreset {
  id: AiModelPresetProviderId;
  label: string;
  baseUrl: string;
  apiKeyLabel: string;
  models: AiModelPreset[];
}

export interface AiModelConfigResponse {
  profiles: AiModelProfile[];
  defaultProfileId?: string;
  limits: {
    maxMessageChars: number;
    maxTextIndexItems: number;
    maxRequestBytes: number;
  };
}

export interface AiModelRuntimeSnapshot {
  profileId: string;
  provider: 'openai-compatible';
  baseUrl: string;
  model: string;
  temperature: number;
  maxTokens?: number;
  supportsJsonMode: boolean;
}

export interface AiAppliedChange {
  id?: string;
  /** 创建本次应用记录的幂等尝试 token；补偿操作只能撤销自己的尝试。 */
  attemptId?: string;
  proposalId: string;
  resumeId: string;
  title?: string;
  commandTypes: string[];
  changedElementIds: string[];
  beforeHash?: string;
  afterHash?: string;
  /** AI 专属回退 checkpoint；服务端审计与跨会话恢复使用。 */
  beforeDocument?: ResumeDocument;
  afterDocument?: ResumeDocument;
  model?: AiModelRuntimeSnapshot;
  appliedAt: string;
  status?: 'applied' | 'reverted';
  revertedAt?: string;
  revertAttemptId?: string;
}

/** AI 提案应用请求；显式携带可由服务端校验并重放的派生文本布局。 */
export interface AiApplyProposalRequest {
  attemptId: string;
  resumeId: string;
  title?: string;
  commandTypes: string[];
  changedElementIds: string[];
  beforeHash: string;
  afterHash: string;
  beforeDocument: ResumeDocument;
  afterDocument: ResumeDocument;
  textHeightAdjustments: AiTextHeightAdjustment[];
  model?: AiModelRuntimeSnapshot;
}

export interface AiApplyResponse {
  proposalStatus: AiProposalStatus;
  change: AiAppliedChange;
}

export interface AiRevertPreview {
  ok: boolean;
  message?: string;
  changedElementIds: string[];
}

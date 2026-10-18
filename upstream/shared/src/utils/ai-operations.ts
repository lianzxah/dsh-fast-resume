import type {
  AiAppliedChange,
  AiElementSnapshot,
  AiEditProposal,
  AiRevertPreview,
  AiTextHeightAdjustment,
  AiTextIndexItem,
  ElementLayoutPatch,
  JsonPatchOperation,
  ResumeDocument,
  ResumeEditCommand,
  ResumeElement,
  ResumePage,
} from '../types';
import { resumeDataToPages } from './resume-data-to-elements';

export interface AiValidationIssue {
  code: string;
  message: string;
  severity?: 'warning' | 'error';
  commandIndex?: number;
  elementId?: string;
}

export interface AiValidationResult {
  ok: boolean;
  issues: AiValidationIssue[];
}

export interface AiApplyResult {
  document: ResumeDocument;
  changedElementIds: string[];
}

const MAX_TEXT_LENGTH_RATIO = 3;
const MAX_TEXT_LENGTH_ABSOLUTE = 5000;
const MAX_LOW_RISK_DELETES = 3;
const MAX_RESUME_DATA_PATCH_OPS = 25;
const MAX_AI_TEXT_HEIGHT_PX = 100_000;
const SAFE_RESUME_DATA_ROOTS = new Set([
  'personalInfo',
  'experience',
  'education',
  'skills',
  'projects',
  'certifications',
  'customSections',
  'sectionOrder',
]);

const DOTTED_TECHNOLOGY_TERMS = [
  'Node.js',
  'Vue.js',
  'React.js',
  'Next.js',
  'Nuxt.js',
  'Deno.js',
  'Express.js',
  'Angular.js',
  'Three.js',
  'Socket.io',
  'ASP.NET',
  'package.json',
];
const ENGLISH_MONTHS =
  'January|February|March|April|May|June|July|August|September|October|November|December';
const DOTTED_TECHNOLOGY_PATTERN = new RegExp(
  `\\b(?:${DOTTED_TECHNOLOGY_TERMS.map((term) => term.replace('.', '\\.')).join('|')})\\b`,
  'g'
);
const BARE_CONTACT_DOMAIN_PATTERN = new RegExp(
  '\\b(?:www\\.)?(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,62})\\.)+[A-Za-z]{2,63}(?:/[^\\s,，]*)?',
  'gi'
);
const CONTEXTUAL_ENGLISH_DATE_PATTERN = new RegExp(
  `\\b(?:${ENGLISH_MONTHS})(?:\\s+\\d{1,2}(?:st|nd|rd|th)?(?:,?\\s+\\d{4})?|,?\\s+\\d{4}|\\s*(?:-|–|—|to)\\s*(?:${ENGLISH_MONTHS})(?:\\s+\\d{4})?)\\b`,
  'g'
);

type AiFactKind = 'contact' | 'date' | 'number' | 'terminology';

interface AiValidationPolicy {
  expansionSeverity: 'warning' | 'error';
  terminologySeverity: 'warning' | 'error';
}

const AI_VALIDATION_POLICIES: Record<
  NonNullable<AiEditProposal['validationProfile']>,
  AiValidationPolicy
> = {
  strict: {
    expansionSeverity: 'error',
    terminologySeverity: 'error',
  },
  'reviewed-enhancement': {
    expansionSeverity: 'warning',
    terminologySeverity: 'warning',
  },
};

function resolveValidationProfile(
  proposal: AiEditProposal
): NonNullable<AiEditProposal['validationProfile']> {
  if (proposal.validationProfile) return proposal.validationProfile;
  // 兼容存量 proposal：模型文本优化允许人工审阅后应用；其他命令继续严格校验。
  return proposal.commands.every((command) => command.type === 'text.replace')
    ? 'reviewed-enhancement'
    : 'strict';
}

function cloneDocument(doc: ResumeDocument): ResumeDocument {
  return JSON.parse(JSON.stringify(doc)) as ResumeDocument;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
}

function hashString(value: string): string {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function createDocumentFingerprint(doc: ResumeDocument): string {
  return `doc_${hashString(stableStringify(doc))}`;
}

function elementContent(element: ResumeElement): string | undefined {
  if (element.type === 'text') return element.content;
  if (element.type === 'shape') return element.text ?? '';
  return undefined;
}

export function createAiElementSnapshot(element: ResumeElement): AiElementSnapshot {
  return {
    elementId: element.id,
    content: elementContent(element),
    updatedHash: `el_${hashString(stableStringify(element))}`,
  };
}

function snapshotMatches(snapshot: AiElementSnapshot, element: ResumeElement): boolean {
  const current = createAiElementSnapshot(element);
  return snapshot.updatedHash === current.updatedHash && snapshot.content === current.content;
}

function protectedFactTokens(text: string): Map<string, AiFactKind> {
  const tokens = new Map<string, AiFactKind>();
  const patterns: Array<{ pattern: RegExp; kind: AiFactKind }> = [
    {
      pattern: DOTTED_TECHNOLOGY_PATTERN,
      kind: 'terminology',
    },
    { pattern: /[\w.-]+@[\w.-]+\.\w+/g, kind: 'contact' },
    { pattern: /https?:\/\/[^\s,，]+/g, kind: 'contact' },
    {
      pattern: BARE_CONTACT_DOMAIN_PATTERN,
      kind: 'contact',
    },
    { pattern: /(?<![\w.-])@[A-Za-z0-9_][A-Za-z0-9_.-]{1,}/g, kind: 'contact' },
    { pattern: /(?:\+?\d[\d\s().-]{6,}\d)/g, kind: 'contact' },
    { pattern: /\b\d{4}(?:[./-]\d{1,2})?(?:[./-]\d{1,2})?\b/g, kind: 'date' },
    {
      pattern: CONTEXTUAL_ENGLISH_DATE_PATTERN,
      kind: 'date',
    },
    {
      pattern:
        /(?:[〇零一二三四五六七八九]{2,4}年|[一二三四五六七八九十]{1,3}月(?:[一二三四五六七八九十]{1,3}日)?)/g,
      kind: 'date',
    },
    { pattern: /\b\d+(?:[.,]\d+)?%?\b/g, kind: 'number' },
    {
      pattern:
        /\b(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|billion)(?:[-\s](?:one|two|three|four|five|six|seven|eight|nine|ten|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|billion))*\s+(?:percent|per\s+cent)\b/gi,
      kind: 'number',
    },
    { pattern: /百分之[零一二三四五六七八九十百千万亿两\d.]+/g, kind: 'number' },
    {
      pattern: /\b[A-Z][A-Za-z0-9+.#/-]{1,}(?:\s+[A-Z][A-Za-z0-9+.#/-]{1,}){0,3}\b/g,
      kind: 'terminology',
    },
  ];
  for (const { pattern, kind } of patterns) {
    for (const match of text.matchAll(pattern)) {
      const token = match[0].trim();
      if (token.length > 1 && !tokens.has(token)) tokens.set(token, kind);
    }
  }
  return tokens;
}

export function extractAiFactTokens(...texts: string[]): string[] {
  const tokens = new Set<string>();
  for (const text of texts) {
    for (const token of protectedFactTokens(text).keys()) tokens.add(token);
  }
  return [...tokens];
}

function pageWidthPx(page: ResumePage, doc: ResumeDocument): number {
  const config = { ...doc.pageConfig, ...page.config };
  return (config.width * config.dpi) / 25.4;
}

function pageHeightPx(page: ResumePage, doc: ResumeDocument): number {
  const config = { ...doc.pageConfig, ...page.config };
  return (config.height * config.dpi) / 25.4;
}

function maxAiTextHeightPx(
  element: Extract<ResumeElement, { type: 'text' }>,
  page: ResumePage,
  doc: ResumeDocument
): number {
  const lineHeightPx = element.fontSize * (element.lineHeight || 1.2);
  if (!Number.isFinite(lineHeightPx) || lineHeightPx <= 0) return 0;

  const displayText =
    element.segments && element.segments.length > 0
      ? element.segments.map((segment) => segment.text).join('')
      : element.content;
  // 当前布局器每个源字符至多产生一个新排版行；额外一行覆盖空文本和末尾换行。
  const contentBound = Math.max(1, Array.from(displayText).length + 1) * lineHeightPx;
  const pageSafetyBound = pageHeightPx(page, doc) * 2;
  return Math.min(MAX_AI_TEXT_HEIGHT_PX, Math.max(pageSafetyBound, contentBound));
}

export function findElementLocation(
  doc: ResumeDocument,
  elementId: string
): { pageIndex: number; elementIndex: number; element: ResumeElement } | null {
  for (let pageIndex = 0; pageIndex < doc.pages.length; pageIndex++) {
    const elementIndex = doc.pages[pageIndex].elements.findIndex(
      (element) => element.id === elementId
    );
    if (elementIndex !== -1) {
      return { pageIndex, elementIndex, element: doc.pages[pageIndex].elements[elementIndex] };
    }
  }
  return null;
}

export function buildAiTextIndex(doc: ResumeDocument): AiTextIndexItem[] {
  const index: AiTextIndexItem[] = [];

  doc.pages.forEach((page, pageIndex) => {
    page.elements.forEach((element) => {
      let content = '';
      if (element.type === 'text') content = element.content;
      if (element.type === 'shape') content = element.text ?? '';
      if (!content.trim()) return;

      index.push({
        elementId: element.id,
        pageIndex,
        name: element.name,
        content,
        semanticRef: element.semanticRef,
        box: {
          left: element.left,
          top: element.top,
          width: element.width,
          height: element.height,
        },
      });
    });
  });

  return index;
}

function decodePointerSegment(segment: string): string {
  return segment.replace(/~1/g, '/').replace(/~0/g, '~');
}

function decodeJsonPointer(path: string): string[] | null {
  if (!path.startsWith('/')) return null;
  const parts = path.slice(1).split('/').map(decodePointerSegment);
  if (parts.some((part) => part === '__proto__' || part === 'prototype' || part === 'constructor'))
    return null;
  return parts;
}

function validateResumeDataPatchOperation(
  op: JsonPatchOperation,
  index: number
): AiValidationIssue[] {
  const issues: AiValidationIssue[] = [];
  const parts = decodeJsonPointer(op.path);
  if (!parts || parts.length === 0 || !SAFE_RESUME_DATA_ROOTS.has(parts[0])) {
    issues.push({
      code: 'unsafe_resume_data_path',
      message: `ResumeData 补丁路径不在允许范围内: ${op.path}`,
      commandIndex: index,
    });
  }
  if ((op.op === 'add' || op.op === 'replace') && op.value === undefined) {
    issues.push({
      code: 'resume_data_patch_value_missing',
      message: `ResumeData ${op.op} 操作缺少 value: ${op.path}`,
      commandIndex: index,
    });
  }
  return issues;
}

function getPatchContainer(root: unknown, parts: string[]): { target: any; key: string } | null {
  let target: any = root;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (Array.isArray(target)) {
      const index = Number(part);
      if (!Number.isInteger(index) || index < 0 || index >= target.length) return null;
      target = target[index];
    } else if (target && typeof target === 'object' && part in target) {
      target = target[part];
    } else {
      return null;
    }
  }
  return { target, key: parts[parts.length - 1] };
}

function applyJsonPatch(root: unknown, patch: JsonPatchOperation[]): unknown {
  const next = JSON.parse(JSON.stringify(root));
  for (const op of patch) {
    const parts = decodeJsonPointer(op.path);
    if (!parts) throw new Error(`非法 JSON Pointer: ${op.path}`);
    const container = getPatchContainer(next, parts);
    if (!container) throw new Error(`ResumeData 路径不存在: ${op.path}`);
    const { target, key } = container;
    if (Array.isArray(target)) {
      const index = key === '-' ? target.length : Number(key);
      if (!Number.isInteger(index) || index < 0 || index > target.length) {
        throw new Error(`ResumeData 数组索引非法: ${op.path}`);
      }
      if (op.op === 'add') target.splice(index, 0, op.value);
      else if (op.op === 'remove') {
        if (index >= target.length) throw new Error(`ResumeData 删除索引不存在: ${op.path}`);
        target.splice(index, 1);
      } else {
        if (index >= target.length) throw new Error(`ResumeData 替换索引不存在: ${op.path}`);
        target[index] = op.value;
      }
    } else if (target && typeof target === 'object') {
      if (op.op === 'add' || op.op === 'replace') target[key] = op.value;
      else {
        if (!(key in target)) throw new Error(`ResumeData 删除字段不存在: ${op.path}`);
        delete target[key];
      }
    } else {
      throw new Error(`ResumeData 路径不可写: ${op.path}`);
    }
  }
  return next;
}

function validateElementLayoutPatch(
  patch: ElementLayoutPatch,
  element: ResumeElement,
  page: ResumePage,
  doc: ResumeDocument
): string | null {
  const next = { ...element, ...patch };
  if (next.width <= 1 || next.height <= 1) return '元素尺寸过小';
  if (next.opacity < 0 || next.opacity > 1) return '元素透明度必须在 0 到 1 之间';

  const maxWidth = pageWidthPx(page, doc);
  const maxHeight = pageHeightPx(page, doc);
  if (next.left < -maxWidth || next.left > maxWidth * 2) return '元素 X 坐标超出安全范围';
  if (next.top < -maxHeight || next.top > maxHeight * 2) return '元素 Y 坐标超出安全范围';
  if (next.width > maxWidth * 2 || next.height > maxHeight * 2) return '元素尺寸超出安全范围';

  return null;
}

function validateCommand(
  command: ResumeEditCommand,
  doc: ResumeDocument,
  commandIndex: number,
  policy: AiValidationPolicy
): AiValidationIssue[] {
  const issues: AiValidationIssue[] = [];

  if (command.type === 'resumeData.patch') {
    if (!doc.resumeData) {
      issues.push({
        code: 'resume_data_missing',
        message: '当前文档缺少 ResumeData，不能执行语义层补丁',
        commandIndex,
      });
    }
    if (command.patch.length > MAX_RESUME_DATA_PATCH_OPS) {
      issues.push({
        code: 'too_many_resume_data_patch_ops',
        message: 'ResumeData 补丁操作过多，必须拆分或人工确认',
        commandIndex,
      });
    }
    command.patch.forEach((op, opIndex) => {
      issues.push(...validateResumeDataPatchOperation(op, opIndex));
    });
    return issues;
  }

  const location = findElementLocation(doc, command.elementId);
  if (!location) {
    issues.push({
      code: 'element_not_found',
      message: `元素不存在: ${command.elementId}`,
      commandIndex,
      elementId: command.elementId,
    });
    return issues;
  }

  const { element, pageIndex } = location;
  if (element.locked) {
    issues.push({
      code: 'element_locked',
      message: `元素已锁定: ${element.name}`,
      commandIndex,
      elementId: element.id,
    });
  }

  if (command.type === 'text.replace') {
    if (element.type !== 'text' && element.type !== 'shape') {
      issues.push({
        code: 'element_not_textual',
        message: `元素不是可编辑文本元素: ${element.name}`,
        commandIndex,
        elementId: element.id,
      });
      return issues;
    }
    const currentContent = element.type === 'text' ? element.content : (element.text ?? '');
    if (command.nextContent.length > MAX_TEXT_LENGTH_ABSOLUTE) {
      issues.push({
        code: 'text_too_long',
        message: 'AI 返回文本过长',
        commandIndex,
        elementId: element.id,
      });
    }
    if (
      currentContent.trim().length > 0 &&
      command.nextContent.length > currentContent.length * MAX_TEXT_LENGTH_RATIO
    ) {
      issues.push({
        code: 'text_expanded_too_much',
        message:
          policy.expansionSeverity === 'warning'
            ? 'AI 返回文本相对原文扩张较多，已转为人工审阅提示'
            : 'AI 返回文本相对原文扩张过多',
        severity: policy.expansionSeverity,
        commandIndex,
        elementId: element.id,
      });
    }
  }

  if (command.type === 'element.patch') {
    const layoutIssue = validateElementLayoutPatch(
      command.patch,
      element,
      doc.pages[pageIndex],
      doc
    );
    if (layoutIssue) {
      issues.push({
        code: 'unsafe_layout_patch',
        message: layoutIssue,
        commandIndex,
        elementId: element.id,
      });
    }
  }

  if (command.type === 'element.styleText' && element.type !== 'text' && element.type !== 'shape') {
    issues.push({
      code: 'element_not_textual',
      message: `元素不是可设置文字样式的元素: ${element.name}`,
      commandIndex,
      elementId: element.id,
    });
  }

  return issues;
}

export function validateAiEditProposal(
  proposal: AiEditProposal,
  doc: ResumeDocument
): AiValidationResult {
  const policy = AI_VALIDATION_POLICIES[resolveValidationProfile(proposal)];
  const issues = proposal.commands.flatMap((command, index) =>
    validateCommand(command, doc, index, policy)
  );
  const deleteCount = proposal.commands.filter(
    (command) => command.type === 'element.delete'
  ).length;
  const docHash = createDocumentFingerprint(doc);

  // 有精细目标快照时，允许非目标区域发生变化；否则退回整文档冲突检测。
  if (
    proposal.baseDocumentHash &&
    proposal.baseDocumentHash !== docHash &&
    (proposal.targetSnapshots?.length ?? 0) === 0
  ) {
    issues.push({
      code: 'document_changed',
      message: 'AI 提案生成后文档已发生变化，需要重新确认或重新生成',
    });
  }

  for (const snapshot of proposal.targetSnapshots ?? []) {
    const location = findElementLocation(doc, snapshot.elementId);
    if (!location) {
      issues.push({
        code: 'snapshot_element_missing',
        message: `AI 提案目标元素已不存在: ${snapshot.elementId}`,
        elementId: snapshot.elementId,
      });
    } else if (!snapshotMatches(snapshot, location.element)) {
      issues.push({
        code: 'target_element_changed',
        message: `AI 提案目标元素已被修改: ${location.element.name}`,
        elementId: snapshot.elementId,
      });
    }
  }

  const allowedFacts = new Set(proposal.allowedFacts ?? []);
  for (const [index, command] of proposal.commands.entries()) {
    if (command.type !== 'text.replace') continue;
    const location = findElementLocation(doc, command.elementId);
    if (!location) continue;
    const current = elementContent(location.element) ?? '';
    const currentFacts = protectedFactTokens(current);
    for (const [fact, kind] of protectedFactTokens(command.nextContent)) {
      if (!currentFacts.has(fact) && !allowedFacts.has(fact)) {
        const severity = kind === 'terminology' ? policy.terminologySeverity : ('error' as const);
        issues.push({
          code: 'new_unverified_fact',
          message:
            severity === 'warning'
              ? `AI 返回文本新增了技术术语，请人工确认: ${fact}`
              : `AI 返回文本新增了未确认事实: ${fact}`,
          severity,
          commandIndex: index,
          elementId: command.elementId,
        });
      }
    }
  }

  if (proposal.risk === 'low' && deleteCount > MAX_LOW_RISK_DELETES) {
    issues.push({
      code: 'too_many_low_risk_deletes',
      message: '低风险提案删除元素过多，必须升级为高风险确认',
    });
  }

  return { ok: issues.every((issue) => issue.severity === 'warning'), issues };
}

function applyCommand(
  doc: ResumeDocument,
  command: ResumeEditCommand,
  changedElementIds: Set<string>
): void {
  if (command.type === 'resumeData.patch') {
    if (!doc.resumeData) throw new Error('当前文档缺少 ResumeData，不能执行语义层补丁');
    doc.resumeData = applyJsonPatch(doc.resumeData, command.patch) as ResumeDocument['resumeData'];
    if (command.relayout !== 'none' && doc.resumeData) {
      doc.pages = resumeDataToPages(doc.resumeData);
      for (const page of doc.pages) {
        for (const element of page.elements) changedElementIds.add(element.id);
      }
    }
    return;
  }

  const location = findElementLocation(doc, command.elementId);
  if (!location) return;

  if (command.type === 'element.delete') {
    doc.pages[location.pageIndex].elements.splice(location.elementIndex, 1);
    changedElementIds.add(command.elementId);
    return;
  }

  const element = location.element;
  if (command.type === 'text.replace') {
    if (element.type === 'text') {
      element.content = command.nextContent;
      element.segments = command.nextSegments;
    }
    if (element.type === 'shape') {
      element.text = command.nextContent;
      element.segments = command.nextSegments;
    }
    changedElementIds.add(element.id);
    return;
  }

  if (command.type === 'element.patch') {
    Object.assign(element, command.patch);
    changedElementIds.add(element.id);
    return;
  }

  if (command.type === 'element.styleText') {
    Object.assign(element, command.patch);
    changedElementIds.add(element.id);
  }
}

/**
 * 确定性地执行提案。该结果会在客户端和服务端分别计算并比较 fingerprint，
 * 因此时间戳等运行时审计信息必须由调用边界单独记录，不能写入返回文档。
 */
export function applyAiEditProposal(proposal: AiEditProposal, doc: ResumeDocument): AiApplyResult {
  const validation = validateAiEditProposal(proposal, doc);
  if (!validation.ok) {
    throw new Error(validation.issues.map((issue) => issue.message).join('; '));
  }

  const next = cloneDocument(doc);
  const changedElementIds = new Set<string>();

  for (const command of proposal.commands) {
    applyCommand(next, command, changedElementIds);
  }

  return {
    document: next,
    changedElementIds: [...changedElementIds],
  };
}

/**
 * 验证并应用客户端测量出的文本高度。
 *
 * 字体度量属于 canvas-engine；本函数只定义 AI 提案允许派生哪些布局变化，
 * 使浏览器与服务端能使用同一组调整生成完全一致的 checkpoint。
 */
export function applyAiTextHeightAdjustments(
  proposal: AiEditProposal,
  doc: ResumeDocument,
  adjustments: readonly AiTextHeightAdjustment[]
): ResumeDocument {
  if (adjustments.length === 0) return doc;

  const replaceTargets = new Set(
    proposal.commands
      .filter((command) => command.type === 'text.replace')
      .map((command) => command.elementId)
  );
  const seen = new Set<string>();

  for (const adjustment of adjustments) {
    if (seen.has(adjustment.elementId)) {
      throw new Error(`文本高度调整重复: ${adjustment.elementId}`);
    }
    seen.add(adjustment.elementId);

    if (!replaceTargets.has(adjustment.elementId)) {
      throw new Error(`文本高度调整不属于 text.replace 目标: ${adjustment.elementId}`);
    }
    const location = findElementLocation(doc, adjustment.elementId);
    if (!location || location.element.type !== 'text') {
      throw new Error(`文本高度调整目标不是普通文本元素: ${adjustment.elementId}`);
    }
    const maxHeight = maxAiTextHeightPx(location.element, doc.pages[location.pageIndex], doc);
    if (
      !Number.isFinite(adjustment.height) ||
      adjustment.height < 1 ||
      adjustment.height > maxHeight
    ) {
      throw new Error(`文本高度调整超出安全范围: ${adjustment.elementId}`);
    }
  }

  const heightById = new Map(
    adjustments.map((adjustment) => [
      adjustment.elementId,
      Math.round(adjustment.height * 1000) / 1000,
    ])
  );

  return {
    ...doc,
    pages: doc.pages.map((page) => ({
      ...page,
      elements: page.elements.map((element) => {
        const height = heightById.get(element.id);
        return height === undefined ? element : { ...element, height };
      }),
    })),
  };
}

export function canAutoApplyAiProposal(
  proposal: AiEditProposal,
  doc: ResumeDocument
): AiValidationResult {
  const validation = validateAiEditProposal({ ...proposal, validationProfile: 'strict' }, doc);
  const issues = [...validation.issues];
  const onlyTextReplace =
    proposal.commands.length === 1 && proposal.commands[0].type === 'text.replace';

  if (
    !proposal.autoApply ||
    proposal.requiresConfirmation ||
    proposal.risk !== 'low' ||
    !onlyTextReplace
  ) {
    issues.push({
      code: 'not_auto_apply_safe',
      message: '该 AI 提案不满足自动应用白名单条件',
    });
  }

  return { ok: issues.every((issue) => issue.severity === 'warning'), issues };
}

function elementSnapshotMatches(left: ResumeElement, right: ResumeElement): boolean {
  const a = createAiElementSnapshot(left);
  const b = createAiElementSnapshot(right);
  return a.updatedHash === b.updatedHash && a.content === b.content;
}

function checkpointDocuments(change: AiAppliedChange): {
  before: ResumeDocument;
  after: ResumeDocument;
} | null {
  if (!change.beforeDocument || !change.afterDocument) return null;
  return { before: change.beforeDocument, after: change.afterDocument };
}

/**
 * 预检 AI checkpoint 是否可安全回退。
 * 普通元素修改只检查目标元素，允许保留其他区域的后续手改；
 * ResumeData 重排会替换整份文档，因此必须要求当前文档仍等于 after checkpoint。
 */
export function previewAiChangeRevert(
  change: AiAppliedChange,
  current: ResumeDocument
): AiRevertPreview {
  const checkpoint = checkpointDocuments(change);
  if (!checkpoint) {
    return { ok: false, message: '该 AI 修改缺少回退 checkpoint', changedElementIds: [] };
  }
  if (change.status === 'reverted') {
    return { ok: false, message: '该 AI 修改已回退', changedElementIds: [] };
  }

  if (change.commandTypes.includes('resumeData.patch')) {
    const expected = change.afterHash ?? createDocumentFingerprint(checkpoint.after);
    if (createDocumentFingerprint(current) !== expected) {
      return {
        ok: false,
        message: '结构化 AI 修改后文档已变化，为避免覆盖后续编辑已阻止回退',
        changedElementIds: [],
      };
    }
    return { ok: true, changedElementIds: change.changedElementIds };
  }

  for (const elementId of change.changedElementIds) {
    const after = findElementLocation(checkpoint.after, elementId)?.element;
    const currentElement = findElementLocation(current, elementId)?.element;

    if (after && (!currentElement || !elementSnapshotMatches(after, currentElement))) {
      return {
        ok: false,
        message: `AI 修改目标已被后续编辑：${after.name}`,
        changedElementIds: [],
      };
    }
    if (!after && currentElement) {
      return {
        ok: false,
        message: `AI 删除后目标已被重新创建：${currentElement.name}`,
        changedElementIds: [],
      };
    }
  }

  return { ok: true, changedElementIds: change.changedElementIds };
}

/**
 * 通过 checkpoint 确定性回退一次 AI 修改，不会覆盖非目标区域的后续编辑。
 * 回退发生时间由持久化边界记录，不属于文档 transform。
 */
export function revertAiAppliedChange(
  change: AiAppliedChange,
  current: ResumeDocument
): AiApplyResult {
  const preview = previewAiChangeRevert(change, current);
  if (!preview.ok) throw new Error(preview.message || '该 AI 修改当前不可回退');

  const checkpoint = checkpointDocuments(change);
  if (!checkpoint) throw new Error('该 AI 修改缺少回退 checkpoint');
  if (change.commandTypes.includes('resumeData.patch')) {
    return {
      document: cloneDocument(checkpoint.before),
      changedElementIds: change.changedElementIds,
    };
  }

  const next = cloneDocument(current);
  for (const elementId of change.changedElementIds) {
    const beforeLocation = findElementLocation(checkpoint.before, elementId);
    const afterLocation = findElementLocation(checkpoint.after, elementId);
    const currentLocation = findElementLocation(next, elementId);

    if (beforeLocation && currentLocation) {
      next.pages[currentLocation.pageIndex].elements[currentLocation.elementIndex] = JSON.parse(
        JSON.stringify(beforeLocation.element)
      ) as ResumeElement;
      continue;
    }
    if (beforeLocation && !afterLocation && !currentLocation) {
      const targetPage = next.pages[beforeLocation.pageIndex];
      if (!targetPage) throw new Error(`AI 回退目标页已不存在: ${elementId}`);
      targetPage.elements.splice(
        Math.min(beforeLocation.elementIndex, targetPage.elements.length),
        0,
        JSON.parse(JSON.stringify(beforeLocation.element)) as ResumeElement
      );
      continue;
    }
    if (!beforeLocation && currentLocation) {
      next.pages[currentLocation.pageIndex].elements.splice(currentLocation.elementIndex, 1);
    }
  }

  return { document: next, changedElementIds: change.changedElementIds };
}

export interface AiLayoutIssue {
  code: string;
  message: string;
  pageIndex: number;
  elementId?: string;
  severity: 'warning' | 'error';
}

export function analyzeAiLayoutSafety(doc: ResumeDocument): AiLayoutIssue[] {
  const issues: AiLayoutIssue[] = [];
  doc.pages.forEach((page, pageIndex) => {
    const maxWidth = pageWidthPx(page, doc);
    const maxHeight = pageHeightPx(page, doc);
    const visible = page.elements.filter((element) => element.visible !== false);

    for (const element of visible) {
      if (element.width <= 1 || element.height <= 1) {
        issues.push({
          code: 'element_too_small',
          message: `元素尺寸过小: ${element.name}`,
          pageIndex,
          elementId: element.id,
          severity: 'error',
        });
      }
      if (
        element.left < -maxWidth * 0.2 ||
        element.top < -maxHeight * 0.2 ||
        element.left + element.width > maxWidth * 1.2 ||
        element.top + element.height > maxHeight * 1.2
      ) {
        issues.push({
          code: 'element_out_of_page',
          message: `元素明显越出页面安全范围: ${element.name}`,
          pageIndex,
          elementId: element.id,
          severity: 'error',
        });
      }
      if (element.type === 'text' && element.fontSize < 8) {
        issues.push({
          code: 'font_too_small',
          message: `文本字号低于可读阈值: ${element.name}`,
          pageIndex,
          elementId: element.id,
          severity: 'warning',
        });
      }
    }

    for (let i = 0; i < visible.length; i++) {
      for (let j = i + 1; j < visible.length; j++) {
        const a = visible[i];
        const b = visible[j];
        if (a.semanticRef?.role === 'decorative' || b.semanticRef?.role === 'decorative') continue;
        const x = Math.max(
          0,
          Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left)
        );
        const y = Math.max(
          0,
          Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top)
        );
        const overlap = x * y;
        const minArea = Math.min(a.width * a.height, b.width * b.height);
        if (minArea > 0 && overlap / minArea > 0.65) {
          issues.push({
            code: 'large_element_overlap',
            message: `元素重叠比例过高: ${a.name} / ${b.name}`,
            pageIndex,
            elementId: a.id,
            severity: 'warning',
          });
        }
      }
    }
  });
  return issues;
}

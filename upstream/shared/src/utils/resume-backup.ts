import type { ResumeDocument } from '../types/document';

export const RESUME_BACKUP_FORMAT = 'fast-resume-backup';
export const RESUME_BACKUP_SCHEMA_VERSION = 1;
export const MAX_RESUME_BACKUP_FILE_SIZE = 10 * 1024 * 1024;

const MAX_PAGES = 200;
const MAX_ELEMENTS = 20_000;
const MAX_GROUP_DEPTH = 20;
const MAX_COLLECTION_ITEMS = 10_000;
const MAX_VALIDATION_ISSUES = 100;

export interface ResumeBackupEnvelope {
  format: typeof RESUME_BACKUP_FORMAT;
  schemaVersion: typeof RESUME_BACKUP_SCHEMA_VERSION;
  exportedAt: string;
  document: ResumeDocument;
}

export interface ParsedResumeBackup {
  document: ResumeDocument;
  exportedAt?: string;
  source: 'versioned' | 'legacy';
  schemaVersion: number;
}

export interface ResumeDocumentValidationIssue {
  path: string;
  message: string;
}

export type ResumeDocumentValidationResult =
  | { success: true; document: ResumeDocument }
  | { success: false; issues: ResumeDocumentValidationIssue[] };

export type ResumeBackupErrorCode = 'INVALID_JSON' | 'INVALID_BACKUP' | 'UNSUPPORTED_VERSION';

export class ResumeBackupError extends Error {
  readonly code: ResumeBackupErrorCode;
  readonly issues: ResumeDocumentValidationIssue[];

  constructor(
    code: ResumeBackupErrorCode,
    message: string,
    issues: ResumeDocumentValidationIssue[] = []
  ) {
    super(message);
    this.name = 'ResumeBackupError';
    this.code = code;
    this.issues = issues;
  }
}

type UnknownRecord = Record<string, unknown>;

interface ValidationContext {
  issues: ResumeDocumentValidationIssue[];
  pageIds: Set<string>;
  elementIds: Set<string>;
  elementCount: number;
}

const PAGE_SIZES = new Set(['A4', 'Letter', 'Custom']);
const PAGE_ORIENTATIONS = new Set(['portrait', 'landscape']);
const ELEMENT_TYPES = new Set(['text', 'image', 'shape', 'group']);
const FONT_WEIGHTS = new Set([
  'normal',
  'bold',
  '100',
  '200',
  '300',
  '400',
  '500',
  '600',
  '700',
  '800',
  '900',
]);
const FONT_STYLES = new Set(['normal', 'italic']);
const TEXT_ALIGNS = new Set(['left', 'center', 'right', 'justify']);
const SHAPE_TYPES = new Set([
  'rectangle',
  'roundedRectangle',
  'circle',
  'ellipse',
  'triangle',
  'diamond',
  'parallelogram',
  'trapezoid',
  'pentagon',
  'hexagon',
  'star',
  'callout',
  'line',
]);
const SEMANTIC_SECTIONS = new Set([
  'personalInfo',
  'summary',
  'experience',
  'education',
  'skills',
  'projects',
  'certifications',
  'custom',
]);
const SEMANTIC_ROLES = new Set(['sectionTitle', 'itemTitle', 'itemBody', 'metadata', 'decorative']);

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function addIssue(context: ValidationContext, path: string, message: string): void {
  if (context.issues.length < MAX_VALIDATION_ISSUES) {
    context.issues.push({ path, message });
  }
}

function validateString(
  value: unknown,
  path: string,
  context: ValidationContext,
  options: { optional?: boolean; nonEmpty?: boolean } = {}
): void {
  if (value === undefined && options.optional) return;
  if (typeof value !== 'string') {
    addIssue(context, path, '必须是字符串');
  } else if (options.nonEmpty && value.trim().length === 0) {
    addIssue(context, path, '不能为空');
  }
}

function validateBoolean(
  value: unknown,
  path: string,
  context: ValidationContext,
  optional = false
): void {
  if (value === undefined && optional) return;
  if (typeof value !== 'boolean') addIssue(context, path, '必须是布尔值');
}

function validateNumber(
  value: unknown,
  path: string,
  context: ValidationContext,
  options: { optional?: boolean; min?: number; max?: number; integer?: boolean } = {}
): void {
  if (value === undefined && options.optional) return;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    addIssue(context, path, '必须是有限数字');
    return;
  }
  if (options.integer && !Number.isInteger(value)) addIssue(context, path, '必须是整数');
  if (options.min !== undefined && value < options.min) {
    addIssue(context, path, `不能小于 ${options.min}`);
  }
  if (options.max !== undefined && value > options.max) {
    addIssue(context, path, `不能大于 ${options.max}`);
  }
}

function validateEnum(
  value: unknown,
  allowed: Set<string>,
  path: string,
  context: ValidationContext,
  optional = false
): void {
  if (value === undefined && optional) return;
  if (typeof value !== 'string' || !allowed.has(value)) {
    addIssue(context, path, `不支持的值: ${String(value)}`);
  }
}

function validateStringArray(
  value: unknown,
  path: string,
  context: ValidationContext,
  optional = false
): void {
  if (value === undefined && optional) return;
  if (!Array.isArray(value)) {
    addIssue(context, path, '必须是数组');
    return;
  }
  if (value.length > MAX_COLLECTION_ITEMS) {
    addIssue(context, path, `数组项不能超过 ${MAX_COLLECTION_ITEMS}`);
  }
  value
    .slice(0, MAX_COLLECTION_ITEMS)
    .forEach((item, index) => validateString(item, `${path}[${index}]`, context));
}

function validatePageConfig(
  value: unknown,
  path: string,
  context: ValidationContext,
  partial = false
): void {
  if (!isRecord(value)) {
    addIssue(context, path, '必须是页面配置对象');
    return;
  }

  validateEnum(value.size, PAGE_SIZES, `${path}.size`, context, partial);
  validateEnum(value.orientation, PAGE_ORIENTATIONS, `${path}.orientation`, context, partial);
  validateNumber(value.width, `${path}.width`, context, { optional: partial, min: 1 });
  validateNumber(value.height, `${path}.height`, context, { optional: partial, min: 1 });
  validateString(value.backgroundColor, `${path}.backgroundColor`, context, {
    optional: partial,
    nonEmpty: true,
  });
  validateNumber(value.dpi, `${path}.dpi`, context, { optional: partial, min: 1 });

  if (value.margins === undefined && partial) return;
  if (!isRecord(value.margins)) {
    addIssue(context, `${path}.margins`, '必须是边距对象');
    return;
  }
  for (const side of ['top', 'right', 'bottom', 'left'] as const) {
    validateNumber(value.margins[side], `${path}.margins.${side}`, context, { min: 0 });
  }
}

function validateBorder(value: unknown, path: string, context: ValidationContext): void {
  if (value === undefined) return;
  if (!isRecord(value)) {
    addIssue(context, path, '必须是边框对象');
    return;
  }
  validateString(value.color, `${path}.color`, context, { nonEmpty: true });
  validateNumber(value.width, `${path}.width`, context, { min: 0 });
  validateEnum(
    value.style,
    new Set(['solid', 'dashed', 'dotted', 'none']),
    `${path}.style`,
    context
  );
}

function validateShadow(value: unknown, path: string, context: ValidationContext): void {
  if (value === undefined) return;
  if (!isRecord(value)) {
    addIssue(context, path, '必须是阴影对象');
    return;
  }
  validateString(value.color, `${path}.color`, context, { nonEmpty: true });
  validateNumber(value.offsetX, `${path}.offsetX`, context);
  validateNumber(value.offsetY, `${path}.offsetY`, context);
  validateNumber(value.blur, `${path}.blur`, context, { min: 0 });
}

function validateSemanticRef(value: unknown, path: string, context: ValidationContext): void {
  if (value === undefined) return;
  if (!isRecord(value)) {
    addIssue(context, path, '必须是语义引用对象');
    return;
  }
  validateEnum(value.section, SEMANTIC_SECTIONS, `${path}.section`, context);
  validateString(value.itemId, `${path}.itemId`, context, { optional: true });
  validateString(value.field, `${path}.field`, context, { optional: true });
  validateEnum(value.role, SEMANTIC_ROLES, `${path}.role`, context, true);
}

function validateLink(value: unknown, path: string, context: ValidationContext): void {
  if (value === undefined) return;
  if (!isRecord(value)) {
    addIssue(context, path, '必须是链接对象');
    return;
  }
  validateString(value.url, `${path}.url`, context, { nonEmpty: true });
  validateString(value.title, `${path}.title`, context, { optional: true });
  if (typeof value.url === 'string' && /^\s*(?:javascript|data|vbscript):/i.test(value.url)) {
    addIssue(context, `${path}.url`, '包含不安全的链接协议');
  }
}

function validateSegments(value: unknown, path: string, context: ValidationContext): void {
  if (value === undefined) return;
  if (!Array.isArray(value)) {
    addIssue(context, path, '必须是富文本片段数组');
    return;
  }
  value.forEach((segment, index) => {
    const segmentPath = `${path}[${index}]`;
    if (!isRecord(segment)) {
      addIssue(context, segmentPath, '必须是富文本片段对象');
      return;
    }
    validateString(segment.text, `${segmentPath}.text`, context);
    validateBoolean(segment.bold, `${segmentPath}.bold`, context, true);
    validateBoolean(segment.italic, `${segmentPath}.italic`, context, true);
    validateBoolean(segment.underline, `${segmentPath}.underline`, context, true);
    validateBoolean(segment.strikethrough, `${segmentPath}.strikethrough`, context, true);
    validateString(segment.color, `${segmentPath}.color`, context, { optional: true });
  });
}

function validateElement(
  value: unknown,
  path: string,
  context: ValidationContext,
  depth = 0
): void {
  if (!isRecord(value)) {
    addIssue(context, path, '必须是画布元素对象');
    return;
  }

  context.elementCount += 1;
  if (context.elementCount > MAX_ELEMENTS) {
    if (context.elementCount === MAX_ELEMENTS + 1) {
      addIssue(context, path, `元素总数不能超过 ${MAX_ELEMENTS}`);
    }
    return;
  }

  validateString(value.id, `${path}.id`, context, { nonEmpty: true });
  if (typeof value.id === 'string') {
    if (context.elementIds.has(value.id)) addIssue(context, `${path}.id`, '元素 ID 重复');
    context.elementIds.add(value.id);
  }
  validateEnum(value.type, ELEMENT_TYPES, `${path}.type`, context);
  validateString(value.name, `${path}.name`, context, { nonEmpty: true });
  validateSemanticRef(value.semanticRef, `${path}.semanticRef`, context);
  validateLink(value.link, `${path}.link`, context);
  validateNumber(value.left, `${path}.left`, context);
  validateNumber(value.top, `${path}.top`, context);
  validateNumber(value.width, `${path}.width`, context, { min: 0 });
  validateNumber(value.height, `${path}.height`, context, { min: 0 });
  validateNumber(value.rotation, `${path}.rotation`, context);
  validateNumber(value.opacity, `${path}.opacity`, context, { min: 0, max: 1 });
  validateBoolean(value.visible, `${path}.visible`, context);
  validateBoolean(value.locked, `${path}.locked`, context);
  validateBorder(value.border, `${path}.border`, context);
  validateShadow(value.shadow, `${path}.shadow`, context);
  validateNumber(value.zIndex, `${path}.zIndex`, context, { integer: true });

  if (value.type === 'text') {
    validateString(value.content, `${path}.content`, context);
    validateNumber(value.fontSize, `${path}.fontSize`, context, { min: 0 });
    validateString(value.fontFamily, `${path}.fontFamily`, context, { nonEmpty: true });
    validateEnum(value.fontWeight, FONT_WEIGHTS, `${path}.fontWeight`, context);
    validateEnum(value.fontStyle, FONT_STYLES, `${path}.fontStyle`, context);
    validateEnum(value.textAlign, TEXT_ALIGNS, `${path}.textAlign`, context);
    validateNumber(value.lineHeight, `${path}.lineHeight`, context, { min: 0 });
    validateNumber(value.letterSpacing, `${path}.letterSpacing`, context);
    validateString(value.color, `${path}.color`, context, { nonEmpty: true });
    validateString(value.backgroundColor, `${path}.backgroundColor`, context, { optional: true });
    validateBoolean(value.underline, `${path}.underline`, context);
    validateBoolean(value.strikethrough, `${path}.strikethrough`, context);
    validateSegments(value.segments, `${path}.segments`, context);
    return;
  }

  if (value.type === 'image') {
    validateEnum(
      value.imageRole,
      new Set(['image', 'icon', 'linkIcon']),
      `${path}.imageRole`,
      context,
      true
    );
    validateString(value.iconPresetId, `${path}.iconPresetId`, context, { optional: true });
    validateString(value.src, `${path}.src`, context);
    if (typeof value.src === 'string' && /^\s*(?:javascript|vbscript):/i.test(value.src)) {
      addIssue(context, `${path}.src`, '包含不安全的图片协议');
    }
    validateNumber(value.originalWidth, `${path}.originalWidth`, context, { min: 0 });
    validateNumber(value.originalHeight, `${path}.originalHeight`, context, { min: 0 });
    validateNumber(value.cropX, `${path}.cropX`, context, { min: 0 });
    validateNumber(value.cropY, `${path}.cropY`, context, { min: 0 });
    validateNumber(value.cropWidth, `${path}.cropWidth`, context, { min: 0 });
    validateNumber(value.cropHeight, `${path}.cropHeight`, context, { min: 0 });
    validateNumber(value.borderRadius, `${path}.borderRadius`, context, { min: 0 });
    validateEnum(
      value.objectFit,
      new Set(['cover', 'contain', 'fill']),
      `${path}.objectFit`,
      context
    );
    return;
  }

  if (value.type === 'shape') {
    validateEnum(value.shapeType, SHAPE_TYPES, `${path}.shapeType`, context);
    validateString(value.fill, `${path}.fill`, context);
    validateString(value.strokeColor, `${path}.strokeColor`, context);
    validateNumber(value.strokeWidth, `${path}.strokeWidth`, context, { min: 0 });
    validateNumber(value.borderRadius, `${path}.borderRadius`, context, { min: 0 });
    validateString(value.text, `${path}.text`, context, { optional: true });
    validateSegments(value.segments, `${path}.segments`, context);
    validateNumber(value.fontSize, `${path}.fontSize`, context, { optional: true, min: 0 });
    validateString(value.fontFamily, `${path}.fontFamily`, context, { optional: true });
    validateEnum(value.fontWeight, FONT_WEIGHTS, `${path}.fontWeight`, context, true);
    validateEnum(value.fontStyle, FONT_STYLES, `${path}.fontStyle`, context, true);
    validateString(value.textColor, `${path}.textColor`, context, { optional: true });
    validateEnum(value.textAlign, TEXT_ALIGNS, `${path}.textAlign`, context, true);
    validateNumber(value.lineHeight, `${path}.lineHeight`, context, { optional: true, min: 0 });
    validateNumber(value.letterSpacing, `${path}.letterSpacing`, context, { optional: true });
    return;
  }

  if (value.type === 'group') {
    if (depth >= MAX_GROUP_DEPTH) {
      addIssue(context, `${path}.children`, `组合元素嵌套不能超过 ${MAX_GROUP_DEPTH} 层`);
      return;
    }
    if (!Array.isArray(value.children)) {
      addIssue(context, `${path}.children`, '必须是元素数组');
      return;
    }
    value.children.forEach((child, index) =>
      validateElement(child, `${path}.children[${index}]`, context, depth + 1)
    );
  }
}

function validateMetadata(value: unknown, path: string, context: ValidationContext): void {
  if (!isRecord(value)) {
    addIssue(context, path, '必须是文档元数据对象');
    return;
  }
  validateString(value.title, `${path}.title`, context);
  validateString(value.author, `${path}.author`, context);
  validateString(value.createdAt, `${path}.createdAt`, context, { nonEmpty: true });
  validateString(value.updatedAt, `${path}.updatedAt`, context, { nonEmpty: true });
  validateString(value.description, `${path}.description`, context, { optional: true });
  validateStringArray(value.tags, `${path}.tags`, context, true);
}

function validateResumeData(value: unknown, path: string, context: ValidationContext): void {
  if (value === undefined) return;
  if (!isRecord(value)) {
    addIssue(context, path, '必须是结构化简历对象');
    return;
  }

  if (!isRecord(value.personalInfo)) {
    addIssue(context, `${path}.personalInfo`, '必须是个人信息对象');
  } else {
    validateString(value.personalInfo.name, `${path}.personalInfo.name`, context);
    for (const field of [
      'title',
      'email',
      'phone',
      'location',
      'website',
      'linkedin',
      'github',
      'avatar',
      'summary',
    ]) {
      validateString(value.personalInfo[field], `${path}.personalInfo.${field}`, context, {
        optional: true,
      });
    }
  }

  validateObjectArray(value.experience, `${path}.experience`, context, (item, itemPath) => {
    validateString(item.id, `${itemPath}.id`, context, { nonEmpty: true });
    validateString(item.company, `${itemPath}.company`, context);
    validateString(item.position, `${itemPath}.position`, context);
    validateString(item.startDate, `${itemPath}.startDate`, context);
    validateString(item.endDate, `${itemPath}.endDate`, context, { optional: true });
    validateString(item.location, `${itemPath}.location`, context, { optional: true });
    validateStringArray(item.descriptions, `${itemPath}.descriptions`, context);
    validateStringArray(item.highlights, `${itemPath}.highlights`, context, true);
  });

  validateObjectArray(value.education, `${path}.education`, context, (item, itemPath) => {
    validateString(item.id, `${itemPath}.id`, context, { nonEmpty: true });
    validateString(item.school, `${itemPath}.school`, context);
    validateString(item.degree, `${itemPath}.degree`, context);
    validateString(item.major, `${itemPath}.major`, context);
    validateString(item.startDate, `${itemPath}.startDate`, context);
    validateString(item.endDate, `${itemPath}.endDate`, context, { optional: true });
    validateString(item.gpa, `${itemPath}.gpa`, context, { optional: true });
    validateStringArray(item.achievements, `${itemPath}.achievements`, context, true);
  });

  validateObjectArray(value.skills, `${path}.skills`, context, (group, groupPath) => {
    validateString(group.category, `${groupPath}.category`, context);
    validateObjectArray(group.items, `${groupPath}.items`, context, (item, itemPath) => {
      validateString(item.name, `${itemPath}.name`, context, { nonEmpty: true });
      validateEnum(
        item.level,
        new Set(['beginner', 'intermediate', 'advanced', 'expert']),
        `${itemPath}.level`,
        context,
        true
      );
    });
  });

  validateObjectArray(value.projects, `${path}.projects`, context, (item, itemPath) => {
    validateString(item.id, `${itemPath}.id`, context, { nonEmpty: true });
    validateString(item.name, `${itemPath}.name`, context);
    validateString(item.role, `${itemPath}.role`, context, { optional: true });
    validateString(item.startDate, `${itemPath}.startDate`, context, { optional: true });
    validateString(item.endDate, `${itemPath}.endDate`, context, { optional: true });
    validateString(item.description, `${itemPath}.description`, context);
    validateStringArray(item.techStack, `${itemPath}.techStack`, context, true);
    validateString(item.link, `${itemPath}.link`, context, { optional: true });
  });

  validateObjectArray(value.certifications, `${path}.certifications`, context, (item, itemPath) => {
    validateString(item.name, `${itemPath}.name`, context);
    validateString(item.issuer, `${itemPath}.issuer`, context);
    validateString(item.date, `${itemPath}.date`, context, { optional: true });
    validateString(item.link, `${itemPath}.link`, context, { optional: true });
  });

  validateObjectArray(
    value.customSections,
    `${path}.customSections`,
    context,
    (section, sectionPath) => {
      validateString(section.id, `${sectionPath}.id`, context, { nonEmpty: true });
      validateString(section.title, `${sectionPath}.title`, context);
      validateObjectArray(section.items, `${sectionPath}.items`, context, (item, itemPath) => {
        validateString(item.title, `${itemPath}.title`, context, { optional: true });
        validateString(item.subtitle, `${itemPath}.subtitle`, context, { optional: true });
        validateString(item.date, `${itemPath}.date`, context, { optional: true });
        validateString(item.description, `${itemPath}.description`, context, { optional: true });
        validateStringArray(item.details, `${itemPath}.details`, context, true);
      });
    }
  );
  validateStringArray(value.sectionOrder, `${path}.sectionOrder`, context, true);
}

function validateObjectArray(
  value: unknown,
  path: string,
  context: ValidationContext,
  validateItem: (item: UnknownRecord, itemPath: string) => void
): void {
  if (!Array.isArray(value)) {
    addIssue(context, path, '必须是数组');
    return;
  }
  if (value.length > MAX_COLLECTION_ITEMS) {
    addIssue(context, path, `数组项不能超过 ${MAX_COLLECTION_ITEMS}`);
  }
  value.slice(0, MAX_COLLECTION_ITEMS).forEach((item, index) => {
    const itemPath = `${path}[${index}]`;
    if (!isRecord(item)) {
      addIssue(context, itemPath, '必须是对象');
      return;
    }
    validateItem(item, itemPath);
  });
}

export function validateResumeDocument(value: unknown): ResumeDocumentValidationResult {
  const context: ValidationContext = {
    issues: [],
    pageIds: new Set(),
    elementIds: new Set(),
    elementCount: 0,
  };

  if (!isRecord(value)) {
    return { success: false, issues: [{ path: '$', message: '文档必须是对象' }] };
  }

  validateString(value.id, 'id', context, { nonEmpty: true });
  validateString(value.version, 'version', context, { nonEmpty: true });
  validateMetadata(value.metadata, 'metadata', context);
  validatePageConfig(value.pageConfig, 'pageConfig', context);
  validateString(value.templateId, 'templateId', context, { optional: true });
  validateResumeData(value.resumeData, 'resumeData', context);

  if (!Array.isArray(value.pages)) {
    addIssue(context, 'pages', '必须是页面数组');
  } else {
    if (value.pages.length === 0) addIssue(context, 'pages', '至少需要一个页面');
    if (value.pages.length > MAX_PAGES) addIssue(context, 'pages', `页面不能超过 ${MAX_PAGES} 页`);
    value.pages.slice(0, MAX_PAGES).forEach((page, pageIndex) => {
      const pagePath = `pages[${pageIndex}]`;
      if (!isRecord(page)) {
        addIssue(context, pagePath, '必须是页面对象');
        return;
      }
      validateString(page.id, `${pagePath}.id`, context, { nonEmpty: true });
      if (typeof page.id === 'string') {
        if (context.pageIds.has(page.id)) addIssue(context, `${pagePath}.id`, '页面 ID 重复');
        context.pageIds.add(page.id);
      }
      validateNumber(page.pageNumber, `${pagePath}.pageNumber`, context, { min: 1, integer: true });
      if (page.config !== undefined)
        validatePageConfig(page.config, `${pagePath}.config`, context, true);
      if (!Array.isArray(page.elements)) {
        addIssue(context, `${pagePath}.elements`, '必须是元素数组');
        return;
      }
      page.elements.forEach((element, elementIndex) =>
        validateElement(element, `${pagePath}.elements[${elementIndex}]`, context)
      );
    });
  }

  if (context.issues.length > 0) return { success: false, issues: context.issues };
  return { success: true, document: value as unknown as ResumeDocument };
}

export function createResumeBackup(
  document: ResumeDocument,
  exportedAt = new Date().toISOString()
): ResumeBackupEnvelope {
  const validation = validateResumeDocument(document);
  if (!validation.success) throw invalidDocumentError(validation.issues);
  return {
    format: RESUME_BACKUP_FORMAT,
    schemaVersion: RESUME_BACKUP_SCHEMA_VERSION,
    exportedAt,
    document: validation.document,
  };
}

export function serializeResumeBackup(document: ResumeDocument): string {
  return JSON.stringify(createResumeBackup(document), null, 2);
}

export function parseResumeBackup(input: string | unknown): ParsedResumeBackup {
  let value = input;
  if (typeof input === 'string') {
    try {
      value = JSON.parse(input) as unknown;
    } catch {
      throw new ResumeBackupError('INVALID_JSON', '文件不是有效的 JSON');
    }
  }

  if (!isRecord(value)) {
    throw new ResumeBackupError('INVALID_BACKUP', 'JSON 备份的顶层必须是对象');
  }

  if (
    value.format !== undefined ||
    value.schemaVersion !== undefined ||
    value.document !== undefined
  ) {
    if (value.format !== RESUME_BACKUP_FORMAT) {
      throw new ResumeBackupError('INVALID_BACKUP', '不是 Fast Resume JSON 备份');
    }
    if (!Number.isInteger(value.schemaVersion) || (value.schemaVersion as number) < 1) {
      throw new ResumeBackupError('INVALID_BACKUP', '备份 schemaVersion 无效');
    }
    if ((value.schemaVersion as number) > RESUME_BACKUP_SCHEMA_VERSION) {
      throw new ResumeBackupError(
        'UNSUPPORTED_VERSION',
        `该备份来自更高版本（schema v${String(value.schemaVersion)}），当前仅支持到 v${RESUME_BACKUP_SCHEMA_VERSION}`
      );
    }
    if (typeof value.exportedAt !== 'string' || !Number.isFinite(Date.parse(value.exportedAt))) {
      throw new ResumeBackupError('INVALID_BACKUP', '备份 exportedAt 无效');
    }

    const migrated = migrateVersionedBackup(value);
    const validation = validateResumeDocument(migrated.document);
    if (!validation.success) throw invalidDocumentError(validation.issues);
    return {
      document: validation.document,
      exportedAt: migrated.exportedAt,
      source: 'versioned',
      schemaVersion: RESUME_BACKUP_SCHEMA_VERSION,
    };
  }

  const validation = validateResumeDocument(value);
  if (!validation.success) throw invalidDocumentError(validation.issues);
  return {
    document: validation.document,
    source: 'legacy',
    schemaVersion: 0,
  };
}

function migrateVersionedBackup(value: UnknownRecord): ResumeBackupEnvelope {
  // v1 是首个带 envelope 的格式。后续版本在此逐级迁移，调用方无需感知。
  return value as unknown as ResumeBackupEnvelope;
}

function invalidDocumentError(issues: ResumeDocumentValidationIssue[]): ResumeBackupError {
  const details = issues
    .slice(0, 3)
    .map((issue) => `${issue.path}: ${issue.message}`)
    .join('；');
  const suffix = issues.length > 3 ? `；另有 ${issues.length - 3} 处错误` : '';
  return new ResumeBackupError('INVALID_BACKUP', `备份文档结构无效：${details}${suffix}`, issues);
}

export function countResumeDocumentElements(document: ResumeDocument): number {
  const countElements = (elements: ResumeDocument['pages'][number]['elements']): number =>
    elements.reduce(
      (total, element) =>
        total + 1 + (element.type === 'group' ? countElements(element.children) : 0),
      0
    );
  return document.pages.reduce((total, page) => total + countElements(page.elements), 0);
}

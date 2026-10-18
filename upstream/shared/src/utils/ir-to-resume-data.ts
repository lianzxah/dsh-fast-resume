import type {
  ResumeData,
  PersonalInfo,
  DocBlock,
  ParsedDocument,
} from '../types';
import {
  SECTION_KEYWORDS,
  CONTACT_HEADING_KEYWORDS,
  CONTACT_PATTERNS,
  DATE_PATTERNS,
  createEmptyResumeData,
  customSectionToken,
} from '../types/resume-data';
import { generateId } from './helpers';

// ============================================================
// IR (ParsedDocument) → ResumeData 语义映射
// 供 docx / pdf / 纯文本 三种来源统一复用。
// 设计：先将 blocks 归一化 (把「关键词行」提升为 heading)，
// 再按 section 顺序游走累积，天然融合「结构化」与「启发式兜底」。
// ============================================================

/** 识别段落标题对应的 section key；非 section 返回 null */
function identifySection(title: string): string | null {
  const lower = title.toLowerCase().trim();
  for (const [key, keywords] of Object.entries(SECTION_KEYWORDS)) {
    for (const kw of keywords) {
      if (lower.includes(kw.toLowerCase())) return key;
    }
  }
  return null;
}

/** 一行文本是否「看起来像」段落标题 (短行 + 命中关键词) */
function looksLikeSectionHeading(text: string): string | null {
  const t = text.trim();
  if (!t || t.length > 20) return null;
  return identifySection(t);
}

/** 是否为联系方式段落标题 */
function isContactHeading(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (!t || t.length > 20) return false;
  return CONTACT_HEADING_KEYWORDS.some((k) => t.includes(k.toLowerCase()));
}

/** 去除 markdown 强调/代码标记，得到干净文本 */
function stripEmphasis(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^\s*[*_]{1,2}\s*/, '')
    .trim();
}

/** 是否分隔线 / 空噪声行 */
function isSeparatorOrNoise(text: string): boolean {
  const t = text.trim();
  return !t || /^[-*_=]{3,}$/.test(t);
}

/** 是否包含联系信息 */
function hasContact(text: string): boolean {
  return CONTACT_PATTERNS.email.test(text) || CONTACT_PATTERNS.phone.test(text) || CONTACT_PATTERNS.url.test(text);
}

/** 从 idx 之后到下一个 heading 之间是否存在内容块 */
function hasContentUntilNextHeading(blocks: DocBlock[], idx: number): boolean {
  for (let j = idx + 1; j < blocks.length; j++) {
    if (blocks[j].type === 'heading') return false;
    if (blocks[j].text.trim()) return true;
  }
  return false;
}

/** 是否包含日期区间 */
function hasDate(text: string): boolean {
  return DATE_PATTERNS.some((p) => p.test(text));
}

/** 提取联系信息到 personalInfo */
function extractContactInfo(line: string, info: PersonalInfo): void {
  const emailMatch = line.match(CONTACT_PATTERNS.email);
  if (emailMatch && !info.email) info.email = emailMatch[0];

  const phoneMatch = line.match(CONTACT_PATTERNS.phone);
  if (phoneMatch && !info.phone) info.phone = phoneMatch[0];

  const urlMatches = line.match(new RegExp(CONTACT_PATTERNS.url.source, 'g'));
  if (urlMatches) {
    for (const url of urlMatches) {
      if (url.includes('github.com')) info.github = url;
      else if (url.includes('linkedin.com')) info.linkedin = url;
      else if (!info.website) info.website = url;
    }
  }

  // 职位标题：管道分隔中不含联系信息的短片段
  const parts = line.split(/[|｜·・]/).map((p) => p.trim());
  for (const part of parts) {
    if (
      part &&
      !part.match(CONTACT_PATTERNS.email) &&
      !part.match(CONTACT_PATTERNS.phone) &&
      !part.match(CONTACT_PATTERNS.url) &&
      part.length > 1 &&
      part.length < 30 &&
      !info.title
    ) {
      info.title = part;
    }
  }
}

/** 解析经历标题: "XX公司 | 前端工程师 | 2022.03 - 至今" */
function parseExperienceTitle(title: string): {
  company: string;
  position: string;
  startDate?: string;
  endDate?: string;
} {
  const parts = title.split(/[|｜]/).map((p) => p.trim()).filter(Boolean);
  const result = {
    company: parts[0] || title,
    position: parts[1] || '',
    startDate: undefined as string | undefined,
    endDate: undefined as string | undefined,
  };
  for (const part of parts) {
    for (const pattern of DATE_PATTERNS) {
      const match = part.match(pattern);
      if (match) {
        result.startDate = match[1];
        result.endDate = match[2] || match[3] || undefined;
        break;
      }
    }
  }
  return result;
}

/** 解析教育标题 */
function parseEducationTitle(title: string): {
  school: string;
  degree: string;
  major: string;
  startDate?: string;
  endDate?: string;
} {
  const parts = title.split(/[|｜]/).map((p) => p.trim()).filter(Boolean);
  const result = {
    school: parts[0] || title,
    degree: '',
    major: '',
    startDate: undefined as string | undefined,
    endDate: undefined as string | undefined,
  };
  for (let i = 1; i < parts.length; i++) {
    const part = parts[i];
    let isDate = false;
    for (const pattern of DATE_PATTERNS) {
      const match = part.match(pattern);
      if (match) {
        result.startDate = match[1];
        result.endDate = match[2] || match[3] || undefined;
        isDate = true;
        break;
      }
    }
    if (isDate) continue;
    if (['本科', '硕士', '博士', 'Bachelor', 'Master', 'PhD', 'MBA', '学士', '研究生', '大专'].some((d) => part.includes(d))) {
      result.degree = part;
    } else if (!result.major) {
      result.major = part;
    }
  }
  return result;
}

/** 解析项目标题 */
function parseProjectTitle(title: string): { name: string; role?: string; techStack?: string[] } {
  const parts = title.split(/[|｜]/).map((p) => p.trim()).filter(Boolean);
  return {
    name: parts[0] || title,
    role: parts[1] || undefined,
    techStack: parts[2] ? parts[2].split(/[,，、]/).map((s) => s.trim()) : undefined,
  };
}

/** 归一化：仅当文档「完全无标题」(纯文本兜底场景)时，才把命中关键词的短段落提升为 heading。
 * 若文档已含结构化标题 (markdown/docx)，则信任其原有标题，避免误将“技术栈”等段内标签误升为段落。 */
function normalizeBlocks(blocks: DocBlock[]): DocBlock[] {
  const hasHeading = blocks.some((b) => b.type === 'heading');
  if (hasHeading) return blocks;
  return blocks.map((b) => {
    const t = b.text.trim();
    if (looksLikeSectionHeading(t) || (t.length <= 20 && isContactHeading(t))) {
      return { ...b, type: 'heading' as const, level: 2 };
    }
    return b;
  });
}

interface ItemAccumulator {
  title: string;
  lines: string[];
}

/**
 * 将结构化文档 (IR) 映射为 ResumeData。
 * 关键特性：
 *  - 保留原文段落顺序 (data.sectionOrder)
 *  - 未知段落原位保留为自定义段落 (custom)
 *  - 按 heading 层级区分「段落标题」与「条目子标题」
 *  - 联系方式段落并入 personalInfo，姓名/职位从头部识别
 */
export function parseDocumentToResumeData(parsed: ParsedDocument): ResumeData {
  const data = createEmptyResumeData();
  const order: string[] = [];
  const blocks = normalizeBlocks(parsed.blocks).filter((b) => !isSeparatorOrNoise(b.text));
  const n = blocks.length;
  if (n === 0) {
    data.sectionOrder = order;
    return data;
  }

  // ============================================================
  // 1. 头部：姓名 / 职位 / 联系方式
  // ============================================================
  let i = 0;
  const firstText = stripEmphasis(blocks[0].text);
  if (firstText && !hasContact(firstText) && firstText.length <= 40) {
    data.personalInfo.name = firstText;
    i = 1;
  }

  while (i < n) {
    const b = blocks[i];
    const text = stripEmphasis(b.text);
    if (b.type === 'heading') {
      if (isContactHeading(text)) {
        i++;
        while (i < n && blocks[i].type !== 'heading') {
          extractContactInfo(stripEmphasis(blocks[i].text), data.personalInfo);
          i++;
        }
        continue;
      }
      if (identifySection(text)) break; // 已知内容段开始
      // 未知 heading：无后续内容 → 视为职位(标题)；有内容 → 自定义段落(进入正文)
      if (!hasContentUntilNextHeading(blocks, i)) {
        if (!data.personalInfo.title && text.length <= 30) data.personalInfo.title = text;
        i++;
        continue;
      }
      break;
    }
    // 松散行：联系信息 / 职位
    extractContactInfo(text, data.personalInfo);
    if (!data.personalInfo.title && text.length <= 30 && !hasContact(text)) {
      data.personalInfo.title = text;
    }
    i++;
  }

  // ============================================================
  // 2. 正文：按段落游走，保留顺序
  // ============================================================
  let curKind: string | null = null; // 'experience'|'education'|'projects'|'skills'|'certifications'|'summary'|'custom'
  let curCustomId: string | null = null;
  let sectionLevel = 1; // 当前段落标题层级 (用于区分条目子标题)
  let item: ItemAccumulator | null = null;
  const summaryLines: string[] = [];

  const flushItem = () => {
    if (!item) return;
    const title = stripEmphasis(item.title);
    const lines = item.lines;
    if (!title && lines.length === 0) {
      item = null;
      return;
    }
    switch (curKind) {
      case 'experience': {
        const p = parseExperienceTitle(title);
        data.experience.push({
          id: generateId('exp'),
          company: p.company,
          position: p.position,
          startDate: p.startDate || '',
          endDate: p.endDate,
          descriptions: lines,
        });
        break;
      }
      case 'education': {
        const p = parseEducationTitle(title);
        data.education.push({
          id: generateId('edu'),
          school: p.school,
          degree: p.degree,
          major: p.major,
          startDate: p.startDate || '',
          endDate: p.endDate,
          achievements: lines.length > 0 ? lines : undefined,
        });
        break;
      }
      case 'projects': {
        const p = parseProjectTitle(title);
        data.projects.push({
          id: generateId('proj'),
          name: p.name,
          role: p.role,
          description: lines.join('\n'),
          techStack: p.techStack,
        });
        break;
      }
      case 'custom': {
        const cs = data.customSections.find((s) => s.id === curCustomId);
        if (cs) cs.items.push({ title: title || undefined, details: lines.length > 0 ? lines : undefined });
        break;
      }
    }
    item = null;
  };

  const commitSummary = () => {
    if (summaryLines.length > 0) {
      data.personalInfo.summary = summaryLines.join('\n');
      summaryLines.length = 0;
    }
  };

  /** 关闭当前段落 (提交条目与 summary) */
  const closeSection = () => {
    flushItem();
    commitSummary();
  };

  const openKnown = (kind: string, level: number) => {
    closeSection();
    curKind = kind;
    curCustomId = null;
    sectionLevel = level;
    if (kind !== 'summary' && !order.includes(kind)) order.push(kind);
    else if (kind === 'summary' && !order.includes('summary')) order.push('summary');
  };

  const openCustom = (title: string, level: number) => {
    closeSection();
    const id = generateId('custom');
    data.customSections.push({ id, title: title || '其他', items: [] });
    curKind = 'custom';
    curCustomId = id;
    sectionLevel = level;
    order.push(customSectionToken(id));
  };

  /** 条目起始判定 (entry-based 段落内) */
  const isEntryStart = (kind: string, b: DocBlock, text: string): boolean => {
    const dated = hasDate(text);
    const boldMarker = b.bold || /\*\*[^*]+\*\*/.test(b.text);
    if (kind === 'experience' || kind === 'education') {
      if (dated) return true;
      if (boldMarker && /[|｜]/.test(text)) return true;
      return false;
    }
    return false; // projects / custom 仅由子标题分条目
  };

  for (; i < n; i++) {
    const b = blocks[i];
    const text = stripEmphasis(b.text);
    if (!text) continue;

    if (b.type === 'heading') {
      const level = b.level ?? 2;
      // 子标题：在 entry-based 段落内且层级更深 → 一律视为条目标题，
      // 不参与段落类型识别 (避免如 "Vispec…(项目唯一负责人)" 因含"项目"被误判为段落)
      const entryBased =
        curKind === 'experience' || curKind === 'education' || curKind === 'projects' || curKind === 'custom';
      if (entryBased && level > sectionLevel) {
        flushItem();
        item = { title: text, lines: [] };
        continue;
      }
      if (isContactHeading(text)) {
        closeSection();
        let j = i + 1;
        for (; j < n && blocks[j].type !== 'heading'; j++) {
          extractContactInfo(stripEmphasis(blocks[j].text), data.personalInfo);
        }
        i = j - 1;
        curKind = null;
        continue;
      }
      const sec = identifySection(text);
      if (sec) {
        openKnown(sec, level);
        continue;
      }
      // 未知同级/更高级 heading → 新自定义段落 (原位保留)
      openCustom(text, level);
      continue;
    }

    // ---- 内容块 ----
    if (!curKind) continue; // 正文前的游离内容 (头部已处理)
    if (curKind === 'summary') {
      summaryLines.push(text);
      continue;
    }
    if (curKind === 'skills') {
      parseSkillLine(text, data);
      continue;
    }
    if (curKind === 'certifications') {
      pushCertification(text, data);
      continue;
    }
    // entry-based: experience / education / projects / custom
    if (isEntryStart(curKind, b, text)) {
      flushItem();
      item = { title: text, lines: [] };
    } else if (item) {
      item.lines.push(text);
    } else {
      item = { title: '', lines: [text] };
    }
  }
  closeSection();

  data.sectionOrder = order;
  return data;
}

/** 解析一行证书: "AWS - 亚马逊 - 2020" */
function pushCertification(line: string, data: ResumeData): void {
  const clean = stripEmphasis(line).replace(/^[-*•·]\s*/, '').trim();
  if (!clean) return;
  const parts = clean.split(/[|｜\-–—]/).map((s) => s.trim()).filter(Boolean);
  data.certifications.push({ name: parts[0] || clean, issuer: parts[1] || '', date: parts[2] });
}

/** 解析一行技能: "前端：React, Vue" 或逗号分隔列表 */
function parseSkillLine(line: string, data: ResumeData): void {
  const clean = line.replace(/^[-*•]\s*/, '').trim();
  if (!clean) return;
  const colonMatch = clean.match(/^(.+?)[：:]\s*(.+)/);
  if (colonMatch) {
    const category = colonMatch[1].trim();
    const items = colonMatch[2].split(/[,，、/;；]/).map((s) => s.trim()).filter(Boolean);
    if (items.length > 0) data.skills.push({ category, items: items.map((name) => ({ name })) });
  } else {
    const items = clean.split(/[,，、/;；]/).map((s) => s.trim()).filter(Boolean);
    if (items.length >= 1) data.skills.push({ category: '技能', items: items.map((name) => ({ name })) });
  }
}

/** 纯文本 → IR：按行拆分，识别列表项前缀；标题提升交由 normalizeBlocks 处理 */
export function plainTextToParsedDocument(text: string): ParsedDocument {
  const blocks: DocBlock[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const listMatch = line.match(/^[-*•·]\s+(.+)/);
    if (listMatch) {
      blocks.push({ type: 'list-item', text: listMatch[1].trim() });
    } else {
      blocks.push({ type: 'paragraph', text: line });
    }
  }
  return { blocks, rawText: text };
}

/** Markdown → IR：# 标题 / -*• 列表 / 其余段落 */
export function markdownToParsedDocument(text: string): ParsedDocument {
  const blocks: DocBlock[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const h = line.match(/^(#{1,6})\s+(.+)/);
    if (h) {
      blocks.push({ type: 'heading', level: h[1].length, text: h[2].trim() });
      continue;
    }
    const listMatch = line.match(/^[-*•·]\s+(.+)/);
    if (listMatch) {
      blocks.push({ type: 'list-item', text: listMatch[1].trim() });
      continue;
    }
    blocks.push({ type: 'paragraph', text: line });
  }
  return { blocks, rawText: text };
}

/** 判断解析结果是否「过于稀疏」(仅有姓名/无任何段落)，用于决定是否触发纯文本兜底 */
export function isResumeDataSparse(data: ResumeData): boolean {
  return (
    data.experience.length === 0 &&
    data.education.length === 0 &&
    data.projects.length === 0 &&
    data.skills.length === 0 &&
    data.certifications.length === 0 &&
    data.customSections.length === 0 &&
    !data.personalInfo.summary
  );
}

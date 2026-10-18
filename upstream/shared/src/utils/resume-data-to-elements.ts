import type {
  ResumeData,
  ResumeElement,
  ResumeSemanticRef,
  TextElement,
  ShapeElement,
  ResumePage,
} from '../types';
import { generateElementId, generatePageId } from './helpers';

// ============================================================
// ResumeData → ResumePage[] 转换器
// 将语义层简历数据映射为画布渲染层元素
// ============================================================

/** 布局常量 (px，基于 A4 @96dpi ≈ 793×1122) */
const LAYOUT = {
  PAGE_WIDTH: 793,
  PAGE_HEIGHT: 1122,
  MARGIN_LEFT: 60,
  MARGIN_RIGHT: 60,
  MARGIN_TOP: 50,
  MARGIN_BOTTOM: 50,
  CONTENT_WIDTH: 675, // PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT ≈ 675
  SECTION_GAP: 24, // 段落间距
  TITLE_GAP: 8, // 标题与内容间距
  LINE_HEIGHT_BODY: 1.6,
  LINE_HEIGHT_TITLE: 1.3,
  FONT_SIZE_NAME: 32,
  FONT_SIZE_CONTACT: 12,
  FONT_SIZE_SECTION_TITLE: 16,
  FONT_SIZE_BODY: 12,
  FONT_SIZE_SUBTITLE: 13,
};

/** 判断是否为宽字符 (CJK / 全角标点) —— 宽度约等于 fontSize */
function isWideChar(ch: string): boolean {
  return /[\u1100-\u115F\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFF60\uFFE0-\uFFE6\u3000-\u303F\u4E00-\u9FFF\u3040-\u30FF]/.test(
    ch
  );
}

/** 估算单行文本宽度 (px)：宽字符≈fontSize, 其余≈0.55×fontSize */
function measureLineWidth(line: string, fontSize: number): number {
  let w = 0;
  for (const ch of line) {
    w += isWideChar(ch) ? fontSize : fontSize * 0.55;
  }
  return w;
}

/** 文本高度估算 (px) —— 按中英文字符实际宽度换算行数, 避免中文高估导致过早分页 */
function estimateTextHeight(content: string, fontSize: number, lineHeight: number, width: number): number {
  const lines = content.split('\n');
  let totalLines = 0;
  for (const line of lines) {
    if (!line.trim()) {
      totalLines += 0.6; // 空行占约 0.6 行
      continue;
    }
    const lineWidth = measureLineWidth(line, fontSize);
    totalLines += Math.max(1, Math.ceil(lineWidth / width));
  }
  return Math.max(totalLines * fontSize * lineHeight, fontSize * lineHeight);
}

/**
 * 将 ResumeData 转换为 ResumePage[]
 * 自动排版，超出页面高度时分页
 */
export function resumeDataToPages(data: ResumeData): ResumePage[] {
  const pages: ResumePage[] = [];
  let currentElements: ResumeElement[] = [];
  let cursorY = LAYOUT.MARGIN_TOP;
  let zIndex = 0;

  function nextZIndex() {
    return ++zIndex;
  }

  /** 检查剩余空间，不够则换页 */
  function ensureSpace(height: number) {
    if (cursorY + height > LAYOUT.PAGE_HEIGHT - LAYOUT.MARGIN_BOTTOM) {
      // 保存当前页
      pages.push({
        id: generatePageId(),
        pageNumber: pages.length + 1,
        elements: currentElements,
      });
      currentElements = [];
      cursorY = LAYOUT.MARGIN_TOP;
      zIndex = 0;
    }
  }

  /** 添加文本元素 */
  function addText(opts: {
    content: string;
    fontSize: number;
    fontWeight?: 'bold' | 'normal';
    color?: string;
    lineHeight?: number;
    letterSpacing?: number;
    name?: string;
    width?: number;
    left?: number;
    semanticRef?: ResumeSemanticRef;
  }): number {
    const width = opts.width ?? LAYOUT.CONTENT_WIDTH;
    const lh = opts.lineHeight ?? LAYOUT.LINE_HEIGHT_BODY;
    const height = estimateTextHeight(opts.content, opts.fontSize, lh, width);
    ensureSpace(height);

    const el: TextElement = {
      id: generateElementId('text'),
      type: 'text',
      name: opts.name ?? '文本',
      semanticRef: opts.semanticRef,
      left: opts.left ?? LAYOUT.MARGIN_LEFT,
      top: cursorY,
      width,
      height,
      rotation: 0,
      opacity: 1,
      visible: true,
      locked: false,
      zIndex: nextZIndex(),
      content: opts.content,
      fontSize: opts.fontSize,
      fontFamily: 'Microsoft YaHei, sans-serif',
      fontWeight: opts.fontWeight ?? 'normal',
      fontStyle: 'normal',
      textAlign: 'left',
      lineHeight: lh,
      letterSpacing: opts.letterSpacing ?? 0,
      color: opts.color ?? '#333333',
      underline: false,
      strikethrough: false,
    };

    currentElements.push(el);
    cursorY += height;
    return height;
  }

  /** 添加分割线 */
  function addDivider() {
    const height = 1;
    ensureSpace(height + 12);
    cursorY += 6;

    const el: ShapeElement = {
      id: generateElementId('shape'),
      type: 'shape',
      name: '分割线',
      semanticRef: { section: 'custom', role: 'decorative' },
      left: LAYOUT.MARGIN_LEFT,
      top: cursorY,
      width: LAYOUT.CONTENT_WIDTH,
      height,
      rotation: 0,
      opacity: 1,
      visible: true,
      locked: false,
      zIndex: nextZIndex(),
      shapeType: 'line',
      fill: 'transparent',
      strokeColor: '#e0e0e0',
      strokeWidth: 1,
      borderRadius: 0,
    };

    currentElements.push(el);
    cursorY += height + 6;
  }

  /** 添加段落标题 */
  function addSectionTitle(title: string, semanticRef?: ResumeSemanticRef) {
    ensureSpace(28 + LAYOUT.TITLE_GAP);
    addText({
      content: title,
      fontSize: LAYOUT.FONT_SIZE_SECTION_TITLE,
      fontWeight: 'bold',
      color: '#1a1a1a',
      lineHeight: LAYOUT.LINE_HEIGHT_TITLE,
      letterSpacing: 1,
      name: `${title}标题`,
      semanticRef,
    });
    cursorY += LAYOUT.TITLE_GAP;
  }

  // ============================================================
  // 开始转换
  // ============================================================

  // 1. 姓名
  if (data.personalInfo.name) {
    addText({
      content: data.personalInfo.name,
      fontSize: LAYOUT.FONT_SIZE_NAME,
      fontWeight: 'bold',
      color: '#1a1a1a',
      lineHeight: 1.2,
      letterSpacing: 2,
      name: '姓名',
      semanticRef: { section: 'personalInfo', field: 'name', role: 'itemTitle' },
    });
    cursorY += 4;
  }

  // 2. 联系信息行
  const contactParts: string[] = [];
  if (data.personalInfo.title) contactParts.push(data.personalInfo.title);
  if (data.personalInfo.phone) contactParts.push(data.personalInfo.phone);
  if (data.personalInfo.email) contactParts.push(data.personalInfo.email);
  if (data.personalInfo.location) contactParts.push(data.personalInfo.location);
  if (data.personalInfo.website) contactParts.push(data.personalInfo.website);
  if (data.personalInfo.github) contactParts.push(data.personalInfo.github);

  if (contactParts.length > 0) {
    addText({
      content: contactParts.join(' | '),
      fontSize: LAYOUT.FONT_SIZE_CONTACT,
      color: '#666666',
      lineHeight: 1.4,
      name: '联系信息',
      semanticRef: { section: 'personalInfo', field: 'contact', role: 'metadata' },
    });
    cursorY += 4;
  }

  // ============================================================
  // 段落渲染器 (每个已知类型一个)
  // ============================================================
  const renderSummary = () => {
    if (!data.personalInfo.summary) return;
    addSectionTitle('个人简介', { section: 'summary', role: 'sectionTitle' });
    addText({
      content: data.personalInfo.summary,
      fontSize: LAYOUT.FONT_SIZE_BODY,
      color: '#4a4a4a',
      name: '个人简介内容',
      semanticRef: { section: 'summary', field: 'personalInfo.summary', role: 'itemBody' },
    });
    cursorY += LAYOUT.SECTION_GAP;
  };

  const renderExperience = () => {
    if (data.experience.length === 0) return;
    addSectionTitle('工作经历', { section: 'experience', role: 'sectionTitle' });
    for (const exp of data.experience) {
      const titleParts = [exp.company, exp.position].filter(Boolean);
      if (exp.startDate) {
        const dateStr = exp.endDate ? `${exp.startDate} - ${exp.endDate}` : `${exp.startDate} - 至今`;
        titleParts.push(dateStr);
      }
      addText({
        content: titleParts.join(' | '),
        fontSize: LAYOUT.FONT_SIZE_SUBTITLE,
        fontWeight: 'bold',
        color: '#2a2a2a',
        lineHeight: 1.4,
        name: `${exp.company || '经历'}`,
        semanticRef: { section: 'experience', itemId: exp.id, field: 'title', role: 'itemTitle' },
      });
      cursorY += 2;
      if (exp.descriptions.length > 0) {
        const descContent = exp.descriptions.map((d) => `• ${d}`).join('\n');
        addText({
          content: descContent,
          fontSize: LAYOUT.FONT_SIZE_BODY,
          color: '#333333',
          name: `${exp.company || '经历'}描述`,
          semanticRef: { section: 'experience', itemId: exp.id, field: 'descriptions', role: 'itemBody' },
        });
      }
      cursorY += 12;
    }
    cursorY += LAYOUT.SECTION_GAP - 12;
  };

  const renderProjects = () => {
    if (data.projects.length === 0) return;
    addSectionTitle('项目经历', { section: 'projects', role: 'sectionTitle' });
    for (const proj of data.projects) {
      const titleParts = [proj.name];
      if (proj.role) titleParts.push(proj.role);
      if (proj.techStack && proj.techStack.length > 0) titleParts.push(proj.techStack.join(', '));
      addText({
        content: titleParts.join(' | '),
        fontSize: LAYOUT.FONT_SIZE_SUBTITLE,
        fontWeight: 'bold',
        color: '#2a2a2a',
        lineHeight: 1.4,
        name: `${proj.name}`,
        semanticRef: { section: 'projects', itemId: proj.id, field: 'title', role: 'itemTitle' },
      });
      cursorY += 2;
      if (proj.description) {
        const descLines = proj.description.split('\n').map((line) => {
          const trimmed = line.trim();
          return trimmed.startsWith('•') || trimmed.startsWith('-') ? trimmed : `• ${trimmed}`;
        });
        addText({
          content: descLines.join('\n'),
          fontSize: LAYOUT.FONT_SIZE_BODY,
          color: '#333333',
          name: `${proj.name}描述`,
          semanticRef: { section: 'projects', itemId: proj.id, field: 'description', role: 'itemBody' },
        });
      }
      cursorY += 12;
    }
    cursorY += LAYOUT.SECTION_GAP - 12;
  };

  const renderEducation = () => {
    if (data.education.length === 0) return;
    addSectionTitle('教育背景', { section: 'education', role: 'sectionTitle' });
    for (const edu of data.education) {
      const titleParts = [edu.school];
      if (edu.major) titleParts.push(edu.major);
      if (edu.degree) titleParts.push(edu.degree);
      if (edu.startDate) {
        const dateStr = edu.endDate ? `${edu.startDate} - ${edu.endDate}` : edu.startDate;
        titleParts.push(dateStr);
      }
      addText({
        content: titleParts.join(' | '),
        fontSize: LAYOUT.FONT_SIZE_SUBTITLE,
        fontWeight: 'bold',
        color: '#2a2a2a',
        lineHeight: 1.4,
        name: `${edu.school || '教育'}`,
        semanticRef: { section: 'education', itemId: edu.id, field: 'title', role: 'itemTitle' },
      });
      cursorY += 2;
      if (edu.achievements && edu.achievements.length > 0) {
        const achContent = edu.achievements.map((a) => `• ${a}`).join('\n');
        addText({
          content: achContent,
          fontSize: LAYOUT.FONT_SIZE_BODY,
          color: '#333333',
          name: `${edu.school || '教育'}成就`,
          semanticRef: { section: 'education', itemId: edu.id, field: 'achievements', role: 'itemBody' },
        });
      }
      cursorY += 12;
    }
    cursorY += LAYOUT.SECTION_GAP - 12;
  };

  const renderSkills = () => {
    if (data.skills.length === 0) return;
    addSectionTitle('专业技能', { section: 'skills', role: 'sectionTitle' });
    const skillLines: string[] = [];
    for (const group of data.skills) {
      const skillNames = group.items.map((s) => s.name).join('、');
      skillLines.push(`${group.category}：${skillNames}`);
    }
    addText({
      content: skillLines.join('\n'),
      fontSize: LAYOUT.FONT_SIZE_BODY,
      color: '#333333',
      name: '技能内容',
      semanticRef: { section: 'skills', field: 'skills', role: 'itemBody' },
    });
    cursorY += LAYOUT.SECTION_GAP;
  };

  const renderCertifications = () => {
    if (data.certifications.length === 0) return;
    addSectionTitle('证书与资质', { section: 'certifications', role: 'sectionTitle' });
    const certLines = data.certifications.map((c) => {
      const parts = [c.name];
      if (c.issuer) parts.push(c.issuer);
      if (c.date) parts.push(c.date);
      return `• ${parts.join(' - ')}`;
    });
    addText({
      content: certLines.join('\n'),
      fontSize: LAYOUT.FONT_SIZE_BODY,
      color: '#333333',
      name: '证书内容',
      semanticRef: { section: 'certifications', field: 'certifications', role: 'itemBody' },
    });
    cursorY += LAYOUT.SECTION_GAP;
  };

  const renderCustom = (section: ResumeData['customSections'][number]) => {
    addSectionTitle(section.title, { section: 'custom', itemId: section.id, role: 'sectionTitle' });
    const itemTexts: string[] = [];
    for (const item of section.items) {
      if (item.title) itemTexts.push(item.title);
      if (item.description) itemTexts.push(item.description);
      if (item.details) itemTexts.push(...item.details.map((d) => `• ${d}`));
    }
    if (itemTexts.length > 0) {
      addText({
        content: itemTexts.join('\n'),
        fontSize: LAYOUT.FONT_SIZE_BODY,
        color: '#333333',
        name: `${section.title}内容`,
        semanticRef: { section: 'custom', itemId: section.id, field: 'items', role: 'itemBody' },
      });
    }
    cursorY += LAYOUT.SECTION_GAP;
  };

  // ============================================================
  // 按 sectionOrder 驱动渲染 (保留导入原文顺序)；缺省时回退规范顺序
  // ============================================================
  addDivider();

  const rendered = new Set<string>();
  const runKnown = (kind: string) => {
    if (rendered.has(kind)) return;
    rendered.add(kind);
    switch (kind) {
      case 'summary': renderSummary(); break;
      case 'experience': renderExperience(); break;
      case 'projects': renderProjects(); break;
      case 'education': renderEducation(); break;
      case 'skills': renderSkills(); break;
      case 'certifications': renderCertifications(); break;
    }
  };

  const CANONICAL = ['summary', 'experience', 'projects', 'education', 'skills', 'certifications'];
  const order =
    data.sectionOrder && data.sectionOrder.length > 0
      ? data.sectionOrder
      : [...CANONICAL, ...data.customSections.map((s) => `custom:${s.id}`)];

  for (const key of order) {
    if (key.startsWith('custom:')) {
      const id = key.slice(7);
      const section = data.customSections.find((s) => s.id === id);
      if (section && !rendered.has(key)) {
        rendered.add(key);
        renderCustom(section);
      }
    } else {
      runKnown(key);
    }
  }

  // 兵底：渲染 order 中遗漏的已知段落与自定义段落，确保零丢失
  for (const k of CANONICAL) runKnown(k);
  for (const section of data.customSections) {
    const key = `custom:${section.id}`;
    if (!rendered.has(key)) {
      rendered.add(key);
      renderCustom(section);
    }
  }

  // 保存最后一页
  if (currentElements.length > 0) {
    pages.push({
      id: generatePageId(),
      pageNumber: pages.length + 1,
      elements: currentElements,
    });
  }

  // 确保至少有一页
  if (pages.length === 0) {
    pages.push({
      id: generatePageId(),
      pageNumber: 1,
      elements: [],
    });
  }

  return pages;
}

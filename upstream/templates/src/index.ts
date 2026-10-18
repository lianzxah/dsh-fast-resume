import type {
  ResumeTemplate,
  ResumePage,
  ResumeElement,
  TextElement,
  ShapeElement,
  TemplateTheme,
  TemplateCategory,
  PageConfig,
} from '@resume-editor/shared';
import { DEFAULT_PAGE_CONFIG, generatePageId, generateElementId } from '@resume-editor/shared';

// ============================================================
// 常量 & 工厂 helper（高复用、低重复）
// ============================================================

/** A4 @96dpi 像素尺寸 */
const PAGE_W = 794;
const PAGE_H = 1123;
const FONT_SANS = 'Microsoft YaHei, sans-serif';
const FONT_SERIF = 'SimSun, serif';

type TextInput = Partial<TextElement> & Pick<TextElement, 'content' | 'left' | 'top' | 'width'>;
type ShapeInput = Partial<ShapeElement> & Pick<ShapeElement, 'shapeType' | 'left' | 'top' | 'width' | 'height'>;

/** 文本元素工厂：先铺默认值，再用入参覆盖，最后固定 id/type 保证判别联合正确 */
function T(input: TextInput): TextElement {
  return {
    name: '文本',
    height: 24,
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 0,
    fontSize: 12,
    fontFamily: FONT_SANS,
    fontWeight: 'normal',
    fontStyle: 'normal',
    textAlign: 'left',
    lineHeight: 1.5,
    letterSpacing: 0,
    color: '#333333',
    underline: false,
    strikethrough: false,
    ...input,
    id: generateElementId('text'),
    type: 'text',
  };
}

/** 形状元素工厂 */
function S(input: ShapeInput): ShapeElement {
  return {
    name: '形状',
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 0,
    fill: '#000000',
    strokeColor: 'transparent',
    strokeWidth: 0,
    borderRadius: 0,
    ...input,
    id: generateElementId('shape'),
    type: 'shape',
  };
}

/** 组装页面：按数组顺序重排 zIndex，避免层级冲突 */
function buildPage(pageNumber: number, elements: ResumeElement[]): ResumePage {
  return {
    id: generatePageId(),
    pageNumber,
    elements: elements.map((el, i) => ({ ...el, zIndex: i } as ResumeElement)),
  };
}

/** 章节小标题（带主题色左侧竖条） */
function sectionTitle(text: string, top: number, opts: { left?: number; width?: number; color: string; accent: string }): ResumeElement[] {
  const left = opts.left ?? 60;
  return [
    S({ name: '标题装饰条', shapeType: 'rectangle', left: left - 12, top: top + 2, width: 4, height: 18, fill: opts.accent, borderRadius: 2 }),
    T({ name: `${text}标题`, content: text, left, top, width: opts.width ?? 220, height: 26, fontSize: 15, fontWeight: 'bold', letterSpacing: 1, color: opts.color }),
  ];
}

// ============================================================
// 1. 经典简约（单栏，黑白）
// ============================================================
const classicTheme: TemplateTheme = {
  primaryColor: '#1a1a1a',
  secondaryColor: '#4a4a4a',
  accentColor: '#666666',
  textColor: '#333333',
  backgroundColor: '#ffffff',
};

function createClassicTemplate(): ResumeTemplate {
  const M = 60;
  const CW = PAGE_W - M * 2;
  const els: ResumeElement[] = [
    T({ name: '姓名', content: '张三', left: M, top: 50, width: 400, height: 45, fontSize: 32, fontWeight: 'bold', letterSpacing: 2, color: '#1a1a1a' }),
    T({ name: '联系信息', content: '138-0000-0000  |  zhangsan@email.com  |  北京市朝阳区', left: M, top: 100, width: CW, height: 22, fontSize: 12, color: '#666666' }),
    S({ name: '分割线', shapeType: 'line', left: M, top: 134, width: CW, height: 1, strokeColor: '#e0e0e0', strokeWidth: 1 }),

    ...sectionTitle('个人简介', 155, { left: M, color: '#1a1a1a', accent: '#1a1a1a' }),
    T({ name: '简介内容', content: '5 年前端开发经验，专注于大型 Web 应用架构与性能优化，具备完整的从 0 到 1 产品交付能力，善于团队协作与技术攻坚。', left: M, top: 186, width: CW, height: 44, lineHeight: 1.6 }),

    ...sectionTitle('工作经历', 245, { left: M, color: '#1a1a1a', accent: '#1a1a1a' }),
    T({ name: '公司1', content: 'XX科技有限公司  |  高级前端工程师', left: M, top: 278, width: CW, height: 20, fontSize: 13, fontWeight: 'bold', color: '#1a1a1a' }),
    T({ name: '时间1', content: '2022.03 - 至今', left: M, top: 278, width: CW, height: 20, fontSize: 12, textAlign: 'right', color: '#999999' }),
    T({ name: '职责1', content: '• 负责核心产品前端架构设计与开发\n• 主导从 Vue2 到 React 的技术迁移\n• 页面加载性能优化，首屏速度提升 60%', left: M, top: 302, width: CW, height: 70, lineHeight: 1.7 }),

    ...sectionTitle('教育背景', 390, { left: M, color: '#1a1a1a', accent: '#1a1a1a' }),
    T({ name: '学校', content: 'XX大学  |  计算机科学与技术  |  本科', left: M, top: 423, width: CW, height: 20, fontSize: 13, fontWeight: 'bold', color: '#1a1a1a' }),
    T({ name: '学校时间', content: '2016.09 - 2020.06', left: M, top: 423, width: CW, height: 20, fontSize: 12, textAlign: 'right', color: '#999999' }),
    T({ name: '学业', content: 'GPA 3.8/4.0  |  优秀毕业生  |  校奖学金', left: M, top: 447, width: CW, height: 20 }),

    ...sectionTitle('专业技能', 490, { left: M, color: '#1a1a1a', accent: '#1a1a1a' }),
    T({ name: '技能', content: 'React · TypeScript · Next.js · Node.js · Webpack/Vite · 性能优化 · 架构设计', left: M, top: 523, width: CW, height: 40, lineHeight: 1.8 }),
  ];

  return {
    id: 'template-classic',
    name: '经典简约',
    description: '简约大方的黑白风格，适合金融、法律等传统行业',
    category: 'classic',
    thumbnail: '/templates/classic-thumb.png',
    theme: classicTheme,
    pageConfig: DEFAULT_PAGE_CONFIG,
    pages: [buildPage(1, els)],
  };
}

// ============================================================
// 2. 现代商务（单栏，蓝色页眉）
// ============================================================
const modernTheme: TemplateTheme = {
  primaryColor: '#1e40af',
  secondaryColor: '#3b82f6',
  accentColor: '#60a5fa',
  textColor: '#1e293b',
  backgroundColor: '#ffffff',
};

function createModernTemplate(): ResumeTemplate {
  const M = 60;
  const CW = PAGE_W - M * 2;
  const els: ResumeElement[] = [
    S({ name: '顶部背景', shapeType: 'rectangle', left: 0, top: 0, width: PAGE_W, height: 130, fill: '#1e40af' }),
    T({ name: '姓名', content: '张三', left: M, top: 32, width: 400, height: 45, fontSize: 30, fontWeight: 'bold', letterSpacing: 2, color: '#ffffff' }),
    T({ name: '目标职位', content: '高级前端工程师 · 5 年经验', left: M, top: 80, width: 400, height: 24, fontSize: 14, color: '#bfdbfe' }),
    T({ name: '联系方式', content: '138-0000-0000   ·   zhangsan@email.com   ·   北京市', left: M, top: 150, width: CW, height: 22, fontSize: 11, color: '#64748b' }),

    ...sectionTitle('专业技能', 195, { left: M, color: '#1e40af', accent: '#3b82f6' }),
    T({ name: '技能内容', content: '• React / TypeScript / Next.js — 精通前端框架与工程化\n• Node.js / NestJS — 全栈开发能力\n• 性能优化 / 架构设计 / 技术方案评审', left: M, top: 228, width: CW, height: 72, lineHeight: 1.8, color: '#334155' }),

    ...sectionTitle('工作经历', 318, { left: M, color: '#1e40af', accent: '#3b82f6' }),
    T({ name: '公司1', content: 'XX科技有限公司  ·  高级前端工程师', left: M, top: 351, width: CW, height: 20, fontSize: 13, fontWeight: 'bold', color: '#1e293b' }),
    T({ name: '时间1', content: '2022.03 - 至今', left: M, top: 351, width: CW, height: 20, fontSize: 12, textAlign: 'right', color: '#94a3b8' }),
    T({ name: '职责1', content: '• 主导核心业务前端架构升级，支撑千万级日活\n• 建设组件库与工程规范，团队研发效率提升 40%', left: M, top: 375, width: CW, height: 48, lineHeight: 1.7, color: '#334155' }),

    ...sectionTitle('教育背景', 440, { left: M, color: '#1e40af', accent: '#3b82f6' }),
    T({ name: '学校', content: 'XX大学  ·  计算机科学与技术  ·  本科', left: M, top: 473, width: CW, height: 20, fontSize: 13, fontWeight: 'bold', color: '#1e293b' }),
    T({ name: '学校时间', content: '2016.09 - 2020.06', left: M, top: 473, width: CW, height: 20, fontSize: 12, textAlign: 'right', color: '#94a3b8' }),
  ];

  return {
    id: 'template-modern',
    name: '现代商务',
    description: '蓝色专业风格，适合 IT、商务等现代行业',
    category: 'modern',
    thumbnail: '/templates/modern-thumb.png',
    theme: modernTheme,
    pageConfig: DEFAULT_PAGE_CONFIG,
    pages: [buildPage(1, els)],
  };
}

// ============================================================
// 3. 创意设计（双栏，紫色侧边栏）
// ============================================================
const creativeTheme: TemplateTheme = {
  primaryColor: '#7c3aed',
  secondaryColor: '#a855f7',
  accentColor: '#c084fc',
  textColor: '#1e1b4b',
  backgroundColor: '#ffffff',
};

function createCreativeTemplate(): ResumeTemplate {
  const SB = 250; // 侧边栏宽度
  const MC = SB + 40; // 主栏左边距
  const CW = PAGE_W - MC - 40;
  const els: ResumeElement[] = [
    // 侧边栏背景
    S({ name: '侧边栏', shapeType: 'rectangle', left: 0, top: 0, width: SB, height: PAGE_H, fill: '#7c3aed' }),
    // 头像占位圆
    S({ name: '头像', shapeType: 'circle', left: SB / 2 - 55, top: 50, width: 110, height: 110, fill: '#ffffff', opacity: 0.15 }),
    T({ name: '姓名', content: '张三', left: 20, top: 180, width: SB - 40, height: 36, fontSize: 26, fontWeight: 'bold', textAlign: 'center', color: '#ffffff' }),
    T({ name: '职位', content: 'UI / UX 设计师', left: 20, top: 220, width: SB - 40, height: 22, fontSize: 13, textAlign: 'center', color: '#e9d5ff' }),

    T({ name: '联系标题', content: '联系方式', left: 24, top: 275, width: SB - 48, height: 22, fontSize: 13, fontWeight: 'bold', color: '#ffffff', letterSpacing: 1 }),
    T({ name: '联系内容', content: '138-0000-0000\nzhangsan@email.com\n北京市朝阳区', left: 24, top: 302, width: SB - 48, height: 60, fontSize: 11, lineHeight: 1.8, color: '#e9d5ff' }),

    T({ name: '技能标题', content: '专业技能', left: 24, top: 380, width: SB - 48, height: 22, fontSize: 13, fontWeight: 'bold', color: '#ffffff', letterSpacing: 1 }),
    T({ name: '技能内容', content: 'Figma / Sketch\nPhotoshop / AI\n设计系统 / 交互原型\n用户研究', left: 24, top: 407, width: SB - 48, height: 80, fontSize: 11, lineHeight: 1.9, color: '#e9d5ff' }),

    // 主栏
    ...sectionTitle('个人简介', 55, { left: MC, width: CW, color: '#7c3aed', accent: '#a855f7' }),
    T({ name: '简介', content: '6 年视觉与交互设计经验，擅长从 0 到 1 构建产品设计体系，注重用户体验与品牌一致性。', left: MC, top: 86, width: CW, height: 44, lineHeight: 1.7, color: '#1e1b4b' }),

    ...sectionTitle('工作经历', 150, { left: MC, width: CW, color: '#7c3aed', accent: '#a855f7' }),
    T({ name: '公司1', content: 'XX 设计工作室  ·  资深设计师', left: MC, top: 183, width: CW, height: 20, fontSize: 13, fontWeight: 'bold', color: '#1e1b4b' }),
    T({ name: '时间1', content: '2021 - 至今', left: MC, top: 205, width: CW, height: 18, fontSize: 11, color: '#a855f7' }),
    T({ name: '职责1', content: '• 主导品牌视觉升级与设计规范建设\n• 负责核心 App 交互设计与可用性测试', left: MC, top: 228, width: CW, height: 48, lineHeight: 1.7, color: '#334155' }),

    ...sectionTitle('教育背景', 295, { left: MC, width: CW, color: '#7c3aed', accent: '#a855f7' }),
    T({ name: '学校', content: 'XX 美术学院  ·  视觉传达设计  ·  本科', left: MC, top: 328, width: CW, height: 20, fontSize: 13, fontWeight: 'bold', color: '#1e1b4b' }),
    T({ name: '学校时间', content: '2015 - 2019', left: MC, top: 350, width: CW, height: 18, fontSize: 11, color: '#a855f7' }),
  ];

  return {
    id: 'template-creative',
    name: '创意设计',
    description: '紫色双栏创意风格，适合设计师、营销等创意行业',
    category: 'creative',
    thumbnail: '/templates/creative-thumb.png',
    theme: creativeTheme,
    pageConfig: DEFAULT_PAGE_CONFIG,
    pages: [buildPage(1, els)],
  };
}

// ============================================================
// 4. 学术科研（单栏，衬线，绿色）
// ============================================================
const academicTheme: TemplateTheme = {
  primaryColor: '#065f46',
  secondaryColor: '#059669',
  accentColor: '#34d399',
  textColor: '#1f2937',
  backgroundColor: '#ffffff',
};

function createAcademicTemplate(): ResumeTemplate {
  const M = 64;
  const CW = PAGE_W - M * 2;
  const els: ResumeElement[] = [
    T({ name: '姓名', content: '张 三', left: M, top: 54, width: CW, height: 40, fontSize: 28, fontWeight: 'bold', textAlign: 'center', fontFamily: FONT_SERIF, letterSpacing: 4, color: '#065f46' }),
    T({ name: '联系信息', content: '博士研究生 · 计算机科学 · zhangsan@univ.edu · 138-0000-0000', left: M, top: 98, width: CW, height: 22, fontSize: 11, textAlign: 'center', fontFamily: FONT_SERIF, color: '#4b5563' }),
    S({ name: '双线1', shapeType: 'line', left: M, top: 130, width: CW, height: 1, strokeColor: '#065f46', strokeWidth: 2 }),

    ...sectionTitle('研究方向', 152, { left: M, color: '#065f46', accent: '#059669' }),
    T({ name: '研究方向内容', content: '机器学习、自然语言处理、大规模分布式系统。', left: M, top: 183, width: CW, height: 24, fontFamily: FONT_SERIF, lineHeight: 1.6 }),

    ...sectionTitle('教育背景', 220, { left: M, color: '#065f46', accent: '#059669' }),
    T({ name: '学历1', content: 'XX大学  ·  计算机科学与技术  ·  博士', left: M, top: 253, width: CW, height: 20, fontSize: 13, fontWeight: 'bold', fontFamily: FONT_SERIF, color: '#1f2937' }),
    T({ name: '学历1时间', content: '2020 - 至今', left: M, top: 253, width: CW, height: 20, fontSize: 12, textAlign: 'right', color: '#9ca3af' }),

    ...sectionTitle('论文发表', 300, { left: M, color: '#065f46', accent: '#059669' }),
    T({ name: '论文内容', content: '1. Zhang S. et al. "A Novel Approach to NLP." ACL 2023.\n2. Zhang S. et al. "Distributed Training at Scale." NeurIPS 2022.', left: M, top: 333, width: CW, height: 56, fontFamily: FONT_SERIF, lineHeight: 1.8 }),

    ...sectionTitle('科研项目', 400, { left: M, color: '#065f46', accent: '#059669' }),
    T({ name: '项目内容', content: '• 国家自然科学基金青年项目（主持）\n• 校企联合大模型训练平台（核心成员）', left: M, top: 433, width: CW, height: 48, fontFamily: FONT_SERIF, lineHeight: 1.7 }),
  ];

  return {
    id: 'template-academic',
    name: '学术科研',
    description: '严谨衬线学术风格，适合学术、科研等领域',
    category: 'academic',
    thumbnail: '/templates/academic-thumb.png',
    theme: academicTheme,
    pageConfig: DEFAULT_PAGE_CONFIG,
    pages: [buildPage(1, els)],
  };
}

// ============================================================
// 5. 黑金质感（双栏，深色侧边栏）
// ============================================================
const darkTheme: TemplateTheme = {
  primaryColor: '#111827',
  secondaryColor: '#d4af37',
  accentColor: '#d4af37',
  textColor: '#1f2937',
  backgroundColor: '#ffffff',
};

function createDarkTemplate(): ResumeTemplate {
  const SB = 270;
  const MC = SB + 40;
  const CW = PAGE_W - MC - 40;
  const gold = '#d4af37';
  const els: ResumeElement[] = [
    S({ name: '侧边栏', shapeType: 'rectangle', left: 0, top: 0, width: SB, height: PAGE_H, fill: '#111827' }),
    S({ name: '金色分隔', shapeType: 'rectangle', left: 0, top: 210, width: SB, height: 2, fill: gold }),
    T({ name: '姓名', content: '张三', left: 24, top: 120, width: SB - 48, height: 40, fontSize: 30, fontWeight: 'bold', color: '#ffffff', letterSpacing: 2 }),
    T({ name: '职位', content: '高级前端专家', left: 24, top: 165, width: SB - 48, height: 24, fontSize: 14, color: gold, letterSpacing: 1 }),

    T({ name: '联系标题', content: 'CONTACT', left: 24, top: 240, width: SB - 48, height: 20, fontSize: 12, fontWeight: 'bold', color: gold, letterSpacing: 2 }),
    T({ name: '联系内容', content: '138-0000-0000\nzhangsan@email.com\n北京市朝阳区', left: 24, top: 266, width: SB - 48, height: 60, fontSize: 11, lineHeight: 1.9, color: '#d1d5db' }),

    T({ name: '技能标题', content: 'SKILLS', left: 24, top: 350, width: SB - 48, height: 20, fontSize: 12, fontWeight: 'bold', color: gold, letterSpacing: 2 }),
    T({ name: '技能内容', content: 'React · TypeScript\nNode.js · 架构设计\n性能优化 · 团队管理', left: 24, top: 376, width: SB - 48, height: 70, fontSize: 11, lineHeight: 1.9, color: '#d1d5db' }),

    // 主栏
    ...sectionTitle('个人简介', 55, { left: MC, width: CW, color: '#111827', accent: gold }),
    T({ name: '简介', content: '8 年前端与全栈开发经验，主导过多个千万级用户产品的架构设计与团队建设，擅长复杂系统的性能优化与工程化落地。', left: MC, top: 86, width: CW, height: 48, lineHeight: 1.7 }),

    ...sectionTitle('工作经历', 150, { left: MC, width: CW, color: '#111827', accent: gold }),
    T({ name: '公司1', content: 'XX 集团  ·  前端技术专家', left: MC, top: 183, width: CW, height: 20, fontSize: 13, fontWeight: 'bold', color: '#111827' }),
    T({ name: '时间1', content: '2020 - 至今', left: MC, top: 183, width: CW, height: 20, fontSize: 11, textAlign: 'right', color: '#9ca3af' }),
    T({ name: '职责1', content: '• 负责集团级前端中台架构与技术标准制定\n• 带领 15 人前端团队完成多条业务线交付', left: MC, top: 207, width: CW, height: 48, lineHeight: 1.7, color: '#374151' }),

    ...sectionTitle('教育背景', 275, { left: MC, width: CW, color: '#111827', accent: gold }),
    T({ name: '学校', content: 'XX大学  ·  软件工程  ·  硕士', left: MC, top: 308, width: CW, height: 20, fontSize: 13, fontWeight: 'bold', color: '#111827' }),
    T({ name: '学校时间', content: '2014 - 2017', left: MC, top: 308, width: CW, height: 20, fontSize: 11, textAlign: 'right', color: '#9ca3af' }),
  ];

  return {
    id: 'template-dark',
    name: '黑金质感',
    description: '深色双栏 + 金色点缀，彰显资深与高端质感',
    category: 'modern',
    thumbnail: '/templates/dark-thumb.png',
    theme: darkTheme,
    pageConfig: DEFAULT_PAGE_CONFIG,
    pages: [buildPage(1, els)],
  };
}

// ============================================================
// 6. 极简留白（单栏，大量留白）
// ============================================================
const minimalTheme: TemplateTheme = {
  primaryColor: '#111111',
  secondaryColor: '#555555',
  accentColor: '#111111',
  textColor: '#333333',
  backgroundColor: '#ffffff',
};

function createMinimalTemplate(): ResumeTemplate {
  const M = 90;
  const CW = PAGE_W - M * 2;
  const els: ResumeElement[] = [
    T({ name: '姓名', content: '张三', left: M, top: 90, width: CW, height: 48, fontSize: 40, fontWeight: '300', letterSpacing: 4, color: '#111111' }),
    T({ name: '职位', content: '产品设计 · 前端开发', left: M, top: 148, width: CW, height: 24, fontSize: 13, letterSpacing: 2, color: '#888888' }),
    T({ name: '联系信息', content: 'zhangsan@email.com   /   138-0000-0000', left: M, top: 176, width: CW, height: 20, fontSize: 11, letterSpacing: 1, color: '#888888' }),
    S({ name: '细线', shapeType: 'line', left: M, top: 215, width: 40, height: 1, strokeColor: '#111111', strokeWidth: 2 }),

    T({ name: '经历标签', content: 'EXPERIENCE', left: M, top: 250, width: CW, height: 20, fontSize: 11, fontWeight: 'bold', letterSpacing: 3, color: '#111111' }),
    T({ name: '公司1', content: 'XX 公司 · 高级工程师', left: M, top: 278, width: CW, height: 20, fontSize: 13, color: '#333333' }),
    T({ name: '时间1', content: '2021 — 至今', left: M, top: 278, width: CW, height: 20, fontSize: 11, textAlign: 'right', color: '#aaaaaa' }),
    T({ name: '职责1', content: '负责核心产品设计与前端开发，推动设计与工程协作流程标准化。', left: M, top: 304, width: CW, height: 40, lineHeight: 1.7, color: '#666666' }),

    T({ name: '教育标签', content: 'EDUCATION', left: M, top: 375, width: CW, height: 20, fontSize: 11, fontWeight: 'bold', letterSpacing: 3, color: '#111111' }),
    T({ name: '学校', content: 'XX大学 · 设计与计算机', left: M, top: 403, width: CW, height: 20, fontSize: 13, color: '#333333' }),
    T({ name: '学校时间', content: '2017 — 2021', left: M, top: 403, width: CW, height: 20, fontSize: 11, textAlign: 'right', color: '#aaaaaa' }),

    T({ name: '技能标签', content: 'SKILLS', left: M, top: 460, width: CW, height: 20, fontSize: 11, fontWeight: 'bold', letterSpacing: 3, color: '#111111' }),
    T({ name: '技能', content: 'Figma · React · TypeScript · 设计系统 · 用户体验', left: M, top: 488, width: CW, height: 24, fontSize: 12, letterSpacing: 1, color: '#666666' }),
  ];

  return {
    id: 'template-minimal',
    name: '极简留白',
    description: '大量留白的极简风格，突出内容本身，适合设计与产品岗位',
    category: 'creative',
    thumbnail: '/templates/minimal-thumb.png',
    theme: minimalTheme,
    pageConfig: DEFAULT_PAGE_CONFIG,
    pages: [buildPage(1, els)],
  };
}

// ============================================================
// 导出所有模版
// ============================================================

export const templates: ResumeTemplate[] = [
  createClassicTemplate(),
  createModernTemplate(),
  createCreativeTemplate(),
  createAcademicTemplate(),
  createDarkTemplate(),
  createMinimalTemplate(),
];

export function getTemplateById(id: string): ResumeTemplate | undefined {
  return templates.find((t) => t.id === id);
}

export function getTemplatesByCategory(category: TemplateCategory): ResumeTemplate[] {
  return templates.filter((t) => t.category === category);
}

/** 供 UI 使用的轻量模版摘要 */
export interface TemplateSummary {
  id: string;
  name: string;
  description: string;
  category: TemplateCategory;
  theme: TemplateTheme;
}

export function getTemplateSummaries(): TemplateSummary[] {
  return templates.map(({ id, name, description, category, theme }) => ({ id, name, description, category, theme }));
}

export type { ResumeTemplate, PageConfig };

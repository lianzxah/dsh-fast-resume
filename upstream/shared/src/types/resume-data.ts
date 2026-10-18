// ============================================================
// 简历语义数据模型 (ResumeData)
// 用于结构化存储简历信息，与画布渲染层解耦
// ============================================================

/** 个人信息 */
export interface PersonalInfo {
  name: string;
  title?: string;
  email?: string;
  phone?: string;
  location?: string;
  website?: string;
  linkedin?: string;
  github?: string;
  avatar?: string;
  summary?: string;
}

/** 工作经历条目 */
export interface ExperienceItem {
  id: string;
  company: string;
  position: string;
  startDate: string;
  endDate?: string;
  location?: string;
  descriptions: string[];
  highlights?: string[];
}

/** 教育背景条目 */
export interface EducationItem {
  id: string;
  school: string;
  degree: string;
  major: string;
  startDate: string;
  endDate?: string;
  gpa?: string;
  achievements?: string[];
}

/** 技能项 */
export interface SkillItem {
  name: string;
  level?: 'beginner' | 'intermediate' | 'advanced' | 'expert';
}

/** 技能分组 */
export interface SkillGroup {
  category: string;
  items: SkillItem[];
}

/** 项目经历条目 */
export interface ProjectItem {
  id: string;
  name: string;
  role?: string;
  startDate?: string;
  endDate?: string;
  description: string;
  techStack?: string[];
  link?: string;
}

/** 证书/资质条目 */
export interface CertificationItem {
  name: string;
  issuer: string;
  date?: string;
  link?: string;
}

/** 自定义段落子项 */
export interface CustomSectionEntry {
  title?: string;
  subtitle?: string;
  date?: string;
  description?: string;
  details?: string[];
}

/** 自定义段落 */
export interface CustomSection {
  id: string;
  title: string;
  items: CustomSectionEntry[];
}

/** 简历结构化数据 - 语义层 */
export interface ResumeData {
  personalInfo: PersonalInfo;
  experience: ExperienceItem[];
  education: EducationItem[];
  skills: SkillGroup[];
  projects: ProjectItem[];
  certifications: CertificationItem[];
  customSections: CustomSection[];
  /**
   * 段落渲染顺序 (保留导入原文顺序)。
   * 每项为已知类型键，或自定义段落的 `custom:<id>`。
   * 缺省时排版层回退到规范顺序。
   */
  sectionOrder?: string[];
}

/** 已知段落类型 */
export type SectionKind = 'summary' | 'experience' | 'projects' | 'education' | 'skills' | 'certifications';

/** 构造自定义段落的顺序标记 */
export function customSectionToken(id: string): string {
  return `custom:${id}`;
}

// ============================================================
// 默认空 ResumeData
// ============================================================

export function createEmptyResumeData(): ResumeData {
  return {
    personalInfo: { name: '' },
    experience: [],
    education: [],
    skills: [],
    projects: [],
    certifications: [],
    customSections: [],
  };
}

// ============================================================
// 段落类型识别关键词映射 (用于文件导入解析)
// ============================================================

export const SECTION_KEYWORDS: Record<string, string[]> = {
  experience: ['工作经历', '工作经验', '职业经历', '工作履历', '职业履历', 'Work Experience', 'Experience', 'Employment', 'Professional Experience'],
  education: ['教育背景', '教育经历', '教育', '学历', 'Education', 'Academic Background'],
  skills: ['专业技能', '技术栈', '技术能力', '技能特长', '技能', 'Skills', 'Technical Skills', 'Core Competencies'],
  projects: ['项目经历', '项目经验', '项目', 'Projects', 'Project Experience'],
  certifications: ['证书', '资质', '认证', '荣誉奖项', '荣誉', '获奖', 'Certifications', 'Certificates', 'Licenses', 'Awards'],
  summary: ['个人简介', '自我评价', '自我介绍', '个人总结', '简介', '求职意向', '职业目标', 'Summary', 'Objective', 'About', 'Profile'],
};

/** 联系方式段落标题关键词 (命中则其内容并入 personalInfo，不单独成段) */
export const CONTACT_HEADING_KEYWORDS: string[] = ['联系方式', '联系电话', '联系信息', '联系', 'Contact', 'Contact Info'];

/** 联系信息正则 */
export const CONTACT_PATTERNS = {
  email: /[\w.-]+@[\w.-]+\.\w+/,
  phone: /(?:\+?86[-\s]?)?1[3-9]\d[-\s]?\d{4}[-\s]?\d{4}|(?:\d{3,4}[-\s]?\d{7,8})/,
  url: /https?:\/\/[^\s,，]+/,
};

/** 日期格式正则 */
export const DATE_PATTERNS = [
  // 2022.03 - 至今 / 2020.06 - 2022.02
  /(\d{4})[.\-\/年](\d{1,2})[月]?\s*[-–~至到]\s*(?:(\d{4})[.\-\/年](\d{1,2})[月]?|至今|现在|Present|Current)/i,
  // Mar 2020 - Present
  /([A-Z][a-z]+ \d{4})\s*[-–~]\s*(?:([A-Z][a-z]+ \d{4})|Present|Current)/i,
  // 2016 - 2020
  /(\d{4})\s*[-–~至到]\s*(?:(\d{4})|至今|现在|Present|Current)/i,
];

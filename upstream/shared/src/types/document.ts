import type { ResumeElement } from './elements';
import type { ResumeData } from './resume-data';

// ============================================================
// 页面与文档模型
// ============================================================

/** 页面尺寸预设 */
export type PageSize = 'A4' | 'Letter' | 'Custom';

/** 页面方向 */
export type PageOrientation = 'portrait' | 'landscape';

/** 页面边距 */
export interface PageMargins {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** 页面配置 */
export interface PageConfig {
  size: PageSize;
  orientation: PageOrientation;
  /** 宽度 (mm) */
  width: number;
  /** 高度 (mm) */
  height: number;
  margins: PageMargins;
  /** 背景色 */
  backgroundColor: string;
  /** DPI (用于 px 转换) */
  dpi: number;
}

/** 单个页面 */
export interface ResumePage {
  id: string;
  /** 页码 (从1开始) */
  pageNumber: number;
  /** 页面内所有元素 */
  elements: ResumeElement[];
  /** 页面配置 (可覆盖文档级配置) */
  config?: Partial<PageConfig>;
}

/** 文档元数据 */
export interface DocumentMetadata {
  title: string;
  author: string;
  createdAt: string;
  updatedAt: string;
  description?: string;
  tags?: string[];
}

/** 简历文档 */
export interface ResumeDocument {
  id: string;
  version: string;
  metadata: DocumentMetadata;
  /** 全局页面配置 */
  pageConfig: PageConfig;
  /** 页面列表 */
  pages: ResumePage[];
  /** 使用的模版ID */
  templateId?: string;
  /** 简历语义数据 (结构化) */
  resumeData?: ResumeData;
}

// ============================================================
// 默认页面配置 (A4)
// ============================================================

export const DEFAULT_PAGE_CONFIG: PageConfig = {
  size: 'A4',
  orientation: 'portrait',
  width: 210, // mm
  height: 297, // mm
  margins: {
    top: 20,
    right: 15,
    bottom: 20,
    left: 15,
  },
  backgroundColor: '#ffffff',
  dpi: 96,
};

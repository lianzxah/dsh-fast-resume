import type { PageConfig } from '@resume-editor/shared';
import { mmToPx } from '@resume-editor/shared';

// ============================================================
// 页面尺寸计算 (框架无关)
// 将 PageConfig 中的 mm 单位换算为渲染用的 px 单位
// ============================================================

export interface PageMetrics {
  /** 页面宽度 (px) */
  widthPx: number;
  /** 页面高度 (px) */
  heightPx: number;
  /** 边距 (px) */
  margins: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
  /** 背景色 */
  backgroundColor: string;
}

/**
 * 根据页面配置计算像素级别的页面度量信息
 */
export function getPageMetrics(config: PageConfig): PageMetrics {
  const dpi = config.dpi ?? 96;
  return {
    widthPx: Math.round(mmToPx(config.width, dpi)),
    heightPx: Math.round(mmToPx(config.height, dpi)),
    margins: {
      top: mmToPx(config.margins.top, dpi),
      right: mmToPx(config.margins.right, dpi),
      bottom: mmToPx(config.margins.bottom, dpi),
      left: mmToPx(config.margins.left, dpi),
    },
    backgroundColor: config.backgroundColor,
  };
}

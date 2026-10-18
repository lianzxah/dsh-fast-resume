import type { AiTextHeightAdjustment, ResumeDocument } from '@resume-editor/shared';
import { layoutTextElement } from './rich-text';

const HEIGHT_PRECISION = 1000;
const MIN_TEXT_HEIGHT = 1;

function normalizeMeasuredHeight(height: number): number | null {
  if (!Number.isFinite(height)) return null;
  return Math.round(Math.max(MIN_TEXT_HEIGHT, height) * HEIGHT_PRECISION) / HEIGHT_PRECISION;
}

/**
 * 使用与画布渲染、导出相同的富文本布局器测量指定文本元素的最终高度。
 * 该函数不修改文档，仅返回实际发生变化的高度调整。
 */
export function measureTextElementHeightAdjustments(
  document: ResumeDocument,
  elementIds: readonly string[]
): AiTextHeightAdjustment[] {
  if (elementIds.length === 0) return [];

  const targets = new Set(elementIds);
  const adjustments: AiTextHeightAdjustment[] = [];

  for (const page of document.pages) {
    for (const element of page.elements) {
      if (!targets.has(element.id) || element.type !== 'text') continue;

      const height = normalizeMeasuredHeight(layoutTextElement(element).height);
      if (height === null || Math.abs(height - element.height) < 1 / HEIGHT_PRECISION) continue;
      adjustments.push({ elementId: element.id, height });
    }
  }

  return adjustments;
}

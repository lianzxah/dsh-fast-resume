import type { PageConfig, ResumeElement, ResumePage } from '@resume-editor/shared';
import { normalizeElementLinkUrl, pxToMm } from '@resume-editor/shared';
import { normalizeElementSize } from './element-mapper';

export interface PdfLinkAnnotation {
  url: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export function collectPdfLinkAnnotations(
  page: ResumePage,
  pageConfig: PageConfig
): PdfLinkAnnotation[] {
  return page.elements.flatMap((element) => collectElementLinks(element, pageConfig, 0, 0));
}

function collectElementLinks(
  element: ResumeElement,
  pageConfig: PageConfig,
  offsetX: number,
  offsetY: number
): PdfLinkAnnotation[] {
  if (!element.visible) return [];

  const current = toPdfLinkAnnotation(element, pageConfig, offsetX, offsetY);
  const children =
    element.type === 'group'
      ? element.children.flatMap((child) =>
          collectElementLinks(child, pageConfig, offsetX + element.left, offsetY + element.top)
        )
      : [];

  return current ? [current, ...children] : children;
}

function toPdfLinkAnnotation(
  element: ResumeElement,
  pageConfig: PageConfig,
  offsetX: number,
  offsetY: number
): PdfLinkAnnotation | null {
  const url = normalizeElementLinkUrl(element.link?.url);
  if (!url) return null;

  return {
    url,
    x: pxToMm(offsetX + element.left, pageConfig.dpi),
    y: pxToMm(offsetY + element.top, pageConfig.dpi),
    width: pxToMm(normalizeElementSize(element.width), pageConfig.dpi),
    height: pxToMm(normalizeElementSize(element.height), pageConfig.dpi),
  };
}

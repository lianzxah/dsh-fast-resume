import { describe, expect, it } from 'vitest';
import type { ResumePage, TextElement } from '@resume-editor/shared';
import { DEFAULT_PAGE_CONFIG } from '@resume-editor/shared';
import { collectPdfLinkAnnotations } from '../../src/core/links';

const linkedText: TextElement = {
  id: 'text-1',
  type: 'text',
  name: '文字链接',
  link: { url: 'github.com/user' },
  left: 96,
  top: 192,
  width: 240,
  height: 48,
  rotation: 0,
  opacity: 1,
  visible: true,
  locked: false,
  zIndex: 0,
  content: 'GitHub',
  fontSize: 14,
  fontFamily: 'Arial, sans-serif',
  fontWeight: 'normal',
  fontStyle: 'normal',
  textAlign: 'left',
  lineHeight: 1.4,
  letterSpacing: 0,
  color: '#2563eb',
  underline: true,
  strikethrough: false,
};

describe('collectPdfLinkAnnotations', () => {
  it('converts linked elements to PDF millimeter annotations', () => {
    const page: ResumePage = {
      id: 'page-1',
      pageNumber: 1,
      elements: [linkedText],
    };

    const annotations = collectPdfLinkAnnotations(page, DEFAULT_PAGE_CONFIG);

    expect(annotations).toHaveLength(1);
    expect(annotations[0]).toMatchObject({
      url: 'https://github.com/user',
      x: 25.4,
      y: 50.8,
      width: 63.5,
      height: 12.7,
    });
  });

  it('ignores invisible or unsafe links', () => {
    const page: ResumePage = {
      id: 'page-1',
      pageNumber: 1,
      elements: [
        { ...linkedText, id: 'hidden', visible: false },
        { ...linkedText, id: 'unsafe', link: { url: 'javascript:alert(1)' } },
      ],
    };

    expect(collectPdfLinkAnnotations(page, DEFAULT_PAGE_CONFIG)).toEqual([]);
  });
});

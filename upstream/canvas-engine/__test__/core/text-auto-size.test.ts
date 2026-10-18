import { describe, expect, it } from 'vitest';
import type { ResumeDocument, ResumeElement, TextElement } from '@resume-editor/shared';
import { DEFAULT_PAGE_CONFIG } from '@resume-editor/shared';
import { measureTextElementHeightAdjustments } from '../../src/core/text-auto-size';

const baseText: TextElement = {
  id: 'text-1',
  type: 'text',
  name: '正文',
  left: 40,
  top: 80,
  width: 300,
  height: 15,
  rotation: 0,
  opacity: 1,
  visible: true,
  locked: false,
  zIndex: 1,
  content: '第一行',
  fontSize: 10,
  fontFamily: 'Microsoft YaHei, sans-serif',
  fontWeight: 'normal',
  fontStyle: 'normal',
  textAlign: 'left',
  lineHeight: 1.5,
  letterSpacing: 0,
  color: '#111111',
  underline: false,
  strikethrough: false,
};

function createDocument(elements: ResumeElement[]): ResumeDocument {
  return {
    id: 'doc-1',
    version: '1.0.0',
    metadata: {
      title: '测试简历',
      author: '',
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-01T00:00:00.000Z',
    },
    pageConfig: DEFAULT_PAGE_CONFIG,
    pages: [{ id: 'page-1', pageNumber: 1, elements }],
  };
}

describe('measureTextElementHeightAdjustments', () => {
  it('grows a text box to the final multiline content height', () => {
    const document = createDocument([
      { ...baseText, content: '第一行\n第二行\n第三行', height: 15 },
    ]);

    expect(measureTextElementHeightAdjustments(document, ['text-1'])).toEqual([
      { elementId: 'text-1', height: 45 },
    ]);
  });

  it('grows for a long paragraph that wraps by the existing text-box width', () => {
    const document = createDocument([
      {
        ...baseText,
        width: 30,
        content: '这是由人工智能扩写后需要自动换行的长正文内容',
        height: 15,
      },
    ]);

    const [adjustment] = measureTextElementHeightAdjustments(document, ['text-1']);

    expect(adjustment.elementId).toBe('text-1');
    expect(adjustment.height).toBeGreaterThan(15);
  });

  it('shrinks a text box and uses rich-text segments as the content source', () => {
    const document = createDocument([
      {
        ...baseText,
        content: '兼容纯文本',
        segments: [{ text: '富文本', bold: true }],
        height: 120,
      },
    ]);

    expect(measureTextElementHeightAdjustments(document, ['text-1'])).toEqual([
      { elementId: 'text-1', height: 15 },
    ]);
  });

  it('ignores shapes, missing IDs and duplicate requested IDs without mutating the document', () => {
    const shape: ResumeElement = {
      id: 'shape-1',
      type: 'shape',
      name: '标签',
      left: 0,
      top: 0,
      width: 120,
      height: 30,
      rotation: 0,
      opacity: 1,
      visible: true,
      locked: false,
      zIndex: 0,
      shapeType: 'rectangle',
      fill: '#ffffff',
      strokeColor: '#000000',
      strokeWidth: 0,
      borderRadius: 0,
      text: '形状文字\n不应拉伸形状',
    };
    const document = createDocument([{ ...baseText }, shape]);
    const snapshot = JSON.stringify(document);

    expect(
      measureTextElementHeightAdjustments(document, ['shape-1', 'missing', 'text-1', 'text-1'])
    ).toEqual([]);
    expect(JSON.stringify(document)).toBe(snapshot);
  });
});

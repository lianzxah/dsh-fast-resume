import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PAGE_CONFIG,
  applyAiEditProposal,
  applyAiTextHeightAdjustments,
  createDocumentFingerprint,
  type AiEditProposal,
  type ResumeDocument,
} from '../src';

function createDocument(): ResumeDocument {
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
    pages: [
      {
        id: 'page-1',
        pageNumber: 1,
        elements: [
          {
            id: 'text-1',
            type: 'text',
            name: '正文',
            left: 40,
            top: 80,
            width: 300,
            height: 20,
            rotation: 0,
            opacity: 1,
            visible: true,
            locked: false,
            zIndex: 1,
            content: '负责开发',
            fontSize: 12,
            fontFamily: 'Microsoft YaHei, sans-serif',
            fontWeight: 'normal',
            fontStyle: 'normal',
            textAlign: 'left',
            lineHeight: 1.5,
            letterSpacing: 0,
            color: '#111111',
            underline: false,
            strikethrough: false,
          },
          {
            id: 'shape-1',
            type: 'shape',
            name: '标签',
            left: 40,
            top: 120,
            width: 100,
            height: 30,
            rotation: 0,
            opacity: 1,
            visible: true,
            locked: false,
            zIndex: 2,
            shapeType: 'rectangle',
            fill: '#ffffff',
            strokeColor: '#000000',
            strokeWidth: 0,
            borderRadius: 0,
            text: '标签',
          },
        ],
      },
    ],
  };
}

function createProposal(elementId = 'text-1'): AiEditProposal {
  return {
    id: 'proposal-1',
    title: '优化正文',
    rationale: '测试高度自适应',
    risk: 'low',
    validationProfile: 'reviewed-enhancement',
    commands: [
      {
        type: 'text.replace',
        elementId,
        nextContent: elementId === 'text-1' ? '负责开发\n负责开发' : '标签文字',
      },
    ],
    preview: { changedElementIds: [elementId], summary: ['替换文本'] },
    requiresConfirmation: false,
  };
}

describe('applyAiTextHeightAdjustments', () => {
  it('immutably applies and normalizes an authorized text height', () => {
    const document = createDocument();
    const proposal = createProposal();
    const snapshot = JSON.stringify(document);

    const result = applyAiTextHeightAdjustments(proposal, document, [
      { elementId: 'text-1', height: 42.1236 },
    ]);

    expect(result.pages[0].elements[0].height).toBe(42.124);
    expect(result.pages[0].elements[0]).not.toBe(document.pages[0].elements[0]);
    expect(JSON.stringify(document)).toBe(snapshot);
  });

  it('produces identical checkpoints when client and server replay the same adjustment', () => {
    const proposal = createProposal();
    const clientBase = applyAiEditProposal(proposal, createDocument()).document;
    const serverBase = applyAiEditProposal(proposal, createDocument()).document;
    const adjustments = [{ elementId: 'text-1', height: 36 }];

    const client = applyAiTextHeightAdjustments(proposal, clientBase, adjustments);
    const server = applyAiTextHeightAdjustments(proposal, serverBase, adjustments);

    expect(createDocumentFingerprint(client)).toBe(createDocumentFingerprint(server));
    expect(client.pages[0].elements[0]).toMatchObject({
      content: '负责开发\n负责开发',
      height: 36,
    });
  });

  it('rejects adjustments outside the proposal, duplicate IDs and invalid heights', () => {
    const document = createDocument();
    const proposal = createProposal();

    expect(() =>
      applyAiTextHeightAdjustments(proposal, document, [{ elementId: 'not-targeted', height: 40 }])
    ).toThrow('不属于 text.replace 目标');
    expect(() =>
      applyAiTextHeightAdjustments(proposal, document, [
        { elementId: 'text-1', height: 40 },
        { elementId: 'text-1', height: 41 },
      ])
    ).toThrow('文本高度调整重复');
    expect(() =>
      applyAiTextHeightAdjustments(proposal, document, [
        { elementId: 'text-1', height: Number.NaN },
      ])
    ).toThrow('超出安全范围');
    expect(() =>
      applyAiTextHeightAdjustments(proposal, document, [{ elementId: 'text-1', height: 3000 }])
    ).toThrow('超出安全范围');
  });

  it('rejects shape resizing even when text.replace can target shape text', () => {
    const document = createDocument();
    const proposal = createProposal('shape-1');

    expect(() =>
      applyAiTextHeightAdjustments(proposal, document, [{ elementId: 'shape-1', height: 60 }])
    ).toThrow('不是普通文本元素');
  });
});

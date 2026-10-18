import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_PAGE_CONFIG,
  type ResumeDocument,
  type ResumeTemplate,
  type TextElement,
} from '@resume-editor/shared';
import { useEditorStore } from '../../src/store/editor-store';

vi.mock('@resume-editor/canvas-engine', () => ({
  alignBoxes: vi.fn(() => []),
  distributeBoxes: vi.fn(() => []),
}));

function textElement(id = 'text-1'): TextElement {
  return {
    id,
    type: 'text',
    name: '正文',
    left: 60,
    top: 80,
    width: 500,
    height: 40,
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 1,
    content: '原始内容',
    fontSize: 12,
    fontFamily: 'sans-serif',
    fontWeight: 'normal',
    fontStyle: 'normal',
    textAlign: 'left',
    lineHeight: 1.5,
    letterSpacing: 0,
    color: '#111111',
    underline: false,
    strikethrough: false,
  };
}

function document(): ResumeDocument {
  return {
    id: 'document-1',
    version: '1.0.0',
    metadata: {
      title: '经典简历',
      author: '',
      createdAt: '2026-08-02T00:00:00.000Z',
      updatedAt: '2026-08-02T00:00:00.000Z',
    },
    pageConfig: DEFAULT_PAGE_CONFIG,
    pages: [{ id: 'page-1', pageNumber: 1, elements: [textElement()] }],
  };
}

describe('classic editor store behavior', () => {
  it('preserves selection, element update, undo and redo behavior', () => {
    const session = useEditorStore;
    session.getState().setDocument(document());
    session.getState().selectElement('text-1');
    session.getState().updateElement('text-1', { left: 120, content: '修改后内容' });

    expect(session.getState().selection.selectedIds).toEqual(['text-1']);
    expect(session.getState().document.pages[0].elements[0]).toMatchObject({
      left: 120,
      content: '修改后内容',
    });

    session.getState().undo();
    expect(session.getState().selection.selectedIds).toEqual([]);
    expect(session.getState().document.pages[0].elements[0]).toMatchObject({
      left: 60,
      content: '原始内容',
    });

    session.getState().redo();
    expect(session.getState().document.pages[0].elements[0]).toMatchObject({
      left: 120,
      content: '修改后内容',
    });
  });

  it('resets transient history when applying a template', () => {
    const session = useEditorStore;
    session.getState().setDocument(document());
    session.getState().updateElement('text-1', { left: 120 });
    const template: ResumeTemplate = {
      id: 'template-test',
      name: '测试模板',
      description: '',
      category: 'classic',
      thumbnail: '',
      theme: {
        primaryColor: '#000000',
        secondaryColor: '#111111',
        accentColor: '#222222',
        textColor: '#333333',
        backgroundColor: '#ffffff',
      },
      pageConfig: DEFAULT_PAGE_CONFIG,
      pages: [{ id: 'template-page', pageNumber: 1, elements: [textElement('template-text')] }],
    };

    session.getState().applyTemplate(template);

    expect(session.getState().document.templateId).toBe('template-test');
    expect(session.getState().past).toEqual([]);
    expect(session.getState().future).toEqual([]);
    expect(session.getState().selection.selectedIds).toEqual([]);
    expect(session.getState().document.pages[0].elements[0].id).not.toBe('template-text');
  });

  it('records AI transforms as one revision and one auditable history item', () => {
    const session = useEditorStore;
    session.getState().setDocument(document());

    session.getState().applyDocumentTransform(
      (current) => ({
        ...current,
        metadata: { ...current.metadata, title: 'AI 优化简历' },
      }),
      { source: 'ai', description: '优化标题' }
    );

    expect(session.getState().documentRevision).toBe(1);
    expect(session.getState().history).toHaveLength(1);
    expect(session.getState().history[0].description).toBe('优化标题');
    expect(session.getState().isDirty).toBe(true);
  });
});

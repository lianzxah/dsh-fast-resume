import { describe, expect, it } from 'vitest';
import type { ResumeDocument } from '../src';
import {
  RESUME_BACKUP_FORMAT,
  RESUME_BACKUP_SCHEMA_VERSION,
  ResumeBackupError,
  countResumeDocumentElements,
  parseResumeBackup,
  serializeResumeBackup,
  validateResumeDocument,
} from '../src';

function createDocument(): ResumeDocument {
  return {
    id: 'doc_test',
    version: '1.0.0',
    metadata: {
      title: '测试简历',
      author: '测试用户',
      createdAt: '2026-07-19T00:00:00.000Z',
      updatedAt: '2026-07-19T00:00:00.000Z',
    },
    pageConfig: {
      size: 'A4',
      orientation: 'portrait',
      width: 210,
      height: 297,
      margins: { top: 20, right: 15, bottom: 20, left: 15 },
      backgroundColor: '#ffffff',
      dpi: 96,
    },
    pages: [
      {
        id: 'page_1',
        pageNumber: 1,
        elements: [
          {
            id: 'el_text_1',
            type: 'text',
            name: '姓名',
            left: 40,
            top: 40,
            width: 220,
            height: 36,
            rotation: 0,
            opacity: 1,
            visible: true,
            locked: false,
            zIndex: 0,
            content: '张三',
            fontSize: 24,
            fontFamily: 'sans-serif',
            fontWeight: 'bold',
            fontStyle: 'normal',
            textAlign: 'left',
            lineHeight: 1.3,
            letterSpacing: 0,
            color: '#111111',
            underline: false,
            strikethrough: false,
          },
        ],
      },
    ],
  };
}

describe('JSON 简历备份', () => {
  it('使用带版本的 envelope 序列化并恢复完整文档', () => {
    const document = createDocument();
    const serialized = serializeResumeBackup(document);
    const raw = JSON.parse(serialized);

    expect(raw.format).toBe(RESUME_BACKUP_FORMAT);
    expect(raw.schemaVersion).toBe(RESUME_BACKUP_SCHEMA_VERSION);
    expect(raw.exportedAt).toEqual(expect.any(String));

    const parsed = parseResumeBackup(serialized);
    expect(parsed.source).toBe('versioned');
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.document).toEqual(document);
  });

  it('兼容历史版本导出的裸 ResumeDocument', () => {
    const document = createDocument();
    const parsed = parseResumeBackup(JSON.stringify(document));

    expect(parsed.source).toBe('legacy');
    expect(parsed.schemaVersion).toBe(0);
    expect(parsed.exportedAt).toBeUndefined();
    expect(parsed.document).toEqual(document);
  });

  it('拒绝无法解析的 JSON', () => {
    expect(() => parseResumeBackup('{bad json')).toThrowError(
      expect.objectContaining<Partial<ResumeBackupError>>({ code: 'INVALID_JSON' })
    );
  });

  it('拒绝来自未来版本的备份', () => {
    const backup = {
      format: RESUME_BACKUP_FORMAT,
      schemaVersion: RESUME_BACKUP_SCHEMA_VERSION + 1,
      exportedAt: new Date().toISOString(),
      document: createDocument(),
    };

    expect(() => parseResumeBackup(backup)).toThrowError(
      expect.objectContaining<Partial<ResumeBackupError>>({ code: 'UNSUPPORTED_VERSION' })
    );
  });

  it('报告深层字段错误并拒绝重复元素 ID', () => {
    const document = createDocument();
    document.pages[0].elements.push({ ...document.pages[0].elements[0] });
    const result = validateResumeDocument(document);

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'pages[0].elements[1].id', message: '元素 ID 重复' }),
      ])
    );
    expect(() => parseResumeBackup(JSON.stringify(document))).toThrow(ResumeBackupError);
  });

  it('统计组合元素中的嵌套元素', () => {
    const document = createDocument();
    const text = document.pages[0].elements[0];
    document.pages[0].elements = [
      {
        id: 'el_group_1',
        type: 'group',
        name: '组合',
        left: 0,
        top: 0,
        width: 300,
        height: 100,
        rotation: 0,
        opacity: 1,
        visible: true,
        locked: false,
        zIndex: 0,
        children: [text],
      },
    ];

    expect(countResumeDocumentElements(document)).toBe(2);
    expect(validateResumeDocument(document).success).toBe(true);
  });

  it('拒绝危险链接协议', () => {
    const document = createDocument();
    document.pages[0].elements[0].link = { url: 'javascript:alert(1)' };

    const result = validateResumeDocument(document);
    expect(result.success).toBe(false);
  });
});

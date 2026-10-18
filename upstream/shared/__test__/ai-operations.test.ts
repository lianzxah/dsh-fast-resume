import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PAGE_CONFIG,
  applyAiEditProposal,
  canAutoApplyAiProposal,
  createAiElementSnapshot,
  createDocumentFingerprint,
  previewAiChangeRevert,
  revertAiAppliedChange,
  validateAiEditProposal,
  type AiEditProposal,
  type ResumeDocument,
} from '../src';

function createDocument(): ResumeDocument {
  return {
    id: 'doc_test',
    version: '1.0.0',
    metadata: {
      title: '测试简历',
      author: '',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    pageConfig: DEFAULT_PAGE_CONFIG,
    pages: [
      {
        id: 'page_1',
        pageNumber: 1,
        elements: [
          {
            id: 'el_text_1',
            type: 'text',
            name: '工作经历',
            left: 60,
            top: 80,
            width: 500,
            height: 80,
            rotation: 0,
            opacity: 1,
            visible: true,
            locked: false,
            zIndex: 1,
            content: '负责前端开发',
            fontSize: 12,
            fontFamily: 'Microsoft YaHei, sans-serif',
            fontWeight: 'normal',
            fontStyle: 'normal',
            textAlign: 'left',
            lineHeight: 1.6,
            letterSpacing: 0,
            color: '#333333',
            underline: false,
            strikethrough: false,
          },
        ],
      },
    ],
    resumeData: {
      personalInfo: { name: '张三' },
      experience: [],
      education: [],
      skills: [],
      projects: [],
      certifications: [],
      customSections: [],
    },
  };
}

function proposal(command: AiEditProposal['commands'][number]): AiEditProposal {
  return {
    id: 'ai_prop_1',
    title: '优化文本',
    rationale: '测试',
    risk: 'low',
    validationProfile: 'strict',
    commands: [command],
    preview: {
      changedElementIds: 'elementId' in command ? [command.elementId] : [],
      summary: ['测试修改'],
    },
    requiresConfirmation: false,
    autoApply: true,
  };
}

describe('AI operations', () => {
  it('applies text.replace without mutating the original document', () => {
    const doc = createDocument();
    const result = applyAiEditProposal(
      proposal({
        type: 'text.replace',
        elementId: 'el_text_1',
        nextContent: '主导前端核心模块开发，提升交付效率',
      }),
      doc
    );

    const original = doc.pages[0].elements[0];
    const next = result.document.pages[0].elements[0];

    expect(original.type === 'text' ? original.content : '').toBe('负责前端开发');
    expect(next.type === 'text' ? next.content : '').toBe('主导前端核心模块开发，提升交付效率');
    expect(result.changedElementIds).toEqual(['el_text_1']);
  });

  it('produces the same checkpoint when client and server recompute a proposal', () => {
    const doc = createDocument();
    const p = proposal({
      type: 'text.replace',
      elementId: 'el_text_1',
      nextContent: '优化前端开发',
    });

    const clientResult = applyAiEditProposal(p, doc);
    const serverResult = applyAiEditProposal(p, doc);

    expect(createDocumentFingerprint(clientResult.document)).toBe(
      createDocumentFingerprint(serverResult.document)
    );
    expect(clientResult.document.metadata.updatedAt).toBe(doc.metadata.updatedAt);
  });

  it('rejects commands targeting a missing element', () => {
    const validation = validateAiEditProposal(
      proposal({
        type: 'text.replace',
        elementId: 'missing',
        nextContent: '新文本',
      }),
      createDocument()
    );

    expect(validation.ok).toBe(false);
    expect(validation.issues[0].code).toBe('element_not_found');
  });

  it('rejects low-risk text expansion that is too large', () => {
    const validation = validateAiEditProposal(
      proposal({
        type: 'text.replace',
        elementId: 'el_text_1',
        nextContent: '这是一个明显超过原文三倍长度的文本，用于验证自动应用时的保守风控。',
      }),
      createDocument()
    );

    expect(validation.ok).toBe(false);
    expect(validation.issues.some((issue) => issue.code === 'text_expanded_too_much')).toBe(true);
  });

  it('allows reviewed expansion and new technology terms as visible warnings', () => {
    const reviewed: AiEditProposal = {
      ...proposal({
        type: 'text.replace',
        elementId: 'el_text_1',
        nextContent:
          '负责前后端系统开发，使用 RESTful API、MongoDB、PostgreSQL、Docker 推进 DevOps 工程实践。',
      }),
      validationProfile: 'reviewed-enhancement',
    };
    const validation = validateAiEditProposal(reviewed, createDocument());

    expect(validation.ok).toBe(true);
    expect(validation.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'text_expanded_too_much', severity: 'warning' }),
        expect.objectContaining({ code: 'new_unverified_fact', severity: 'warning' }),
      ])
    );
    for (const term of ['RESTful API', 'MongoDB', 'PostgreSQL', 'Docker', 'DevOps']) {
      expect(
        validation.issues.some(
          (issue) => issue.severity === 'warning' && issue.message.includes(term)
        )
      ).toBe(true);
    }
    expect(() => applyAiEditProposal(reviewed, createDocument())).not.toThrow();
    expect(canAutoApplyAiProposal(reviewed, createDocument()).ok).toBe(false);

    const { validationProfile: _legacyMissingProfile, ...legacyProposal } = reviewed;
    expect(validateAiEditProposal(legacyProposal, createDocument()).ok).toBe(true);

    const legacyMixedProposal: AiEditProposal = {
      ...legacyProposal,
      commands: [
        ...legacyProposal.commands,
        { type: 'element.patch', elementId: 'el_text_1', patch: { opacity: 1 } },
      ],
    };
    expect(validateAiEditProposal(legacyMixedProposal, createDocument()).ok).toBe(false);
  });

  it('still blocks invented hard facts under the reviewed enhancement profile', () => {
    const reviewed: AiEditProposal = {
      ...proposal({
        type: 'text.replace',
        elementId: 'el_text_1',
        nextContent: '负责前端开发，2028 年将性能提升 30%',
      }),
      validationProfile: 'reviewed-enhancement',
    };
    const validation = validateAiEditProposal(reviewed, createDocument());

    expect(validation.ok).toBe(false);
    expect(validation.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'new_unverified_fact', severity: 'error' }),
      ])
    );
  });

  it('blocks textual percentages, contextual dates, bare domains, and social handles', () => {
    const reviewed: AiEditProposal = {
      ...proposal({
        type: 'text.replace',
        elementId: 'el_text_1',
        nextContent:
          'Improved performance by thirty percent in January 2027，详见 linkedin.com/in/alice 或联系 @alice，效率提升百分之三十。',
      }),
      validationProfile: 'reviewed-enhancement',
    };
    const validation = validateAiEditProposal(reviewed, createDocument());

    expect(validation.ok).toBe(false);
    for (const fact of [
      'thirty percent',
      'January 2027',
      'linkedin.com/in/alice',
      '@alice',
      '百分之三十',
    ]) {
      expect(
        validation.issues.some(
          (issue) => issue.severity === 'error' && issue.message.includes(fact)
        )
      ).toBe(true);
    }
  });

  it('does not treat ambiguous month verbs or dotted technology and file names as hard facts', () => {
    const reviewed: AiEditProposal = {
      ...proposal({
        type: 'text.replace',
        elementId: 'el_text_1',
        nextContent:
          'May improve delivery. March toward automation with Express.js、Angular.js、Three.js、Socket.io and package.json。',
      }),
      validationProfile: 'reviewed-enhancement',
    };
    const validation = validateAiEditProposal(reviewed, createDocument());

    expect(validation.ok).toBe(true);
    expect(
      validation.issues.some(
        (issue) =>
          issue.severity === 'error' &&
          (issue.message.includes('May') ||
            issue.message.includes('March') ||
            issue.message.includes('Express.js') ||
            issue.message.includes('Angular.js') ||
            issue.message.includes('Three.js') ||
            issue.message.includes('Socket.io') ||
            issue.message.includes('package.json'))
      )
    ).toBe(false);
  });

  it('blocks bare contact domains across modern and institutional TLDs', () => {
    const reviewed: AiEditProposal = {
      ...proposal({
        type: 'text.replace',
        elementId: 'el_text_1',
        nextContent:
          'Portfolio: portfolio.ai、profile.tech、example.xyz、university.edu、portfolio.us、site.uk、company.de、profile.ca、resume.fr、studio.biz',
      }),
      validationProfile: 'reviewed-enhancement',
    };
    const validation = validateAiEditProposal(reviewed, createDocument());

    expect(validation.ok).toBe(false);
    for (const domain of [
      'portfolio.ai',
      'profile.tech',
      'example.xyz',
      'university.edu',
      'portfolio.us',
      'site.uk',
      'company.de',
      'profile.ca',
      'resume.fr',
      'studio.biz',
    ]) {
      expect(
        validation.issues.some(
          (issue) => issue.severity === 'error' && issue.message.includes(domain)
        )
      ).toBe(true);
    }
  });

  it('does not downgrade ambiguous real domains to technology warnings', () => {
    const reviewed: AiEditProposal = {
      ...proposal({
        type: 'text.replace',
        elementId: 'el_text_1',
        nextContent: 'Contacts: Acme.io、portfolio.md、company.rs',
      }),
      validationProfile: 'reviewed-enhancement',
    };
    const validation = validateAiEditProposal(reviewed, createDocument());

    expect(validation.ok).toBe(false);
    for (const domain of ['Acme.io', 'portfolio.md', 'company.rs']) {
      expect(
        validation.issues.some(
          (issue) => issue.severity === 'error' && issue.message.includes(domain)
        )
      ).toBe(true);
    }
  });

  it('applies resumeData.patch and relayouts from semantic data', () => {
    const doc = createDocument();
    const result = applyAiEditProposal(
      proposal({
        type: 'resumeData.patch',
        patch: [{ op: 'replace', path: '/personalInfo/name', value: '李四' }],
        relayout: 'document',
      }),
      doc
    );

    expect(result.document.resumeData?.personalInfo.name).toBe('李四');
    expect(
      result.document.pages[0].elements.some((element) => element.semanticRef?.field === 'name')
    ).toBe(true);
  });

  it('rejects auto apply when the target snapshot changed', () => {
    const doc = createDocument();
    const element = doc.pages[0].elements[0];
    const p = {
      ...proposal({
        type: 'text.replace',
        elementId: 'el_text_1',
        nextContent: '优化前端开发',
      }),
      baseDocumentHash: createDocumentFingerprint(doc),
      targetSnapshots: [createAiElementSnapshot(element)],
    };

    if (doc.pages[0].elements[0].type === 'text')
      doc.pages[0].elements[0].content = '用户已手动修改';
    const validation = canAutoApplyAiProposal(p, doc);

    expect(validation.ok).toBe(false);
    expect(
      validation.issues.some(
        (issue) => issue.code === 'document_changed' || issue.code === 'target_element_changed'
      )
    ).toBe(true);
  });

  it('requires user-provided facts before adding protected numbers', () => {
    const doc = createDocument();
    const unsafe = validateAiEditProposal(
      proposal({
        type: 'text.replace',
        elementId: 'el_text_1',
        nextContent: '负责前端开发，性能提升 30%',
      }),
      doc
    );
    const safe = validateAiEditProposal(
      {
        ...proposal({
          type: 'text.replace',
          elementId: 'el_text_1',
          nextContent: '负责前端开发，性能提升 30%',
        }),
        allowedFacts: ['30%', '30'],
      },
      doc
    );

    expect(unsafe.ok).toBe(false);
    expect(safe.ok).toBe(true);
  });

  it('allows a targeted proposal after unrelated document changes', () => {
    const doc = createDocument();
    const element = doc.pages[0].elements[0];
    const targeted = {
      ...proposal({
        type: 'text.replace',
        elementId: 'el_text_1',
        nextContent: '优化前端开发',
      }),
      baseDocumentHash: createDocumentFingerprint(doc),
      targetSnapshots: [createAiElementSnapshot(element)],
    };

    doc.metadata.description = '用户在非目标区域增加的说明';
    expect(validateAiEditProposal(targeted, doc).ok).toBe(true);
  });

  it('reverts only the AI target and preserves unrelated later edits', () => {
    const before = createDocument();
    const applied = applyAiEditProposal(
      proposal({
        type: 'text.replace',
        elementId: 'el_text_1',
        nextContent: '主导前端核心模块开发',
      }),
      before
    ).document;
    const current = JSON.parse(JSON.stringify(applied)) as ResumeDocument;
    current.metadata.description = '应保留的后续手改';

    const result = revertAiAppliedChange(
      {
        proposalId: 'ai_prop_1',
        resumeId: 'resume_1',
        commandTypes: ['text.replace'],
        changedElementIds: ['el_text_1'],
        beforeDocument: before,
        afterDocument: applied,
        appliedAt: '2026-01-01T00:00:00.000Z',
      },
      current
    );

    const reverted = result.document.pages[0].elements[0];
    expect(reverted.type === 'text' ? reverted.content : '').toBe('负责前端开发');
    expect(result.document.metadata.description).toBe('应保留的后续手改');
  });

  it('blocks an AI revert when its target changed afterwards', () => {
    const before = createDocument();
    const applied = applyAiEditProposal(
      proposal({ type: 'text.replace', elementId: 'el_text_1', nextContent: '优化前端开发' }),
      before
    ).document;
    const current = JSON.parse(JSON.stringify(applied)) as ResumeDocument;
    const currentElement = current.pages[0].elements[0];
    if (currentElement.type === 'text') currentElement.content = '用户后续手动编辑';

    const preview = previewAiChangeRevert(
      {
        proposalId: 'ai_prop_1',
        resumeId: 'resume_1',
        commandTypes: ['text.replace'],
        changedElementIds: ['el_text_1'],
        beforeDocument: before,
        afterDocument: applied,
        appliedAt: '2026-01-01T00:00:00.000Z',
      },
      current
    );

    expect(preview.ok).toBe(false);
    expect(preview.message).toContain('后续编辑');
  });
});

import { useEditorStore } from '@/store';
import { measureTextElementHeightAdjustments } from '@resume-editor/canvas-engine';
import {
  applyAiEditProposal as applySharedAiEditProposal,
  applyAiTextHeightAdjustments,
  buildAiTextIndex,
  canAutoApplyAiProposal,
  createDocumentFingerprint,
  findElementLocation,
  previewAiChangeRevert,
  revertAiAppliedChange as revertSharedAiAppliedChange,
  type AiAppliedChange,
  type AiEditorContext,
  type AiEditProposal,
  type AiTextHeightAdjustment,
  type ResumeDocument,
  type ResumeElement,
  type ViewCommand,
} from '@resume-editor/shared';

function sanitizeElementForAi(element: ResumeElement): ResumeElement {
  if (element.type === 'image') {
    return { ...element, src: element.src?.startsWith('data:') ? '[image omitted]' : element.src };
  }
  if (element.type === 'group') {
    return { ...element, children: element.children.map(sanitizeElementForAi) };
  }
  return element;
}

function createAiSafeDocument(document: ResumeDocument): ResumeDocument {
  return {
    ...document,
    pages: document.pages.map((page) => ({
      ...page,
      elements: page.elements.map(sanitizeElementForAi),
    })),
  };
}

export function collectEditorContext(): AiEditorContext {
  const store = useEditorStore.getState();
  const safeDocument = createAiSafeDocument(store.document);
  const selected = new Set(store.selection.selectedIds);
  const textIndex = buildAiTextIndex(safeDocument);
  const selectedTextIndex = textIndex.filter((item) => selected.has(item.elementId));
  const scopedIndex =
    selectedTextIndex.length > 0
      ? [
          ...selectedTextIndex,
          ...textIndex.filter((item) => item.pageIndex === store.activePageIndex),
        ].slice(0, 40)
      : textIndex.filter((item) => item.pageIndex === store.activePageIndex).slice(0, 40);

  return {
    resumeId: store.resumeId ?? '',
    document: safeDocument,
    documentHash: createDocumentFingerprint(store.document),
    documentRevision: store.documentRevision,
    activePageIndex: store.activePageIndex,
    selectedIds: store.selection.selectedIds,
    viewport: {
      zoom: store.viewport.zoom.level,
    },
    visibleTextIndex: scopedIndex.length > 0 ? scopedIndex : textIndex.slice(0, 40),
    currentTemplateId: store.document.templateId,
    contextScope: selectedTextIndex.length > 0 ? 'selection' : 'activePage',
  };
}

export function canAutoApplyProposal(proposal: AiEditProposal): { ok: boolean; message?: string } {
  const store = useEditorStore.getState();
  const validation = canAutoApplyAiProposal(proposal, store.document);
  return {
    ok: validation.ok,
    message: validation.issues.map((issue) => issue.message).join('; '),
  };
}

export interface PreparedAiEditProposal {
  changedElementIds: string[];
  beforeHash: string;
  afterHash: string;
  commandTypes: string[];
  beforeDocument: ResumeDocument;
  afterDocument: ResumeDocument;
  textHeightAdjustments: AiTextHeightAdjustment[];
}

export function prepareAiEditProposal(proposal: AiEditProposal): PreparedAiEditProposal {
  const store = useEditorStore.getState();
  const beforeDocument = JSON.parse(JSON.stringify(store.document)) as ResumeDocument;
  const beforeHash = createDocumentFingerprint(beforeDocument);
  const result = applySharedAiEditProposal(proposal, beforeDocument);
  const textReplaceIds = proposal.commands
    .filter((command) => command.type === 'text.replace')
    .map((command) => command.elementId);
  const textHeightAdjustments = measureTextElementHeightAdjustments(
    result.document,
    textReplaceIds
  );
  const afterDocument = applyAiTextHeightAdjustments(
    proposal,
    result.document,
    textHeightAdjustments
  );
  const afterHash = createDocumentFingerprint(afterDocument);

  return {
    changedElementIds: result.changedElementIds,
    beforeHash,
    afterHash,
    commandTypes: proposal.commands.map((command) => command.type),
    beforeDocument,
    afterDocument,
    textHeightAdjustments,
  };
}

export function commitPreparedAiEditProposal(
  proposal: AiEditProposal,
  prepared: PreparedAiEditProposal
): void {
  const store = useEditorStore.getState();
  if (createDocumentFingerprint(store.document) !== prepared.beforeHash) {
    throw new Error('等待 AI 提案持久化期间简历已变化，已取消应用，请重新生成');
  }

  store.applyDocumentTransform(() => prepared.afterDocument, {
    source: 'ai',
    description: proposal.title,
  });

  if (prepared.changedElementIds.length > 0) {
    useEditorStore.getState().selectMultiple(prepared.changedElementIds);
    const first = findElementLocation(prepared.afterDocument, prepared.changedElementIds[0]);
    if (first) useEditorStore.getState().setActivePage(first.pageIndex);
  }
}

export function canRevertAiChange(change: AiAppliedChange): { ok: boolean; message?: string } {
  const preview = previewAiChangeRevert(change, useEditorStore.getState().document);
  return { ok: preview.ok, message: preview.message };
}

export interface PreparedAiChangeRevert {
  changedElementIds: string[];
  currentHash: string;
  document: ResumeDocument;
}

export function prepareAiChangeRevert(change: AiAppliedChange): PreparedAiChangeRevert {
  const store = useEditorStore.getState();
  const result = revertSharedAiAppliedChange(change, store.document);
  return {
    changedElementIds: result.changedElementIds,
    currentHash: createDocumentFingerprint(store.document),
    document: result.document,
  };
}

export function commitPreparedAiChangeRevert(
  change: AiAppliedChange,
  prepared: PreparedAiChangeRevert
): void {
  const store = useEditorStore.getState();
  if (createDocumentFingerprint(store.document) !== prepared.currentHash) {
    throw new Error('等待 AI 回退持久化期间简历已变化，已取消回退');
  }
  store.applyDocumentTransform(() => prepared.document, {
    source: 'ai',
    description: `回退 AI 修改：${change.title || change.proposalId}`,
  });
}

export function executeViewCommand(command: ViewCommand): void {
  const store = useEditorStore.getState();

  switch (command.type) {
    case 'view.setActivePage':
      store.setActivePage(command.pageIndex);
      return;
    case 'view.selectElements':
      store.selectMultiple(command.elementIds);
      return;
    case 'view.openLeftPanel':
      if (!store.ui.leftPanelVisible) store.toggleLeftPanel();
      store.setLeftPanelTab(command.tab);
      return;
    case 'view.openRightPanel':
      if (!store.ui.rightPanelVisible) store.toggleRightPanel();
      return;
    case 'view.openAssistant':
      if (!store.ui.bottomPanelVisible) store.toggleBottomPanel();
      return;
    case 'view.zoomToFit':
      store.zoomToFit();
      return;
    case 'view.scrollToElement': {
      const location = findElementLocation(store.document, command.elementId);
      if (location) {
        store.setActivePage(location.pageIndex);
        store.selectMultiple([command.elementId]);
        window.dispatchEvent(
          new CustomEvent('resume-editor:scroll-to-element', {
            detail: { elementId: command.elementId, pageIndex: location.pageIndex },
          })
        );
      }
      return;
    }
  }
}

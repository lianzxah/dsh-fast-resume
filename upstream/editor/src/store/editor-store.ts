import { create } from 'zustand';
import type {
  EditorState,
  EditorUIState,
  EditorTool,
  LeftPanelTab,
  ResumeDocument,
  ResumeElement,
  ResumePage,
  ResumeTemplate,
} from '@resume-editor/shared';
import { DEFAULT_PAGE_CONFIG, generateDocumentId, generatePageId, generateElementId, generateId } from '@resume-editor/shared';
import {
  alignBoxes,
  distributeBoxes,
  type AlignType,
  type DistributeType,
  type AlignBox,
} from '@resume-editor/canvas-engine';

// ============================================================
// 编辑器状态 Store
// ============================================================

interface EditorActions {
  // 文档操作
  setDocument: (doc: ResumeDocument) => void;
  restoreDocument: (doc: ResumeDocument) => void;
  updateDocumentTitle: (title: string) => void;
  applyTemplate: (template: ResumeTemplate) => void;
  applyDocumentTransform: (
    transform: (doc: ResumeDocument) => ResumeDocument,
    meta?: { source: 'user' | 'ai'; description?: string }
  ) => void;

  // 页面操作
  addPage: () => void;
  removePage: (pageId: string) => void;
  setActivePage: (index: number) => void;

  // 元素操作 (按 id 跨页定位)
  addElement: (element: ResumeElement, pageIndex?: number) => void;
  removeElement: (elementId: string) => void;
  removeElements: (elementIds: string[]) => void;
  updateElement: (elementId: string, updates: Partial<ResumeElement>) => void;
  updateElements: (updatesById: Record<string, Partial<ResumeElement>>) => void;
  duplicateElement: (elementId: string) => void;
  toggleElementVisibility: (elementId: string) => void;
  toggleElementLock: (elementId: string) => void;

  // 层级操作
  bringToFront: (elementId: string) => void;
  sendToBack: (elementId: string) => void;
  bringForward: (elementId: string) => void;
  sendBackward: (elementId: string) => void;
  reorderLayer: (pageIndex: number, fromIndex: number, toIndex: number) => void;

  // 剪贴板
  copySelection: () => void;
  cutSelection: () => void;
  paste: () => void;

  // 对齐/分布 (作用于当前选区, 按页分组)
  alignSelection: (type: AlignType) => void;
  distributeSelection: (type: DistributeType) => void;

  // 选择操作
  selectElement: (id: string) => void;
  selectMultiple: (ids: string[]) => void;
  deselectAll: () => void;
  setHovered: (id: string | null) => void;

  // UI 操作
  setActiveTool: (tool: EditorTool) => void;
  setLeftPanelTab: (tab: LeftPanelTab) => void;
  toggleLeftPanel: () => void;
  toggleRightPanel: () => void;
  toggleBottomPanel: () => void;
  setLeftPanelWidth: (width: number) => void;
  setRightPanelWidth: (width: number) => void;
  setBottomPanelHeight: (height: number) => void;
  toggleGrid: () => void;
  toggleRuler: () => void;
  toggleSnap: () => void;

  // 缩放
  setZoom: (level: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  zoomToFit: () => void;

  // 历史
  markDirty: () => void;
  markClean: () => void;
  undo: () => void;
  redo: () => void;

  // 持久化 (关联后端简历)
  setResumeId: (id: string | null) => void;
  setSaveState: (s: Partial<Pick<ExtraState, 'isSaving' | 'saveError' | 'lastSavedAt'>>) => void;
}

const MAX_HISTORY = 50;

const cloneDoc = (doc: ResumeDocument): ResumeDocument => JSON.parse(JSON.stringify(doc));

interface ExtraState {
  past: ResumeDocument[];
  future: ResumeDocument[];
  /** 剪贴板 (元素快照) */
  clipboard: ResumeElement[];
  /** 关联的后端简历 id (null 表示尚未保存到后端) */
  resumeId: string | null;
  /** 是否正在保存 */
  isSaving: boolean;
  /** 保存错误信息 */
  saveError: string | null;
  /** 最近保存时间 */
  lastSavedAt: string | null;
  /** 本地文档修订号，供 AI 冲突检测和会话内审计使用 */
  documentRevision: number;
}

type EditorStore = EditorState & EditorActions & ExtraState;

/** 生成入栈补丁: 记录当前文档到 past, 清空 future */
function pushPast(state: EditorStore): Pick<ExtraState, 'past' | 'future'> {
  return {
    past: [...state.past, cloneDoc(state.document)].slice(-MAX_HISTORY),
    future: [],
  };
}

/** 在所有页面中定位元素 */
function locate(pages: ResumePage[], id: string): { pi: number; ei: number } | null {
  for (let pi = 0; pi < pages.length; pi++) {
    const ei = pages[pi].elements.findIndex((el) => el.id === id);
    if (ei !== -1) return { pi, ei };
  }
  return null;
}

/** 深拷贝元素并赋予新 id / 名称 */
function cloneElement(el: ResumeElement, suffix = ' (副本)'): ResumeElement {
  const copy = JSON.parse(JSON.stringify(el)) as ResumeElement;
  copy.id = generateElementId(el.type);
  copy.name = `${el.name}${suffix}`;
  return copy;
}

/** 依据数组顺序重排 zIndex */
function reindex(elements: ResumeElement[]): ResumeElement[] {
  return elements.map((el, i) => ({ ...el, zIndex: i } as ResumeElement));
}

/** 应用一组按 id 的属性更新 (跨页), 返回新 pages */
function applyUpdates(
  pages: ResumePage[],
  updatesById: Record<string, Partial<ResumeElement>>
): ResumePage[] {
  return pages.map((page) => {
    let changed = false;
    const elements = page.elements.map((el) => {
      const u = updatesById[el.id];
      if (!u) return el;
      changed = true;
      return { ...el, ...u } as ResumeElement;
    });
    return changed ? { ...page, elements } : page;
  });
}

/** 对单页做元素顺序变换 + 重排 zIndex */
function transformPageElements(
  state: EditorStore,
  pageIndex: number,
  fn: (elements: ResumeElement[]) => ResumeElement[]
) {
  const pages = [...state.document.pages];
  const page = pages[pageIndex];
  if (!page) return null;
  pages[pageIndex] = { ...page, elements: reindex(fn([...page.elements])) };
  return { ...pushPast(state), document: { ...state.document, pages }, isDirty: true };
}

function createDefaultDocument(): ResumeDocument {
  return {
    id: generateDocumentId(),
    version: '1.0.0',
    metadata: {
      title: '未命名简历',
      author: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    pageConfig: DEFAULT_PAGE_CONFIG,
    pages: [
      {
        id: generatePageId(),
        pageNumber: 1,
        elements: [],
      },
    ],
  };
}

const defaultUIState: EditorUIState = {
  activeTool: 'select',
  leftPanelTab: 'templates',
  leftPanelVisible: true,
  rightPanelVisible: true,
  bottomPanelVisible: false,
  bottomPanelHeight: 200,
  leftPanelWidth: 260,
  rightPanelWidth: 280,
  showGrid: true,
  showRuler: true,
  snapToGrid: true,
};

export const useEditorStore = create<EditorStore>((set, get) => ({
  // 初始状态
  document: createDefaultDocument(),
  activePageIndex: 0,
  selection: {
    selectedIds: [],
    hoveredId: null,
  },
  viewport: {
    scrollX: 0,
    scrollY: 0,
    zoom: { level: 1, minLevel: 0.25, maxLevel: 3 },
  },
  ui: defaultUIState,
  history: [],
  historyIndex: -1,
  isDirty: false,
  past: [],
  future: [],
  clipboard: [],
  resumeId: null,
  isSaving: false,
  saveError: null,
  lastSavedAt: null,
  documentRevision: 0,

  // 文档操作
  setDocument: (doc) =>
    set({
      document: doc,
      isDirty: false,
      past: [],
      future: [],
      activePageIndex: 0,
      selection: { selectedIds: [], hoveredId: null },
      documentRevision: 0,
    }),
  restoreDocument: (doc) =>
    set((state) => {
      const restored = cloneDoc(doc);
      const nextHistory = [
        ...state.history.slice(0, state.historyIndex + 1),
        {
          id: generateId('hist'),
          timestamp: Date.now(),
          description: '从 JSON 备份恢复',
          document: cloneDoc(restored),
        },
      ].slice(-MAX_HISTORY);
      return {
        ...pushPast(state),
        document: restored,
        activePageIndex: 0,
        selection: { selectedIds: [], hoveredId: null },
        history: nextHistory,
        historyIndex: nextHistory.length - 1,
        documentRevision: state.documentRevision + 1,
        isDirty: true,
      };
    }),
  updateDocumentTitle: (title) =>
    set((state) => ({
      document: {
        ...state.document,
        metadata: { ...state.document.metadata, title },
      },
      isDirty: true,
    })),

  applyTemplate: (template) =>
    set((state) => {
      // 深拷贝模板页面并重新生成所有 id, 避免与现有文档冲突
      const pages: ResumePage[] = template.pages.map((page, pi) => ({
        id: generatePageId(),
        pageNumber: pi + 1,
        elements: page.elements.map((el) => JSON.parse(JSON.stringify({ ...el, id: generateElementId(el.type) }))),
        config: page.config,
      }));
      return {
        document: {
          ...state.document,
          templateId: template.id,
          pageConfig: template.pageConfig,
          pages,
        },
        activePageIndex: 0,
        selection: { selectedIds: [], hoveredId: null },
        past: [],
        future: [],
        isDirty: true,
      };
    }),

  applyDocumentTransform: (transform, meta) =>
    set((state) => {
      const next = transform(cloneDoc(state.document));
      const description = meta?.description || (meta?.source === 'ai' ? 'AI 修改' : '文档修改');
      const nextHistory = [
        ...state.history.slice(0, state.historyIndex + 1),
        {
          id: generateId('hist'),
          timestamp: Date.now(),
          description,
          document: cloneDoc(next),
        },
      ].slice(-MAX_HISTORY);
      return {
        ...pushPast(state),
        document: next,
        future: [],
        history: nextHistory,
        historyIndex: nextHistory.length - 1,
        documentRevision: state.documentRevision + 1,
        isDirty: true,
      };
    }),

  // 页面操作
  addPage: () =>
    set((state) => {
      const newPage: ResumePage = {
        id: generatePageId(),
        pageNumber: state.document.pages.length + 1,
        elements: [],
      };
      return {
        ...pushPast(state),
        document: {
          ...state.document,
          pages: [...state.document.pages, newPage],
        },
        isDirty: true,
      };
    }),

  removePage: (pageId) =>
    set((state) => {
      if (state.document.pages.length <= 1) return state;
      const pages = state.document.pages
        .filter((p) => p.id !== pageId)
        .map((p, i) => ({ ...p, pageNumber: i + 1 }));
      return {
        ...pushPast(state),
        document: { ...state.document, pages },
        activePageIndex: Math.min(state.activePageIndex, pages.length - 1),
        isDirty: true,
      };
    }),

  setActivePage: (index) => set({ activePageIndex: index }),

  // ============================================================
  // 元素操作 (按 id 跨页定位)
  // ============================================================
  addElement: (element, pageIndex) =>
    set((state) => {
      const pi = pageIndex ?? state.activePageIndex;
      const pages = [...state.document.pages];
      const page = pages[pi];
      if (!page) return state;
      pages[pi] = { ...page, elements: [...page.elements, element] };
      return {
        ...pushPast(state),
        document: { ...state.document, pages },
        selection: { ...state.selection, selectedIds: [element.id] },
        isDirty: true,
      };
    }),

  removeElement: (elementId) => get().removeElements([elementId]),

  removeElements: (elementIds) =>
    set((state) => {
      const idSet = new Set(elementIds);
      const pages = state.document.pages.map((page) => ({
        ...page,
        elements: page.elements.filter((el) => !idSet.has(el.id)),
      }));
      return {
        ...pushPast(state),
        document: { ...state.document, pages },
        selection: {
          ...state.selection,
          selectedIds: state.selection.selectedIds.filter((id) => !idSet.has(id)),
        },
        isDirty: true,
      };
    }),

  updateElement: (elementId, updates) => get().updateElements({ [elementId]: updates }),

  updateElements: (updatesById) =>
    set((state) => {
      const pages = applyUpdates(state.document.pages, updatesById);
      return {
        ...pushPast(state),
        document: { ...state.document, pages },
        isDirty: true,
      };
    }),

  duplicateElement: (elementId) =>
    set((state) => {
      const loc = locate(state.document.pages, elementId);
      if (!loc) return state;
      const page = state.document.pages[loc.pi];
      const element = page.elements[loc.ei];
      const newElement = {
        ...cloneElement(element),
        left: element.left + 20,
        top: element.top + 20,
      } as ResumeElement;
      const pages = [...state.document.pages];
      pages[loc.pi] = { ...page, elements: [...page.elements, newElement] };
      return {
        ...pushPast(state),
        document: { ...state.document, pages },
        selection: { ...state.selection, selectedIds: [newElement.id] },
        isDirty: true,
      };
    }),

  toggleElementVisibility: (elementId) =>
    set((state) => {
      const loc = locate(state.document.pages, elementId);
      if (!loc) return state;
      const cur = state.document.pages[loc.pi].elements[loc.ei];
      return {
        ...pushPast(state),
        document: {
          ...state.document,
          pages: applyUpdates(state.document.pages, { [elementId]: { visible: !cur.visible } }),
        },
        isDirty: true,
      };
    }),

  toggleElementLock: (elementId) =>
    set((state) => {
      const loc = locate(state.document.pages, elementId);
      if (!loc) return state;
      const cur = state.document.pages[loc.pi].elements[loc.ei];
      return {
        ...pushPast(state),
        document: {
          ...state.document,
          pages: applyUpdates(state.document.pages, { [elementId]: { locked: !cur.locked } }),
        },
        isDirty: true,
      };
    }),

  // ============================================================
  // 层级操作
  // ============================================================
  bringToFront: (elementId) =>
    set((state) => {
      const loc = locate(state.document.pages, elementId);
      if (!loc) return state;
      return (
        transformPageElements(state, loc.pi, (els) => {
          const [el] = els.splice(loc.ei, 1);
          els.push(el);
          return els;
        }) ?? state
      );
    }),

  sendToBack: (elementId) =>
    set((state) => {
      const loc = locate(state.document.pages, elementId);
      if (!loc) return state;
      return (
        transformPageElements(state, loc.pi, (els) => {
          const [el] = els.splice(loc.ei, 1);
          els.unshift(el);
          return els;
        }) ?? state
      );
    }),

  bringForward: (elementId) =>
    set((state) => {
      const loc = locate(state.document.pages, elementId);
      if (!loc) return state;
      return (
        transformPageElements(state, loc.pi, (els) => {
          if (loc.ei < els.length - 1) {
            [els[loc.ei], els[loc.ei + 1]] = [els[loc.ei + 1], els[loc.ei]];
          }
          return els;
        }) ?? state
      );
    }),

  sendBackward: (elementId) =>
    set((state) => {
      const loc = locate(state.document.pages, elementId);
      if (!loc) return state;
      return (
        transformPageElements(state, loc.pi, (els) => {
          if (loc.ei > 0) {
            [els[loc.ei], els[loc.ei - 1]] = [els[loc.ei - 1], els[loc.ei]];
          }
          return els;
        }) ?? state
      );
    }),

  reorderLayer: (pageIndex, fromIndex, toIndex) =>
    set((state) => {
      return (
        transformPageElements(state, pageIndex, (els) => {
          if (fromIndex < 0 || fromIndex >= els.length) return els;
          const [el] = els.splice(fromIndex, 1);
          const clamped = Math.max(0, Math.min(toIndex, els.length));
          els.splice(clamped, 0, el);
          return els;
        }) ?? state
      );
    }),

  // ============================================================
  // 剪贴板
  // ============================================================
  copySelection: () =>
    set((state) => {
      const ids = new Set(state.selection.selectedIds);
      const clip: ResumeElement[] = [];
      for (const page of state.document.pages) {
        for (const el of page.elements) if (ids.has(el.id)) clip.push(JSON.parse(JSON.stringify(el)));
      }
      return { clipboard: clip };
    }),

  cutSelection: () => {
    const { selection, copySelection, removeElements } = get();
    copySelection();
    removeElements([...selection.selectedIds]);
  },

  paste: () =>
    set((state) => {
      if (state.clipboard.length === 0) return state;
      const pi = state.activePageIndex;
      const pages = [...state.document.pages];
      const page = pages[pi];
      if (!page) return state;
      const newEls = state.clipboard.map(
        (el) => ({ ...cloneElement(el, ' (粘贴)'), left: el.left + 20, top: el.top + 20 } as ResumeElement)
      );
      pages[pi] = { ...page, elements: [...page.elements, ...newEls] };
      return {
        ...pushPast(state),
        document: { ...state.document, pages },
        selection: { ...state.selection, selectedIds: newEls.map((e) => e.id) },
        isDirty: true,
      };
    }),

  // ============================================================
  // 对齐 / 分布 (按页分组作用于选区)
  // ============================================================
  alignSelection: (type) =>
    set((state) => {
      const updates = computeSelectionLayout(state, (boxes) => alignBoxes(boxes, type));
      if (Object.keys(updates).length === 0) return state;
      return {
        ...pushPast(state),
        document: { ...state.document, pages: applyUpdates(state.document.pages, updates) },
        isDirty: true,
      };
    }),

  distributeSelection: (type) =>
    set((state) => {
      const updates = computeSelectionLayout(state, (boxes) => distributeBoxes(boxes, type));
      if (Object.keys(updates).length === 0) return state;
      return {
        ...pushPast(state),
        document: { ...state.document, pages: applyUpdates(state.document.pages, updates) },
        isDirty: true,
      };
    }),

  // 选择操作
  selectElement: (id) =>
    set((state) => ({
      selection: { ...state.selection, selectedIds: [id] },
    })),
  selectMultiple: (ids) =>
    set((state) => ({
      selection: { ...state.selection, selectedIds: ids },
    })),
  deselectAll: () =>
    set((state) => ({
      selection: { ...state.selection, selectedIds: [] },
    })),
  setHovered: (id) =>
    set((state) => ({
      selection: { ...state.selection, hoveredId: id },
    })),

  // UI 操作
  setActiveTool: (tool) =>
    set((state) => ({ ui: { ...state.ui, activeTool: tool } })),
  setLeftPanelTab: (tab) =>
    set((state) => ({ ui: { ...state.ui, leftPanelTab: tab } })),
  toggleLeftPanel: () =>
    set((state) => ({ ui: { ...state.ui, leftPanelVisible: !state.ui.leftPanelVisible } })),
  toggleRightPanel: () =>
    set((state) => ({ ui: { ...state.ui, rightPanelVisible: !state.ui.rightPanelVisible } })),
  toggleBottomPanel: () =>
    set((state) => ({ ui: { ...state.ui, bottomPanelVisible: !state.ui.bottomPanelVisible } })),
  setLeftPanelWidth: (width) =>
    set((state) => ({ ui: { ...state.ui, leftPanelWidth: width } })),
  setRightPanelWidth: (width) =>
    set((state) => ({ ui: { ...state.ui, rightPanelWidth: width } })),
  setBottomPanelHeight: (height) =>
    set((state) => ({ ui: { ...state.ui, bottomPanelHeight: height } })),
  toggleGrid: () =>
    set((state) => ({ ui: { ...state.ui, showGrid: !state.ui.showGrid } })),
  toggleRuler: () =>
    set((state) => ({ ui: { ...state.ui, showRuler: !state.ui.showRuler } })),
  toggleSnap: () =>
    set((state) => ({ ui: { ...state.ui, snapToGrid: !state.ui.snapToGrid } })),

  // 缩放
  setZoom: (level) =>
    set((state) => ({
      viewport: {
        ...state.viewport,
        zoom: { ...state.viewport.zoom, level: Math.max(0.25, Math.min(3, level)) },
      },
    })),
  zoomIn: () => {
    const { viewport } = get();
    set({
      viewport: {
        ...viewport,
        zoom: { ...viewport.zoom, level: Math.min(3, viewport.zoom.level + 0.1) },
      },
    });
  },
  zoomOut: () => {
    const { viewport } = get();
    set({
      viewport: {
        ...viewport,
        zoom: { ...viewport.zoom, level: Math.max(0.25, viewport.zoom.level - 0.1) },
      },
    });
  },
  zoomToFit: () =>
    set((state) => ({
      viewport: { ...state.viewport, zoom: { ...state.viewport.zoom, level: 0.75 } },
    })),

  // 历史
  markDirty: () => set({ isDirty: true }),
  markClean: () => set({ isDirty: false }),
  undo: () =>
    set((state) => {
      if (state.past.length === 0) return state;
      const previous = state.past[state.past.length - 1];
      return {
        document: previous,
        past: state.past.slice(0, -1),
        future: [cloneDoc(state.document), ...state.future].slice(0, MAX_HISTORY),
        activePageIndex: Math.min(state.activePageIndex, previous.pages.length - 1),
        selection: { selectedIds: [], hoveredId: null },
        isDirty: true,
      };
    }),
  redo: () =>
    set((state) => {
      if (state.future.length === 0) return state;
      const next = state.future[0];
      return {
        document: next,
        past: [...state.past, cloneDoc(state.document)].slice(-MAX_HISTORY),
        future: state.future.slice(1),
        activePageIndex: Math.min(state.activePageIndex, next.pages.length - 1),
        selection: { selectedIds: [], hoveredId: null },
        isDirty: true,
      };
    }),

  // 持久化
  setResumeId: (id) => set({ resumeId: id }),
  setSaveState: (s) => set(s),
}));

// ============================================================
// 辅助: 对选区按页分组计算布局更新
// ============================================================
function computeSelectionLayout(
  state: EditorStore,
  compute: (boxes: AlignBox[]) => { id: string; left?: number; top?: number }[]
): Record<string, Partial<ResumeElement>> {
  const ids = new Set(state.selection.selectedIds);
  const updates: Record<string, Partial<ResumeElement>> = {};

  for (const page of state.document.pages) {
    const selected = page.elements.filter((el) => ids.has(el.id));
    if (selected.length < 2) continue;
    const boxes: AlignBox[] = selected.map((el) => ({
      id: el.id,
      left: el.left,
      top: el.top,
      width: el.width,
      height: el.height,
    }));
    for (const r of compute(boxes)) {
      const patch: Partial<ResumeElement> = {};
      if (r.left !== undefined) patch.left = r.left;
      if (r.top !== undefined) patch.top = r.top;
      updates[r.id] = patch;
    }
  }
  return updates;
}

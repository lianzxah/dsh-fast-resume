import type { ResumeDocument, ResumePage, PageConfig } from './document';

// ============================================================
// 编辑器状态类型
// ============================================================

/** 编辑工具类型 */
export type EditorTool = 'select' | 'text' | 'shape' | 'image' | 'hand';

/** 左侧面板标签 */
export type LeftPanelTab = 'templates' | 'components' | 'layers' | 'pages';

/** 缩放级别 */
export interface ZoomState {
  level: number; // 0.1 ~ 5.0
  minLevel: number;
  maxLevel: number;
}

/** 视口状态 */
export interface ViewportState {
  scrollX: number;
  scrollY: number;
  zoom: ZoomState;
}

/** 选择状态 */
export interface SelectionState {
  selectedIds: string[];
  hoveredId: string | null;
}

/** 历史操作记录 */
export interface HistoryEntry {
  id: string;
  timestamp: number;
  description: string;
  document: ResumeDocument;
}

/** 编辑器UI状态 */
export interface EditorUIState {
  activeTool: EditorTool;
  leftPanelTab: LeftPanelTab;
  leftPanelVisible: boolean;
  rightPanelVisible: boolean;
  bottomPanelVisible: boolean;
  bottomPanelHeight: number;
  leftPanelWidth: number;
  rightPanelWidth: number;
  showGrid: boolean;
  showRuler: boolean;
  snapToGrid: boolean;
}

/** 编辑器全局状态 */
export interface EditorState {
  /** 当前文档 */
  document: ResumeDocument;
  /** 当前活动页面索引 */
  activePageIndex: number;
  /** 选择状态 */
  selection: SelectionState;
  /** 视口状态 */
  viewport: ViewportState;
  /** UI状态 */
  ui: EditorUIState;
  /** 历史记录 */
  history: HistoryEntry[];
  historyIndex: number;
  /** 是否有未保存修改 */
  isDirty: boolean;
}

// ============================================================
// 模版类型
// ============================================================

/** 模版分类 */
export type TemplateCategory = 'classic' | 'modern' | 'creative' | 'academic';

/** 模版主题色 */
export interface TemplateTheme {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  textColor: string;
  backgroundColor: string;
}

/** 简历模版定义 */
export interface ResumeTemplate {
  id: string;
  name: string;
  description: string;
  category: TemplateCategory;
  thumbnail: string;
  theme: TemplateTheme;
  pageConfig: PageConfig;
  pages: ResumePage[];
}

// ============================================================
// 事件类型
// ============================================================

export type EditorEventType =
  | 'element:add'
  | 'element:remove'
  | 'element:update'
  | 'element:select'
  | 'element:deselect'
  | 'page:add'
  | 'page:remove'
  | 'page:reorder'
  | 'document:save'
  | 'document:load'
  | 'history:undo'
  | 'history:redo'
  | 'zoom:change'
  | 'tool:change';

export interface EditorEvent {
  type: EditorEventType;
  payload?: unknown;
  timestamp: number;
}

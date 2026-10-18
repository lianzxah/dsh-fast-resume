// ============================================================
// @resume-editor/canvas-engine
// 基于 Konva / react-konva 的画布渲染引擎
//   - core: 框架无关核心逻辑 (尺寸换算 / 元素映射 / 吸附对齐 / 导出)
//   - react: react-konva 交互层 (ResumeCanvas 及其子组件)
//   - element-factory: 元素工厂
//   - history-manager: 撤销/重做历史管理
// ============================================================

// 框架无关核心层
export * from './core';

// react-konva 适配层
export * from './react';

// 元素工厂
export {
  createTextElement,
  createHeadingElement,
  createImageElement,
  createShapeElement,
  createDividerElement,
} from './element-factory';

// 撤销/重做历史管理
export { HistoryManager } from './history-manager';
export type { HistoryEntry, HistoryManagerOptions } from './history-manager';

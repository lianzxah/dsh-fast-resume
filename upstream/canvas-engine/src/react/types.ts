import type Konva from 'konva';
import type { ResumeElement } from '@resume-editor/shared';
import type { ElementGeometry } from '../core/element-mapper';

// ============================================================
// react 适配层共享回调类型
// ============================================================

export interface ElementCallbacks {
  /** 选中元素 (additive 表示 shift/meta 多选) */
  onSelect: (id: string, additive: boolean) => void;
  /** 元素几何/属性变更 (拖拽/缩放/旋转/文本编辑后) */
  onChange: (id: string, updates: Partial<ResumeElement>) => void;
  /** 一次交互结束 (用于提交历史快照) */
  onCommit: () => void;
  /** 拖拽过程中: 由画布计算吸附并直接修改节点位置, 返回是否发生吸附 */
  onDragMove: (el: ResumeElement, node: Konva.Node) => void;
  /** 拖拽结束: 清理吸附参考线 */
  onDragEndExtra: () => void;
  /** 请求进入文本内联编辑 */
  onRequestTextEdit: (id: string) => void;
  /** 注册/注销 Konva 节点引用 (供 Transformer 绑定) */
  registerNode: (id: string, node: Konva.Node | null) => void;
}

export type { ElementGeometry };

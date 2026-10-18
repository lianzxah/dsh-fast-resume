// ============================================================
// 吸附与对齐 (框架无关的纯逻辑)
// 计算拖拽元素相对于网格、其他元素、页面边界/中心的吸附位置，
// 并输出需要绘制的对齐参考线。
// ============================================================

/** 包围盒 */
export interface SnapBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** 对齐参考线 (线段两端点) */
export interface SnapGuide {
  orientation: 'vertical' | 'horizontal';
  /** 线所在的坐标 (vertical -> x, horizontal -> y) */
  position: number;
}

export interface SnapResult {
  left: number;
  top: number;
  guides: SnapGuide[];
}

export interface SnapOptions {
  gridSize?: number;
  snapToGrid?: boolean;
  /** 对齐吸附阈值 (px) */
  threshold?: number;
  page: { width: number; height: number };
}

interface Candidate {
  /** 目标线坐标 */
  line: number;
  /** 移动盒需要对齐的锚点相对偏移 (0=起点, size/2=中点, size=终点) */
  offset: number;
}

function edgeCandidates(page: { width: number; height: number }, axis: 'x' | 'y', targets: SnapBox[]) {
  const lines: number[] = [];
  // 页面边界与中心
  if (axis === 'x') {
    lines.push(0, page.width / 2, page.width);
    for (const t of targets) lines.push(t.left, t.left + t.width / 2, t.left + t.width);
  } else {
    lines.push(0, page.height / 2, page.height);
    for (const t of targets) lines.push(t.top, t.top + t.height / 2, t.top + t.height);
  }
  return lines;
}

/**
 * 计算吸附结果。
 * @param moving 当前拖拽元素的包围盒 (期望位置)
 * @param targets 其他元素的包围盒
 */
export function computeSnap(moving: SnapBox, targets: SnapBox[], options: SnapOptions): SnapResult {
  const threshold = options.threshold ?? 6;
  const guides: SnapGuide[] = [];

  let left = moving.left;
  let top = moving.top;

  // ---- 水平方向 (x) 对齐 ----
  const xLines = edgeCandidates(options.page, 'x', targets);
  const xAnchors: Candidate[] = [
    { line: moving.left, offset: 0 },
    { line: moving.left + moving.width / 2, offset: moving.width / 2 },
    { line: moving.left + moving.width, offset: moving.width },
  ];
  let bestX: { dist: number; left: number; guide: number } | null = null;
  for (const anchor of xAnchors) {
    for (const line of xLines) {
      const dist = Math.abs(anchor.line - line);
      if (dist <= threshold && (!bestX || dist < bestX.dist)) {
        bestX = { dist, left: line - anchor.offset, guide: line };
      }
    }
  }
  if (bestX) {
    left = bestX.left;
    guides.push({ orientation: 'vertical', position: bestX.guide });
  } else if (options.snapToGrid && options.gridSize) {
    left = Math.round(moving.left / options.gridSize) * options.gridSize;
  }

  // ---- 垂直方向 (y) 对齐 ----
  const yLines = edgeCandidates(options.page, 'y', targets);
  const yAnchors: Candidate[] = [
    { line: moving.top, offset: 0 },
    { line: moving.top + moving.height / 2, offset: moving.height / 2 },
    { line: moving.top + moving.height, offset: moving.height },
  ];
  let bestY: { dist: number; top: number; guide: number } | null = null;
  for (const anchor of yAnchors) {
    for (const line of yLines) {
      const dist = Math.abs(anchor.line - line);
      if (dist <= threshold && (!bestY || dist < bestY.dist)) {
        bestY = { dist, top: line - anchor.offset, guide: line };
      }
    }
  }
  if (bestY) {
    top = bestY.top;
    guides.push({ orientation: 'horizontal', position: bestY.guide });
  } else if (options.snapToGrid && options.gridSize) {
    top = Math.round(moving.top / options.gridSize) * options.gridSize;
  }

  return { left, top, guides };
}

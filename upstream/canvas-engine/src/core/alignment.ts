// ============================================================
// 对齐与分布 (框架无关的纯逻辑)
// 对一组元素包围盒计算对齐/等距分布后的新坐标。
// ============================================================

export interface AlignBox {
  id: string;
  left: number;
  top: number;
  width: number;
  height: number;
}

/** 对齐方式 */
export type AlignType = 'left' | 'center-h' | 'right' | 'top' | 'middle-v' | 'bottom';

/** 分布方式 */
export type DistributeType = 'horizontal' | 'vertical';

/** 坐标更新结果 */
export interface PositionUpdate {
  id: string;
  left?: number;
  top?: number;
}

/** 计算一组盒子的并集包围盒 */
function unionBounds(boxes: AlignBox[]) {
  const minLeft = Math.min(...boxes.map((b) => b.left));
  const minTop = Math.min(...boxes.map((b) => b.top));
  const maxRight = Math.max(...boxes.map((b) => b.left + b.width));
  const maxBottom = Math.max(...boxes.map((b) => b.top + b.height));
  return { minLeft, minTop, maxRight, maxBottom };
}

/**
 * 对齐一组元素 (相对于选区并集包围盒)。
 * 至少 2 个元素时生效。
 */
export function alignBoxes(boxes: AlignBox[], type: AlignType): PositionUpdate[] {
  if (boxes.length < 2) return [];
  const { minLeft, minTop, maxRight, maxBottom } = unionBounds(boxes);
  const centerX = (minLeft + maxRight) / 2;
  const centerY = (minTop + maxBottom) / 2;

  return boxes.map((b) => {
    switch (type) {
      case 'left':
        return { id: b.id, left: Math.round(minLeft) };
      case 'center-h':
        return { id: b.id, left: Math.round(centerX - b.width / 2) };
      case 'right':
        return { id: b.id, left: Math.round(maxRight - b.width) };
      case 'top':
        return { id: b.id, top: Math.round(minTop) };
      case 'middle-v':
        return { id: b.id, top: Math.round(centerY - b.height / 2) };
      case 'bottom':
        return { id: b.id, top: Math.round(maxBottom - b.height) };
      default:
        return { id: b.id };
    }
  });
}

/**
 * 等距分布一组元素 (相邻间隙相等)。
 * 至少 3 个元素时生效。
 */
export function distributeBoxes(boxes: AlignBox[], type: DistributeType): PositionUpdate[] {
  if (boxes.length < 3) return [];

  if (type === 'horizontal') {
    const sorted = [...boxes].sort((a, b) => a.left - b.left);
    const minLeft = sorted[0].left;
    const last = sorted[sorted.length - 1];
    const maxRight = last.left + last.width;
    const totalWidth = sorted.reduce((sum, b) => sum + b.width, 0);
    const gap = (maxRight - minLeft - totalWidth) / (sorted.length - 1);

    const updates: PositionUpdate[] = [];
    let cursor = minLeft;
    for (const b of sorted) {
      updates.push({ id: b.id, left: Math.round(cursor) });
      cursor += b.width + gap;
    }
    return updates;
  }

  // vertical
  const sorted = [...boxes].sort((a, b) => a.top - b.top);
  const minTop = sorted[0].top;
  const last = sorted[sorted.length - 1];
  const maxBottom = last.top + last.height;
  const totalHeight = sorted.reduce((sum, b) => sum + b.height, 0);
  const gap = (maxBottom - minTop - totalHeight) / (sorted.length - 1);

  const updates: PositionUpdate[] = [];
  let cursor = minTop;
  for (const b of sorted) {
    updates.push({ id: b.id, top: Math.round(cursor) });
    cursor += b.height + gap;
  }
  return updates;
}

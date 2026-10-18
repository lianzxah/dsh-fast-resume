import type Konva from 'konva';
import type {
  ResumeElement,
  TextElement,
  ImageElement,
  ShapeElement,
  FontWeight,
  FontStyle,
} from '@resume-editor/shared';

// ============================================================
// 元素映射器 (框架无关)
// 负责在 ResumeElement 数据模型 <-> Konva 节点属性 之间转换。
// 这些函数返回纯粹的属性对象，既可用于 react-konva 组件 (<Rect {...attrs} />)，
// 也可用于命令式构建 (new Konva.Rect(attrs))，从而在交互渲染与导出渲染之间复用。
// ============================================================

/** 元素几何信息 (统一的包围盒表示) */
export interface ElementGeometry {
  left: number;
  top: number;
  width: number;
  height: number;
  rotation: number;
}

/** 元素最小尺寸限制 */
export const MIN_ELEMENT_SIZE = 4;

export function normalizeElementSize(value: number): number {
  return Math.max(MIN_ELEMENT_SIZE, finiteOr(value, MIN_ELEMENT_SIZE));
}

export function normalizeNonNegative(value: number, fallback = 0): number {
  return Math.max(0, finiteOr(value, fallback));
}

export function normalizeCornerRadius(radius: number, width: number, height: number): number {
  const maxRadius = Math.min(normalizeElementSize(width), normalizeElementSize(height)) / 2;
  return Math.min(normalizeNonNegative(radius), maxRadius);
}

/** 形状渲染类别 */
export type ShapeKind = 'rect' | 'ellipse' | 'line' | 'triangle' | 'polygon';

/** 判断形状元素应使用哪种 Konva 图元渲染 */
export function getShapeKind(el: ShapeElement): ShapeKind {
  switch (el.shapeType) {
    case 'circle':
    case 'ellipse':
      return 'ellipse';
    case 'line':
      return 'line';
    case 'triangle':
      return 'triangle';
    case 'diamond':
    case 'parallelogram':
    case 'trapezoid':
    case 'pentagon':
    case 'hexagon':
    case 'star':
    case 'callout':
      return 'polygon';
    case 'rectangle':
    case 'roundedRectangle':
    default:
      return 'rect';
  }
}

/**
 * 计算多边形形状的顶点 (盒内相对坐标, 左上角为原点)。
 * 用于 diamond/parallelogram/trapezoid/pentagon/hexagon/star/callout。
 */
export function getPolygonPoints(el: ShapeElement): number[] {
  const w = normalizeElementSize(el.width);
  const h = normalizeElementSize(el.height);
  switch (el.shapeType) {
    case 'diamond':
      return [w / 2, 0, w, h / 2, w / 2, h, 0, h / 2];
    case 'parallelogram': {
      const k = w * 0.25;
      return [k, 0, w, 0, w - k, h, 0, h];
    }
    case 'trapezoid': {
      const k = w * 0.2;
      return [k, 0, w - k, 0, w, h, 0, h];
    }
    case 'callout': {
      const bodyH = h * 0.78;
      return [0, 0, w, 0, w, bodyH, w * 0.34, bodyH, w * 0.2, h, w * 0.22, bodyH, 0, bodyH];
    }
    case 'pentagon':
      return regularPolygonPoints(5, w, h);
    case 'hexagon':
      return regularPolygonPoints(6, w, h);
    case 'star':
      return starPoints(5, w, h, 0.5);
    default:
      // 兜底: 矩形四角
      return [0, 0, w, 0, w, h, 0, h];
  }
}

/** 生成填满包围盒的正多边形顶点 (椭圆内接) */
function regularPolygonPoints(sides: number, w: number, h: number): number[] {
  const cx = w / 2;
  const cy = h / 2;
  const rx = w / 2;
  const ry = h / 2;
  const pts: number[] = [];
  for (let i = 0; i < sides; i++) {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / sides;
    pts.push(cx + rx * Math.cos(angle), cy + ry * Math.sin(angle));
  }
  return pts;
}

/** 生成填满包围盒的星形顶点 */
function starPoints(numPoints: number, w: number, h: number, innerRatio: number): number[] {
  const cx = w / 2;
  const cy = h / 2;
  const rx = w / 2;
  const ry = h / 2;
  const pts: number[] = [];
  for (let i = 0; i < numPoints * 2; i++) {
    const isOuter = i % 2 === 0;
    const factor = isOuter ? 1 : innerRatio;
    const angle = -Math.PI / 2 + (i * Math.PI) / numPoints;
    pts.push(cx + rx * factor * Math.cos(angle), cy + ry * factor * Math.sin(angle));
  }
  return pts;
}

// ------------------------------------------------------------
// 文本样式组合
// ------------------------------------------------------------

/** 将 fontWeight / fontStyle 组合为 Konva 的 fontStyle 字符串 */
export function composeFontStyle(weight: FontWeight, style: FontStyle): string {
  const parts: string[] = [];
  if (style === 'italic') parts.push('italic');
  const isBold =
    weight === 'bold' || (typeof weight === 'string' && /^[6-9]00$/.test(weight));
  if (isBold) parts.push('bold');
  return parts.join(' ') || 'normal';
}

/** 组合文本装饰线 (下划线 / 删除线) */
export function composeTextDecoration(underline: boolean, strikethrough: boolean): string {
  const parts: string[] = [];
  if (underline) parts.push('underline');
  if (strikethrough) parts.push('line-through');
  return parts.join(' ');
}

// ------------------------------------------------------------
// 元素 -> Konva 属性
// ------------------------------------------------------------

/** 所有元素共享的基础属性 */
function baseAttrs(el: ResumeElement) {
  return {
    id: el.id,
    name: el.name,
    x: el.left,
    y: el.top,
    rotation: el.rotation,
    opacity: el.opacity,
    visible: el.visible,
    // 注意: listening 仅与可见性相关, 不再与 locked 绑定。
    // 锁定元素仍需响应右键 (以便右键解锁); 拖拽/变换/框选由交互层按 locked 拦截。
    listening: el.visible,
    draggable: !el.locked,
  };
}

export function toTextAttrs(el: TextElement): Konva.TextConfig {
  return {
    ...baseAttrs(el),
    width: normalizeElementSize(el.width),
    height: normalizeElementSize(el.height),
    text: el.content,
    fontSize: el.fontSize,
    fontFamily: el.fontFamily,
    fontStyle: composeFontStyle(el.fontWeight, el.fontStyle),
    textDecoration: composeTextDecoration(el.underline, el.strikethrough),
    fill: el.color,
    align: el.textAlign,
    lineHeight: el.lineHeight,
    letterSpacing: el.letterSpacing,
    ...(el.backgroundColor ? { fillAfterStrokeEnabled: true } : {}),
  };
}

export function toRectAttrs(el: ShapeElement): Konva.RectConfig {
  const width = normalizeElementSize(el.width);
  const height = normalizeElementSize(el.height);
  return {
    ...baseAttrs(el),
    width,
    height,
    fill: el.fill,
    stroke: el.strokeColor,
    strokeWidth: normalizeNonNegative(el.strokeWidth),
    cornerRadius: normalizeCornerRadius(el.borderRadius, width, height),
  };
}

export function toEllipseAttrs(el: ShapeElement): Konva.EllipseConfig {
  const width = normalizeElementSize(el.width);
  const height = normalizeElementSize(el.height);
  const radiusX = width / 2;
  const radiusY = height / 2;
  return {
    ...baseAttrs(el),
    // Ellipse 以中心为原点，需换算为包围盒中心
    x: el.left + radiusX,
    y: el.top + radiusY,
    radiusX,
    radiusY,
    fill: el.fill,
    stroke: el.strokeColor,
    strokeWidth: normalizeNonNegative(el.strokeWidth),
  };
}

export function toLineAttrs(el: ShapeElement): Konva.LineConfig {
  const width = normalizeElementSize(el.width);
  const height = normalizeNonNegative(el.height, 2);
  const strokeWidth = normalizeNonNegative(el.strokeWidth, 2);
  return {
    ...baseAttrs(el),
    points: [0, height / 2, width, height / 2],
    stroke: el.strokeColor,
    strokeWidth: strokeWidth || 2,
    hitStrokeWidth: Math.max(strokeWidth, 10),
    lineCap: 'round',
  };
}

export function toTriangleAttrs(el: ShapeElement): Konva.LineConfig {
  const width = normalizeElementSize(el.width);
  const height = normalizeElementSize(el.height);
  return {
    ...baseAttrs(el),
    points: [width / 2, 0, width, height, 0, height],
    closed: true,
    fill: el.fill,
    stroke: el.strokeColor,
    strokeWidth: normalizeNonNegative(el.strokeWidth),
  };
}

/** 多边形 (diamond/parallelogram/trapezoid/pentagon/hexagon/star/callout) */
export function toPolygonAttrs(el: ShapeElement): Konva.LineConfig {
  return {
    ...baseAttrs(el),
    points: getPolygonPoints(el),
    closed: true,
    fill: el.fill,
    stroke: el.strokeColor,
    strokeWidth: normalizeNonNegative(el.strokeWidth),
    lineJoin: 'round',
  };
}

export function toImageAttrs(el: ImageElement): Konva.ImageConfig {
  const width = normalizeElementSize(el.width);
  const height = normalizeElementSize(el.height);
  return {
    ...baseAttrs(el),
    width,
    height,
    cornerRadius: normalizeCornerRadius(el.borderRadius, width, height),
    // image 属性由渲染层注入 (需异步加载)
  } as Konva.ImageConfig;
}

// ------------------------------------------------------------
// Konva 节点 -> 元素几何信息 (读回变换结果)
// scaleX/scaleY 为变换过程中累积的缩放；在调用前调用方应先重置节点 scale=1
// ------------------------------------------------------------

export function readGeometry(
  el: ResumeElement,
  node: Konva.Node,
  scaleX = 1,
  scaleY = 1
): ElementGeometry {
  const rotation = node.rotation();
  // 含文本的元素以 Group 渲染, 统一按左上角 + width/height 处理
  const grouped = node.getClassName?.() === 'Group';

  if (!grouped && el.type === 'shape' && getShapeKind(el) === 'ellipse') {
    const ellipse = node as Konva.Ellipse;
    const radiusX = Math.max(MIN_ELEMENT_SIZE / 2, ellipse.radiusX() * scaleX);
    const radiusY = Math.max(MIN_ELEMENT_SIZE / 2, ellipse.radiusY() * scaleY);
    return {
      left: node.x() - radiusX,
      top: node.y() - radiusY,
      width: radiusX * 2,
      height: radiusY * 2,
      rotation,
    };
  }

  if (!grouped && el.type === 'shape' && getShapeKind(el) === 'line') {
    const width = Math.max(MIN_ELEMENT_SIZE, el.width * scaleX);
    return {
      left: node.x(),
      top: node.y(),
      width,
      height: el.height,
      rotation,
    };
  }

  // rect / triangle / text / image : 均以左上角 x/y + width/height 表示
  const width = Math.max(MIN_ELEMENT_SIZE, ('width' in el ? el.width : node.width()) * scaleX);
  const height = Math.max(MIN_ELEMENT_SIZE, ('height' in el ? el.height : node.height()) * scaleY);
  return {
    left: node.x(),
    top: node.y(),
    width,
    height,
    rotation,
  };
}

// ------------------------------------------------------------
// 包围盒左上角坐标读写 (用于拖拽吸附时的坐标统一)
// ------------------------------------------------------------

/** 获取节点当前包围盒左上角坐标 */
export function getNodeTopLeft(el: ResumeElement, node: Konva.Node): { x: number; y: number } {
  const grouped = node.getClassName?.() === 'Group';
  if (!grouped && el.type === 'shape' && getShapeKind(el) === 'ellipse') {
    const ellipse = node as Konva.Ellipse;
    return { x: node.x() - ellipse.radiusX(), y: node.y() - ellipse.radiusY() };
  }
  return { x: node.x(), y: node.y() };
}

/** 依据包围盒左上角坐标设置节点位置 */
export function setNodeTopLeft(el: ResumeElement, node: Konva.Node, x: number, y: number): void {
  const grouped = node.getClassName?.() === 'Group';
  if (!grouped && el.type === 'shape' && getShapeKind(el) === 'ellipse') {
    const ellipse = node as Konva.Ellipse;
    node.x(x + ellipse.radiusX());
    node.y(y + ellipse.radiusY());
    return;
  }
  node.x(x);
  node.y(y);
}

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

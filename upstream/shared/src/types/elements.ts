// ============================================================
// 基础元素类型定义
// ============================================================

/** 元素类型枚举 */
export type ElementType = 'text' | 'image' | 'shape' | 'group';

/** 简历语义引用: 用于把画布元素绑定到 ResumeData 中的段落 / 条目 / 字段 */
export interface ResumeSemanticRef {
  section:
    | 'personalInfo'
    | 'summary'
    | 'experience'
    | 'education'
    | 'skills'
    | 'projects'
    | 'certifications'
    | 'custom';
  itemId?: string;
  field?: string;
  role?: 'sectionTitle' | 'itemTitle' | 'itemBody' | 'metadata' | 'decorative';
}

/** 元素外部链接: PDF 导出时会生成可点击区域 */
export interface ElementLink {
  url: string;
  title?: string;
}

/** 形状类型 (参考 PowerPoint 常用形状) */
export type ShapeType =
  | 'rectangle'
  | 'roundedRectangle'
  | 'circle'
  | 'ellipse'
  | 'triangle'
  | 'diamond'
  | 'parallelogram'
  | 'trapezoid'
  | 'pentagon'
  | 'hexagon'
  | 'star'
  | 'callout'
  | 'line';

/** 文本对齐 */
export type TextAlign = 'left' | 'center' | 'right' | 'justify';

/** 字体样式 */
export type FontStyle = 'normal' | 'italic';

/** 字体粗细 */
export type FontWeight = 'normal' | 'bold' | '100' | '200' | '300' | '400' | '500' | '600' | '700' | '800' | '900';

// ============================================================
// 富文本 (轻量 marks 分段模型)
// 说明: 在保持 content 纯文本向后兼容的前提下, 通过可选的 segments
// 描述局部内联样式 (如鼠标选中区间加粗)。当 segments 缺省时, 使用元素级
// 样式渲染整段文本; 当存在 segments 时, 逐段应用样式并整体换行布局。
// ============================================================

/** 内联样式标记 (缺省表示继承元素级样式) */
export interface TextMark {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  /** 局部颜色覆盖 (缺省继承元素级 color) */
  color?: string;
}

/** 富文本片段: 一段连续且样式一致的文本 */
export interface TextSegment extends TextMark {
  text: string;
}

// ============================================================
// 元素位置与变换
// ============================================================

/** 2D 坐标点 */
export interface Point {
  x: number;
  y: number;
}

/** 元素包围盒 */
export interface BoundingBox {
  left: number;
  top: number;
  width: number;
  height: number;
  rotation: number;
}

/** 边框样式 */
export interface BorderStyle {
  color: string;
  width: number;
  style: 'solid' | 'dashed' | 'dotted' | 'none';
}

/** 阴影样式 */
export interface ShadowStyle {
  color: string;
  offsetX: number;
  offsetY: number;
  blur: number;
}

// ============================================================
// 元素定义
// ============================================================

/** 元素基础属性 */
export interface BaseElement {
  id: string;
  type: ElementType;
  name: string;
  /** 可选语义绑定，AI/导入/模板可据此稳定定位简历结构 */
  semanticRef?: ResumeSemanticRef;
  /** 可选链接，视觉可由文字、Icon、图片或形状承载 */
  link?: ElementLink;
  left: number;
  top: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  visible: boolean;
  locked: boolean;
  border?: BorderStyle;
  shadow?: ShadowStyle;
  zIndex: number;
}

/** 文本元素 */
export interface TextElement extends BaseElement {
  type: 'text';
  content: string;
  fontSize: number;
  fontFamily: string;
  fontWeight: FontWeight;
  fontStyle: FontStyle;
  textAlign: TextAlign;
  lineHeight: number;
  letterSpacing: number;
  color: string;
  backgroundColor?: string;
  underline: boolean;
  strikethrough: boolean;
  /**
   * 富文本分段 (可选)。存在且非空时, 覆盖元素级 fontWeight/fontStyle/underline/
   * strikethrough/color, 逐段渲染; content 始终保存为各段文本拼接的纯文本,
   * 用于导入/搜索/向后兼容。
   */
  segments?: TextSegment[];
}

/** 图片元素 */
export type ImageRole = 'image' | 'icon' | 'linkIcon';

export interface ImageElement extends BaseElement {
  type: 'image';
  /** 图片用途: 普通图片、业务图标、可点击业务图标 */
  imageRole?: ImageRole;
  /** 业务图标预设 ID，用于右侧面板切换 SVG 图标 */
  iconPresetId?: string;
  src: string;
  originalWidth: number;
  originalHeight: number;
  cropX: number;
  cropY: number;
  cropWidth: number;
  cropHeight: number;
  borderRadius: number;
  objectFit: 'cover' | 'contain' | 'fill';
}

/** 形状元素 */
export interface ShapeElement extends BaseElement {
  type: 'shape';
  shapeType: ShapeType;
  fill: string;
  strokeColor: string;
  strokeWidth: number;
  borderRadius: number;
  // ---- 形状内文本 (可选, 参考 PowerPoint 形状可输入文本) ----
  /** 纯文本内容 (为各段文本拼接) */
  text?: string;
  /** 富文本分段 (局部样式) */
  segments?: TextSegment[];
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: FontWeight;
  fontStyle?: FontStyle;
  textColor?: string;
  textAlign?: TextAlign;
  lineHeight?: number;
  letterSpacing?: number;
}

/** 组合元素 */
export interface GroupElement extends BaseElement {
  type: 'group';
  children: ResumeElement[];
}

/** 简历元素联合类型 */
export type ResumeElement = TextElement | ImageElement | ShapeElement | GroupElement;

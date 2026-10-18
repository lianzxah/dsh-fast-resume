import type {
  TextElement,
  ShapeElement,
  TextSegment,
  TextAlign,
  FontWeight,
  FontStyle,
} from '@resume-editor/shared';
import { composeFontStyle, composeTextDecoration } from './element-mapper';

// ============================================================
// 富文本布局 (框架无关)
// 轻量 marks 分段模型的核心: 将带局部样式的 segments 布局为一组带坐标的
// "run" (可直接映射为 Konva.Text)。同时被交互渲染层与导出渲染层复用,
// 保证所见即所得。
// ============================================================

/** 单个已定位文本 run (盒内相对坐标, 左上角为原点) */
export interface PositionedRun {
  x: number;
  y: number;
  text: string;
  fontSize: number;
  fontFamily: string;
  /** Konva fontStyle 字符串 (如 'bold italic') */
  fontStyle: string;
  /** Konva textDecoration 字符串 (如 'underline line-through') */
  textDecoration: string;
  fill: string;
}

/** 富文本布局所需的元素级基础样式 */
export interface RichTextStyle {
  width: number;
  fontSize: number;
  fontFamily: string;
  fontWeight: FontWeight;
  fontStyle: FontStyle;
  underline: boolean;
  strikethrough: boolean;
  color: string;
  textAlign: TextAlign;
  lineHeight: number;
  letterSpacing: number;
}

export interface RichTextLayout {
  runs: PositionedRun[];
  /** 内容总高度 (行数 * 行高) */
  height: number;
}

// ------------------------------------------------------------
// 测量用离屏 canvas (模块级复用)
// ------------------------------------------------------------
let measureCtx: CanvasRenderingContext2D | null = null;
function getMeasureCtx(): CanvasRenderingContext2D | null {
  if (measureCtx) return measureCtx;
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  measureCtx = canvas.getContext('2d');
  return measureCtx;
}

function cssFont(seg: ResolvedSegment): string {
  const parts: string[] = [];
  if (seg.italic) parts.push('italic');
  if (seg.bold) parts.push('bold');
  parts.push(`${seg.fontSize}px`);
  parts.push(seg.fontFamily);
  return parts.join(' ');
}

/** 已解析样式的片段 (marks 合并元素级样式后的最终样式) */
interface ResolvedSegment {
  text: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strikethrough: boolean;
  color: string;
  fontSize: number;
  fontFamily: string;
}

/** 将 segments 与元素级样式合并为最终样式片段 */
function resolveSegments(segments: TextSegment[], style: RichTextStyle): ResolvedSegment[] {
  const baseBold =
    style.fontWeight === 'bold' ||
    (typeof style.fontWeight === 'string' && /^[6-9]00$/.test(style.fontWeight));
  return segments
    .filter((s) => s.text.length > 0)
    .map((s) => ({
      text: s.text,
      bold: s.bold ?? baseBold,
      italic: s.italic ?? style.fontStyle === 'italic',
      underline: s.underline ?? style.underline,
      strikethrough: s.strikethrough ?? style.strikethrough,
      color: s.color ?? style.color,
      fontSize: style.fontSize,
      fontFamily: style.fontFamily,
    }));
}

/** 一个待排版的 token, 携带其来源片段样式 */
interface Token {
  text: string;
  seg: ResolvedSegment;
  hardBreak: boolean; // 该 token 之后是否强制换行 (\n)
}

/** 判断是否为 CJK 字符 (需在其两侧允许换行) */
function isCJK(ch: string): boolean {
  const code = ch.codePointAt(0) ?? 0;
  return (
    (code >= 0x4e00 && code <= 0x9fff) ||
    (code >= 0x3400 && code <= 0x4dbf) ||
    (code >= 0x3040 && code <= 0x30ff) ||
    (code >= 0xac00 && code <= 0xd7af) ||
    (code >= 0xff00 && code <= 0xffef)
  );
}

/** 将片段切分为 token (CJK 单字成 token; 拉丁按空格分词, 空格随前词) */
function tokenizeSegment(seg: ResolvedSegment): Token[] {
  const tokens: Token[] = [];
  const lines = seg.text.split('\n');
  lines.forEach((line, li) => {
    let buffer = '';
    const flush = () => {
      if (buffer) {
        tokens.push({ text: buffer, seg, hardBreak: false });
        buffer = '';
      }
    };
    for (const ch of line) {
      if (isCJK(ch)) {
        flush();
        tokens.push({ text: ch, seg, hardBreak: false });
      } else if (ch === ' ') {
        buffer += ch;
        flush();
      } else {
        buffer += ch;
      }
    }
    flush();
    // 行尾 (除最后一行) 追加硬换行标记
    if (li < lines.length - 1) {
      if (tokens.length > 0) {
        tokens[tokens.length - 1].hardBreak = true;
      } else {
        tokens.push({ text: '', seg, hardBreak: true });
      }
    }
  });
  return tokens;
}

function measureToken(t: Token, letterSpacing: number): number {
  const ctx = getMeasureCtx();
  if (!ctx) return t.text.length * t.seg.fontSize * 0.6 + letterSpacing * t.text.length;
  ctx.font = cssFont(t.seg);
  return ctx.measureText(t.text).width + letterSpacing * t.text.length;
}

/** 行内合成的 run 记录 (合并同片段相邻 token) */
interface LineItem {
  token: Token;
  width: number;
}

/**
 * 富文本布局: 将 segments 依据宽度换行为带坐标的 run 列表。
 */
export function layoutRichText(segments: TextSegment[], style: RichTextStyle): RichTextLayout {
  const resolved = resolveSegments(segments, style);
  const letterSpacing = style.letterSpacing || 0;
  const lineHeightPx = style.fontSize * (style.lineHeight || 1.2);

  // 1) 生成全部 token
  const tokens: Token[] = [];
  for (const seg of resolved) tokens.push(...tokenizeSegment(seg));

  // 2) 贪心换行, 生成逐行的 LineItem
  const lines: LineItem[][] = [];
  let current: LineItem[] = [];
  let currentWidth = 0;

  const pushLine = () => {
    lines.push(current);
    current = [];
    currentWidth = 0;
  };

  for (const token of tokens) {
    const w = measureToken(token, letterSpacing);
    const isSpaceOnly = token.text.trim().length === 0 && token.text.length > 0;
    if (!isSpaceOnly && currentWidth + w > style.width && current.length > 0) {
      pushLine();
    }
    current.push({ token, width: w });
    currentWidth += w;
    if (token.hardBreak) pushLine();
  }
  if (current.length > 0) pushLine();
  if (lines.length === 0) lines.push([]);

  // 3) 逐行定位, 合并同片段相邻 token 为 run
  const runs: PositionedRun[] = [];
  lines.forEach((line, lineIndex) => {
    const lineWidth = line.reduce((sum, it) => sum + it.width, 0);
    let offsetX = 0;
    if (style.textAlign === 'center') offsetX = Math.max(0, (style.width - lineWidth) / 2);
    else if (style.textAlign === 'right') offsetX = Math.max(0, style.width - lineWidth);

    const lineTop = lineIndex * lineHeightPx;
    let x = offsetX;
    let i = 0;
    while (i < line.length) {
      const seg = line[i].token.seg;
      let text = '';
      let runWidth = 0;
      const startX = x;
      // 合并相邻同片段 token
      while (i < line.length && line[i].token.seg === seg) {
        text += line[i].token.text;
        runWidth += line[i].width;
        x += line[i].width;
        i++;
      }
      const trimmed = text.replace(/\s+$/, '');
      if (trimmed.length > 0) {
        runs.push({
          x: startX,
          // 行内基线对齐 (同尺寸时即顶对齐)
          y: lineTop,
          text,
          fontSize: seg.fontSize,
          fontFamily: seg.fontFamily,
          fontStyle:
            composeFontStyle(seg.bold ? 'bold' : 'normal', seg.italic ? 'italic' : 'normal'),
          textDecoration: composeTextDecoration(seg.underline, seg.strikethrough),
          fill: seg.color,
        });
      }
      void runWidth;
    }
  });

  return { runs, height: lines.length * lineHeightPx };
}

// ------------------------------------------------------------
// 元素 -> 富文本样式 / segments 解析
// ------------------------------------------------------------

/** 文本元素是否使用富文本 (存在非空 segments) */
export function hasRichText(el: TextElement | ShapeElement): boolean {
  return Array.isArray(el.segments) && el.segments.some((s) => s.text.length > 0);
}

/** 文本元素的纯文本 (优先 segments 拼接) */
export function getPlainText(el: TextElement): string {
  if (Array.isArray(el.segments) && el.segments.length > 0) {
    return el.segments.map((s) => s.text).join('');
  }
  return el.content;
}

/** 由文本元素构建富文本布局样式 */
export function textElementStyle(el: TextElement): RichTextStyle {
  return {
    width: el.width,
    fontSize: el.fontSize,
    fontFamily: el.fontFamily,
    fontWeight: el.fontWeight,
    fontStyle: el.fontStyle,
    underline: el.underline,
    strikethrough: el.strikethrough,
    color: el.color,
    textAlign: el.textAlign,
    lineHeight: el.lineHeight,
    letterSpacing: el.letterSpacing,
  };
}

/** 文本元素的 segments (缺省则由 content 构建单段) */
export function textElementSegments(el: TextElement): TextSegment[] {
  if (hasRichText(el)) return el.segments as TextSegment[];
  return [{ text: el.content }];
}

/** 布局文本元素 (盒内相对坐标) */
export function layoutTextElement(el: TextElement): RichTextLayout {
  return layoutRichText(textElementSegments(el), textElementStyle(el));
}

// ------------------------------------------------------------
// 形状内文本
// ------------------------------------------------------------

/** 形状文本内边距 */
export const SHAPE_TEXT_PADDING = 8;

/** 形状是否含文本 */
export function shapeHasText(el: ShapeElement): boolean {
  return Boolean((el.text && el.text.length > 0) || hasRichText(el));
}

/** 形状文本的纯文本 */
export function shapeText(el: ShapeElement): string {
  if (Array.isArray(el.segments) && el.segments.length > 0) {
    return el.segments.map((s) => s.text).join('');
  }
  return el.text ?? '';
}

/** 由形状构建富文本布局样式 (含默认值) */
export function shapeTextStyle(el: ShapeElement): RichTextStyle {
  return {
    width: Math.max(1, el.width - SHAPE_TEXT_PADDING * 2),
    fontSize: el.fontSize ?? 14,
    fontFamily: el.fontFamily ?? 'Microsoft YaHei, sans-serif',
    fontWeight: el.fontWeight ?? 'normal',
    fontStyle: el.fontStyle ?? 'normal',
    underline: false,
    strikethrough: false,
    color: el.textColor ?? '#1f2937',
    textAlign: el.textAlign ?? 'center',
    lineHeight: el.lineHeight ?? 1.3,
    letterSpacing: el.letterSpacing ?? 0,
  };
}

/** 形状 segments (缺省则由 text 构建单段) */
export function shapeSegments(el: ShapeElement): TextSegment[] {
  if (hasRichText(el)) return el.segments as TextSegment[];
  return [{ text: el.text ?? '' }];
}

/** 布局形状内文本 (垂直居中于形状盒内, 返回相对形状左上角坐标) */
export function layoutShapeText(el: ShapeElement): RichTextLayout {
  const style = shapeTextStyle(el);
  const layout = layoutRichText(shapeSegments(el), style);
  // 垂直居中 + 水平内边距偏移
  const offsetY = Math.max(SHAPE_TEXT_PADDING, (el.height - layout.height) / 2);
  const runs = layout.runs.map((r) => ({
    ...r,
    x: r.x + SHAPE_TEXT_PADDING,
    y: r.y + offsetY,
  }));
  return { runs, height: layout.height };
}

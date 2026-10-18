import React, { useEffect, useRef, useState } from 'react';
import type { TextSegment, FontWeight, FontStyle, TextAlign } from '@resume-editor/shared';

// ============================================================
// 富文本内联编辑 overlay (contenteditable)
// 支持:
//   - Enter 直接换行 (提交改为 失焦 / Esc取消 / Ctrl+Enter)
//   - 鼠标选中局部文字后, 通过工具条或快捷键局部加粗/斜体/下划线/删除线
// 提交时将 DOM 解析为轻量 marks 分段模型 (segments) + 纯文本 (content)。
// 复用于文本元素与形状内文本。
// ============================================================

export interface RichTextEditorOverlayProps {
  left: number;
  top: number;
  width: number;
  height: number;
  zoom: number;
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
  /** 形状文本垂直居中 */
  verticalCenter?: boolean;
  initialSegments?: TextSegment[];
  initialContent: string;
  onCommit: (result: { segments?: TextSegment[]; content: string }) => void;
  onClose: () => void;
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** 由 segments / 纯文本 构建初始 HTML */
function buildInitialHtml(segments: TextSegment[] | undefined, content: string): string {
  if (segments && segments.length > 0) {
    return segments
      .map((seg) => {
        const lines = seg.text.split('\n').map(escapeHtml).join('<br>');
        const styles: string[] = [];
        if (seg.bold) styles.push('font-weight:bold');
        if (seg.italic) styles.push('font-style:italic');
        const deco: string[] = [];
        if (seg.underline) deco.push('underline');
        if (seg.strikethrough) deco.push('line-through');
        if (deco.length) styles.push(`text-decoration:${deco.join(' ')}`);
        if (seg.color) styles.push(`color:${seg.color}`);
        return `<span style="${styles.join(';')}">${lines || '\u200b'}</span>`;
      })
      .join('');
  }
  return escapeHtml(content).split('\n').join('<br>');
}

interface Marks {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strikethrough: boolean;
  color?: string;
}

/** 递归解析 contenteditable DOM 为分段 */
function parseNode(node: Node, inherited: Marks, out: TextSegment[]): void {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent ?? '';
    if (text.length > 0) {
      out.push({ text, ...normalizeMarks(inherited) });
    }
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return;
  const el = node as HTMLElement;
  const tag = el.tagName;

  if (tag === 'BR') {
    out.push({ text: '\n', ...normalizeMarks(inherited) });
    return;
  }

  // 块级元素前补换行 (第一个块除外)
  const isBlock = tag === 'DIV' || tag === 'P';
  if (isBlock && out.length > 0) {
    out.push({ text: '\n', ...normalizeMarks(inherited) });
  }

  const marks: Marks = { ...inherited };
  if (tag === 'B' || tag === 'STRONG') marks.bold = true;
  if (tag === 'I' || tag === 'EM') marks.italic = true;
  if (tag === 'U') marks.underline = true;
  if (tag === 'S' || tag === 'STRIKE' || tag === 'DEL') marks.strikethrough = true;

  const style = el.style;
  if (style) {
    if (style.fontWeight === 'bold' || Number(style.fontWeight) >= 600) marks.bold = true;
    if (style.fontStyle === 'italic') marks.italic = true;
    if (style.textDecoration.includes('underline') || style.textDecorationLine?.includes('underline')) marks.underline = true;
    if (style.textDecoration.includes('line-through') || style.textDecorationLine?.includes('line-through')) marks.strikethrough = true;
    if (style.color) marks.color = style.color;
  }
  const fontColor = el.getAttribute('color');
  if (fontColor) marks.color = fontColor;

  node.childNodes.forEach((child) => parseNode(child, marks, out));
}

function normalizeMarks(m: Marks): Omit<TextSegment, 'text'> {
  const r: Omit<TextSegment, 'text'> = {};
  if (m.bold) r.bold = true;
  if (m.italic) r.italic = true;
  if (m.underline) r.underline = true;
  if (m.strikethrough) r.strikethrough = true;
  if (m.color) r.color = m.color;
  return r;
}

/** 合并相邻同样式片段 */
function mergeSegments(segs: TextSegment[]): TextSegment[] {
  const merged: TextSegment[] = [];
  for (const s of segs) {
    const last = merged[merged.length - 1];
    if (
      last &&
      Boolean(last.bold) === Boolean(s.bold) &&
      Boolean(last.italic) === Boolean(s.italic) &&
      Boolean(last.underline) === Boolean(s.underline) &&
      Boolean(last.strikethrough) === Boolean(s.strikethrough) &&
      last.color === s.color
    ) {
      last.text += s.text;
    } else {
      merged.push({ ...s });
    }
  }
  return merged.filter((s) => s.text.length > 0);
}

export const RichTextEditorOverlay: React.FC<RichTextEditorOverlayProps> = (props) => {
  const {
    left, top, width, height, zoom,
    fontSize, fontFamily, fontWeight, fontStyle,
    underline, strikethrough, color, textAlign, lineHeight, letterSpacing,
    verticalCenter, initialSegments, initialContent, onCommit, onClose,
  } = props;

  const ref = useRef<HTMLDivElement>(null);
  const committedRef = useRef(false);
  const [, force] = useState(0);

  useEffect(() => {
    const div = ref.current;
    if (!div) return;
    div.innerHTML = buildInitialHtml(initialSegments, initialContent);
    div.focus();
    // 选区置于末尾
    const range = document.createRange();
    range.selectNodeContents(div);
    range.collapse(false);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const baseBold = fontWeight === 'bold' || (typeof fontWeight === 'string' && /^[6-9]00$/.test(fontWeight));
  const baseItalic = fontStyle === 'italic';

  const commit = () => {
    if (committedRef.current) return;
    committedRef.current = true;
    const div = ref.current;
    if (!div) {
      onClose();
      return;
    }
    const raw: TextSegment[] = [];
    div.childNodes.forEach((child) =>
      parseNode(child, { bold: false, italic: false, underline: false, strikethrough: false }, raw)
    );
    const segments = mergeSegments(raw);
    const content = segments.map((s) => s.text).join('');

    // 判断是否为统一样式 (与元素级一致) — 若统一则回退纯文本路径
    const uniform = segments.every(
      (s) =>
        Boolean(s.bold) === baseBold &&
        Boolean(s.italic) === baseItalic &&
        Boolean(s.underline) === underline &&
        Boolean(s.strikethrough) === strikethrough &&
        !s.color
    );
    onCommit({ segments: uniform ? undefined : segments, content });
    onClose();
  };

  const exec = (command: string, value?: string) => {
    document.execCommand(command, false, value);
    ref.current?.focus();
    force((n) => n + 1);
  };

  const ToolbarBtn: React.FC<{ cmd: string; label: string; title: string; style?: React.CSSProperties }> = ({ cmd, label, title, style }) => (
    <button
      title={title}
      // 用 mousedown preventDefault 保持选区与焦点
      onMouseDown={(e) => {
        e.preventDefault();
        exec(cmd);
      }}
      className="w-6 h-6 flex items-center justify-center rounded text-slate-600 hover:bg-slate-100 text-xs"
      style={style}
    >
      {label}
    </button>
  );

  return (
    <>
      {/* 局部样式工具条 */}
      <div
        style={{
          position: 'absolute',
          left: left * zoom,
          top: top * zoom - 34,
          zIndex: 30,
        }}
        className="flex items-center gap-0.5 px-1 py-0.5 bg-white rounded-md shadow-lg border border-slate-200"
      >
        <ToolbarBtn cmd="bold" label="B" title="加粗 (Ctrl+B)" style={{ fontWeight: 'bold' }} />
        <ToolbarBtn cmd="italic" label="I" title="斜体 (Ctrl+I)" style={{ fontStyle: 'italic' }} />
        <ToolbarBtn cmd="underline" label="U" title="下划线 (Ctrl+U)" style={{ textDecoration: 'underline' }} />
        <ToolbarBtn cmd="strikeThrough" label="S" title="删除线" style={{ textDecoration: 'line-through' }} />
        <input
          type="color"
          title="文字颜色"
          className="w-5 h-5 p-0 border-0 bg-transparent cursor-pointer"
          onMouseDown={(e) => e.stopPropagation()}
          onChange={(e) => exec('foreColor', e.target.value)}
        />
      </div>

      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            committedRef.current = true; // 取消: 不提交
            onClose();
            return;
          }
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            commit();
            return;
          }
          // Enter 换行 = contenteditable 默认行为, 不拦截
          e.stopPropagation();
        }}
        style={{
          position: 'absolute',
          left: left * zoom,
          top: top * zoom,
          width: width * zoom,
          height: height * zoom,
          fontSize: fontSize * zoom,
          fontFamily,
          fontWeight: baseBold ? 'bold' : 'normal',
          fontStyle: baseItalic ? 'italic' : 'normal',
          lineHeight,
          letterSpacing: letterSpacing * zoom,
          color,
          textAlign,
          margin: 0,
          padding: verticalCenter ? `${8 * zoom}px` : 0,
          border: '1px solid #3b82f6',
          outline: 'none',
          background: 'rgba(255,255,255,0.9)',
          overflow: 'hidden',
          boxSizing: 'border-box',
          display: verticalCenter ? 'flex' : 'block',
          flexDirection: 'column',
          justifyContent: verticalCenter ? 'center' : 'flex-start',
          zIndex: 20,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      />
    </>
  );
};

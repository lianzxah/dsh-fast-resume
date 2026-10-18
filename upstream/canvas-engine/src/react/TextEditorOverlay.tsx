import React, { useEffect, useRef, useState } from 'react';
import type { TextElement } from '@resume-editor/shared';
import { composeFontStyle } from '../core/element-mapper';

// ============================================================
// 文本内联编辑 overlay
// 在画布上方叠加 HTML textarea, 实现所见即所得的文本编辑。
// 位置/尺寸/字体按当前 zoom 换算, 与 Konva 文本对齐。
// ============================================================

interface TextEditorOverlayProps {
  element: TextElement;
  zoom: number;
  onCommit: (content: string) => void;
  onClose: () => void;
}

export const TextEditorOverlay: React.FC<TextEditorOverlayProps> = ({
  element,
  zoom,
  onCommit,
  onClose,
}) => {
  const [value, setValue] = useState(element.content);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const ta = ref.current;
    if (ta) {
      ta.focus();
      ta.select();
    }
  }, []);

  const commit = () => {
    onCommit(value);
    onClose();
  };

  const fontStyle = composeFontStyle(element.fontWeight, element.fontStyle);
  const isItalic = fontStyle.includes('italic');
  const isBold = fontStyle.includes('bold');

  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          onClose();
        }
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          commit();
        }
        e.stopPropagation();
      }}
      style={{
        position: 'absolute',
        left: element.left * zoom,
        top: element.top * zoom,
        width: element.width * zoom,
        height: element.height * zoom,
        fontSize: element.fontSize * zoom,
        fontFamily: element.fontFamily,
        fontWeight: isBold ? 'bold' : 'normal',
        fontStyle: isItalic ? 'italic' : 'normal',
        lineHeight: element.lineHeight,
        letterSpacing: element.letterSpacing * zoom,
        color: element.color,
        textAlign: element.textAlign,
        margin: 0,
        padding: 0,
        border: '1px solid #3b82f6',
        outline: 'none',
        background: 'rgba(255,255,255,0.85)',
        resize: 'none',
        overflow: 'hidden',
        boxSizing: 'border-box',
        zIndex: 20,
      }}
    />
  );
};

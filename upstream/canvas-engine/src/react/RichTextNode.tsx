import React from 'react';
import { Group, Rect, Text } from 'react-konva';
import type Konva from 'konva';
import type { TextElement } from '@resume-editor/shared';
import { layoutTextElement } from '../core/rich-text';

// ============================================================
// 富文本节点
// 以 Konva.Group 承载: 背景 + 透明命中区 + 逐段样式的多个 Text run。
// 布局由框架无关的 layoutTextElement 计算, 与导出层复用。
// 交互 (选择/拖拽/变换) 统一绑定在 Group 上。
// ============================================================

interface RichTextNodeProps {
  element: TextElement;
  /** 交互事件集合 (来自 ElementNode 的 commonProps) */
  konvaProps: Record<string, unknown>;
  setRef: (node: Konva.Node | null) => void;
  visible: boolean;
  onDblClick: (e: Konva.KonvaEventObject<MouseEvent>) => void;
}

export const RichTextNode: React.FC<RichTextNodeProps> = ({
  element,
  konvaProps,
  setRef,
  visible,
  onDblClick,
}) => {
  const { runs } = layoutTextElement(element);

  return (
    <Group
      ref={setRef as never}
      id={element.id}
      name={element.name}
      x={element.left}
      y={element.top}
      rotation={element.rotation}
      opacity={element.opacity}
      visible={visible}
      width={element.width}
      height={element.height}
      {...konvaProps}
      onDblClick={onDblClick}
      onDblTap={onDblClick}
    >
      {element.backgroundColor && (
        <Rect x={0} y={0} width={element.width} height={element.height} fill={element.backgroundColor} listening={false} />
      )}
      {/* 透明命中区域: 保证整框可点选/拖拽 */}
      <Rect x={0} y={0} width={element.width} height={element.height} fill="transparent" />
      {runs.map((r, i) => (
        <Text
          key={i}
          x={r.x}
          y={r.y}
          text={r.text}
          fontSize={r.fontSize}
          fontFamily={r.fontFamily}
          fontStyle={r.fontStyle}
          textDecoration={r.textDecoration}
          fill={r.fill}
          lineHeight={element.lineHeight}
          letterSpacing={element.letterSpacing}
          listening={false}
        />
      ))}
    </Group>
  );
};

import React from 'react';
import { Group, Rect, Ellipse, Line, Text } from 'react-konva';
import type Konva from 'konva';
import type { ShapeElement } from '@resume-editor/shared';
import {
  getShapeKind,
  getPolygonPoints,
  normalizeCornerRadius,
  normalizeElementSize,
  normalizeNonNegative,
} from '../core/element-mapper';
import { layoutShapeText } from '../core/rich-text';

// ============================================================
// 形状节点 (含文本)
// 以 Konva.Group 承载: 形状图元 + 透明命中区 + 居中富文本 run。
// 仅当形状含文本时使用; 无文本形状仍由 ElementNode 直接渲染单一图元。
// ============================================================

interface ShapeNodeProps {
  element: ShapeElement;
  konvaProps: Record<string, unknown>;
  setRef: (node: Konva.Node | null) => void;
  onDblClick: (e: Konva.KonvaEventObject<MouseEvent>) => void;
}

export const ShapeNode: React.FC<ShapeNodeProps> = ({ element, konvaProps, setRef, onDblClick }) => {
  const kind = getShapeKind(element);
  const { runs } = layoutShapeText(element);
  const w = normalizeElementSize(element.width);
  const h = normalizeElementSize(element.height);
  const figureFill = {
    fill: element.fill,
    stroke: element.strokeColor,
    strokeWidth: normalizeNonNegative(element.strokeWidth),
    listening: false,
  } as const;

  const figure = (() => {
    if (kind === 'ellipse') {
      return <Ellipse x={w / 2} y={h / 2} radiusX={w / 2} radiusY={h / 2} {...figureFill} />;
    }
    if (kind === 'triangle') {
      return <Line points={[w / 2, 0, w, h, 0, h]} closed {...figureFill} />;
    }
    if (kind === 'polygon') {
      return <Line points={getPolygonPoints(element)} closed lineJoin="round" {...figureFill} />;
    }
    if (kind === 'line') {
      return <Line points={[0, h / 2, w, h / 2]} stroke={element.strokeColor} strokeWidth={normalizeNonNegative(element.strokeWidth, 2) || 2} listening={false} />;
    }
    return <Rect x={0} y={0} width={w} height={h} cornerRadius={normalizeCornerRadius(element.borderRadius, w, h)} {...figureFill} />;
  })();

  return (
    <Group
      ref={setRef as never}
      id={element.id}
      name={element.name}
      x={element.left}
      y={element.top}
      rotation={element.rotation}
      opacity={element.opacity}
      visible={element.visible}
      width={w}
      height={h}
      {...konvaProps}
      onDblClick={onDblClick}
      onDblTap={onDblClick}
    >
      {figure}
      {/* 透明命中区域 */}
      <Rect x={0} y={0} width={w} height={h} fill="transparent" />
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
          listening={false}
        />
      ))}
    </Group>
  );
};

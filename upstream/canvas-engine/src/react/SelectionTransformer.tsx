import React, { useEffect, useRef } from 'react';
import { Transformer } from 'react-konva';
import type Konva from 'konva';
import type { ResumeElement } from '@resume-editor/shared';
import { getShapeKind, MIN_ELEMENT_SIZE } from '../core/element-mapper';

// ============================================================
// 选择变换器
// 将 Konva.Transformer 绑定到当前选中的节点, 支持缩放/旋转。
// ============================================================

interface SelectionTransformerProps {
  selectedElements: ResumeElement[];
  getNode: (id: string) => Konva.Node | undefined;
}

export const SelectionTransformer: React.FC<SelectionTransformerProps> = ({
  selectedElements,
  getNode,
}) => {
  const trRef = useRef<Konva.Transformer>(null);

  useEffect(() => {
    const tr = trRef.current;
    if (!tr) return;

    const nodes = selectedElements
      .filter((el) => !el.locked)
      .map((el) => getNode(el.id))
      .filter((n): n is Konva.Node => Boolean(n));

    tr.nodes(nodes);
    tr.getLayer()?.batchDraw();
  }, [selectedElements, getNode]);

  // 单选线条时限制为水平拉伸锚点
  const onlyLine =
    selectedElements.length === 1 &&
    selectedElements[0].type === 'shape' &&
    getShapeKind(selectedElements[0]) === 'line';

  const enabledAnchors = onlyLine
    ? ['middle-left', 'middle-right']
    : undefined; // undefined = 全部锚点

  return (
    <Transformer
      ref={trRef}
      rotateEnabled
      rotationSnaps={[0, 45, 90, 135, 180, 225, 270, 315]}
      keepRatio={false}
      ignoreStroke
      enabledAnchors={enabledAnchors}
      anchorSize={8}
      anchorStroke="#3b82f6"
      anchorFill="#ffffff"
      anchorCornerRadius={2}
      borderStroke="#3b82f6"
      borderStrokeWidth={1}
      boundBoxFunc={(oldBox, newBox) => {
        if (newBox.width < MIN_ELEMENT_SIZE || newBox.height < MIN_ELEMENT_SIZE) {
          return oldBox;
        }
        return newBox;
      }}
    />
  );
};

import React, { useCallback } from 'react';
import { Text, Rect, Ellipse, Line } from 'react-konva';
import type Konva from 'konva';
import type { ResumeElement } from '@resume-editor/shared';
import {
  toTextAttrs,
  toRectAttrs,
  toEllipseAttrs,
  toLineAttrs,
  toTriangleAttrs,
  toPolygonAttrs,
  getShapeKind,
  readGeometry,
  MIN_ELEMENT_SIZE,
} from '../core/element-mapper';
import { hasRichText, shapeHasText } from '../core/rich-text';
import type { ElementCallbacks } from './types';
import { ImageElementNode } from './ImageElementNode';
import { RichTextNode } from './RichTextNode';
import { ShapeNode } from './ShapeNode';

// ============================================================
// 元素节点分发器
// 根据元素类型渲染对应的 Konva 图元, 并统一处理选择/拖拽/变换/编辑事件。
// ============================================================

interface ElementNodeProps extends ElementCallbacks {
  element: ResumeElement;
  /** 是否允许交互 (select 工具下为 true) */
  interactive: boolean;
  /** 是否处于文本编辑中 (编辑时隐藏 Konva 文本, 由 overlay 接管) */
  editing: boolean;
}

export const ElementNode: React.FC<ElementNodeProps> = ({
  element,
  interactive,
  editing,
  onSelect,
  onChange,
  onCommit,
  onDragMove,
  onDragEndExtra,
  onRequestTextEdit,
  registerNode,
}) => {
  const draggable = interactive && !element.locked;

  const setRef = useCallback(
    (node: Konva.Node | null) => {
      registerNode(element.id, node);
    },
    [element.id, registerNode]
  );

  const handleSelect = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      e.cancelBubble = true;
      const additive = e.evt.shiftKey || e.evt.metaKey || e.evt.ctrlKey;
      onSelect(element.id, additive);
    },
    [element.id, onSelect]
  );

  const handleDragStart = useCallback(
    (e: Konva.KonvaEventObject<DragEvent>) => {
      e.cancelBubble = true;
      onSelect(element.id, false);
    },
    [element.id, onSelect]
  );

  const handleDragMove = useCallback(
    (e: Konva.KonvaEventObject<DragEvent>) => {
      onDragMove(element, e.target);
    },
    [element, onDragMove]
  );

  const handleDragEnd = useCallback(
    (e: Konva.KonvaEventObject<DragEvent>) => {
      const geo = readGeometry(element, e.target, 1, 1);
      onChange(element.id, { left: Math.round(geo.left), top: Math.round(geo.top) });
      onDragEndExtra();
      onCommit();
    },
    [element, onChange, onCommit, onDragEndExtra]
  );

  const handleTransformEnd = useCallback(
    (e: Konva.KonvaEventObject<Event>) => {
      const node = e.target;
      const scaleX = node.scaleX();
      const scaleY = node.scaleY();
      node.scaleX(1);
      node.scaleY(1);
      const geo = readGeometry(element, node, scaleX, scaleY);
      onChange(element.id, {
        left: Math.round(geo.left),
        top: Math.round(geo.top),
        width: Math.round(geo.width),
        height: Math.round(geo.height),
        rotation: Math.round(geo.rotation),
      });
      onCommit();
    },
    [element, onChange, onCommit]
  );

  const handleTextDblClick = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      if (element.locked) return; // 锁定元素不允许编辑
      e.cancelBubble = true;
      onRequestTextEdit(element.id);
    },
    [element.id, element.locked, onRequestTextEdit]
  );

  // 交互事件集合 (供各图元共享)
  const commonProps = {
    onClick: handleSelect,
    onTap: handleSelect,
    draggable,
    onDragStart: handleDragStart,
    onDragMove: handleDragMove,
    onDragEnd: handleDragEnd,
    onTransformEnd: handleTransformEnd,
  };

  switch (element.type) {
    case 'text':
      // 富文本 (含 segments) 走 Group 多段渲染; 纯文本走原生 Konva.Text (支持原生换行)
      if (hasRichText(element)) {
        return (
          <RichTextNode
            element={element}
            konvaProps={commonProps}
            setRef={setRef}
            visible={element.visible && !editing}
            onDblClick={handleTextDblClick}
          />
        );
      }
      return (
        <Text
          ref={setRef as never}
          {...toTextAttrs(element)}
          visible={element.visible && !editing}
          {...commonProps}
          onDblClick={handleTextDblClick}
          onDblTap={handleTextDblClick}
        />
      );

    case 'image':
      return <ImageElementNode element={element} konvaProps={commonProps} setRef={setRef} />;

    case 'shape': {
      // 含文本的形状: 以 Group 渲染 (图元 + 居中文本), 双击进入文本编辑
      if (shapeHasText(element)) {
        return (
          <ShapeNode
            element={element}
            konvaProps={commonProps}
            setRef={setRef}
            onDblClick={handleTextDblClick}
          />
        );
      }
      const kind = getShapeKind(element);
      const shapeDbl = { onDblClick: handleTextDblClick, onDblTap: handleTextDblClick };
      if (kind === 'ellipse') {
        return <Ellipse ref={setRef as never} {...toEllipseAttrs(element)} {...commonProps} {...shapeDbl} />;
      }
      if (kind === 'line') {
        return <Line ref={setRef as never} {...toLineAttrs(element)} {...commonProps} {...shapeDbl} />;
      }
      if (kind === 'triangle') {
        return <Line ref={setRef as never} {...toTriangleAttrs(element)} {...commonProps} {...shapeDbl} />;
      }
      if (kind === 'polygon') {
        return <Line ref={setRef as never} {...toPolygonAttrs(element)} {...commonProps} {...shapeDbl} />;
      }
      return <Rect ref={setRef as never} {...toRectAttrs(element)} {...commonProps} {...shapeDbl} />;
    }

    default:
      return null;
  }
};

export { MIN_ELEMENT_SIZE };

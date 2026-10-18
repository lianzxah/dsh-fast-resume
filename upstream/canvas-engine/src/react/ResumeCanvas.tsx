import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Stage, Layer, Line, Rect } from 'react-konva';
import type Konva from 'konva';
import type {
  ResumePage,
  PageConfig,
  ResumeElement,
  TextElement,
  ShapeElement,
  EditorTool,
} from '@resume-editor/shared';
import { getPageMetrics } from '../core/page-metrics';
import { computeSnap } from '../core/snapping';
import { getNodeTopLeft, setNodeTopLeft } from '../core/element-mapper';
import {
  shapeText,
  shapeTextStyle,
  textElementStyle,
} from '../core/rich-text';
import type { SnapGuide } from '../core/snapping';
import { ElementNode } from './ElementNode';
import { PageBackground } from './PageBackground';
import { SelectionTransformer } from './SelectionTransformer';
import { RichTextEditorOverlay } from './RichTextEditorOverlay';

// ============================================================
// ResumeCanvas - react-konva 画布容器 (交互层入口)
// 负责: 页面渲染、元素渲染、选择/拖拽/缩放/旋转、吸附对齐、文本内联编辑。
// 状态由外部 (store) 通过 props 驱动, 保持组件与状态管理解耦。
// ============================================================

export interface ResumeCanvasProps {
  page: ResumePage;
  pageConfig: PageConfig;
  zoom: number;
  selectedIds: string[];
  activeTool: EditorTool;
  showGrid?: boolean;
  showGuides?: boolean;
  snapToGrid?: boolean;
  gridSize?: number;
  /** Konva Stage 引用 (供导出使用) */
  stageRef?: React.MutableRefObject<Konva.Stage | null>;
  onSelectionChange: (ids: string[]) => void;
  onElementChange: (id: string, updates: Partial<ResumeElement>) => void;
  /** 一次交互结束, 提交历史 */
  onCommit?: () => void;
  /** 在空白处使用工具点击 (逻辑坐标) */
  onCanvasClick?: (pos: { x: number; y: number }) => void;
  /** 右键上下文菜单 (client 坐标 + 命中元素 id) */
  onContextMenu?: (payload: { clientX: number; clientY: number; elementId: string | null }) => void;
}

export const ResumeCanvas: React.FC<ResumeCanvasProps> = ({
  page,
  pageConfig,
  zoom,
  selectedIds,
  activeTool,
  showGrid = false,
  showGuides = true,
  snapToGrid = false,
  gridSize = 20,
  stageRef,
  onSelectionChange,
  onElementChange,
  onCommit,
  onCanvasClick,
  onContextMenu,
}) => {
  const metrics = useMemo(() => getPageMetrics(pageConfig), [pageConfig]);
  const nodeRefs = useRef<Map<string, Konva.Node>>(new Map());
  const [guides, setGuides] = useState<SnapGuide[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [marquee, setMarquee] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const marqueeStart = useRef<{ x: number; y: number } | null>(null);

  const interactive = activeTool === 'select';

  // 排序后的元素 (按 zIndex)
  const sortedElements = useMemo(
    () => [...page.elements].sort((a, b) => a.zIndex - b.zIndex),
    [page.elements]
  );

  const selectedElements = useMemo(
    () => page.elements.filter((el) => selectedIds.includes(el.id)),
    [page.elements, selectedIds]
  );

  // ---- 节点引用管理 ----
  const registerNode = useCallback((id: string, node: Konva.Node | null) => {
    if (node) nodeRefs.current.set(id, node);
    else nodeRefs.current.delete(id);
  }, []);

  const getNode = useCallback((id: string) => nodeRefs.current.get(id), []);

  // ---- 选择 ----
  const handleSelect = useCallback(
    (id: string, additive: boolean) => {
      if (additive) {
        const next = selectedIds.includes(id)
          ? selectedIds.filter((x) => x !== id)
          : [...selectedIds, id];
        onSelectionChange(next);
      } else {
        onSelectionChange([id]);
      }
    },
    [selectedIds, onSelectionChange]
  );

  // ---- 拖拽吸附 ----
  const handleDragMove = useCallback(
    (el: ResumeElement, node: Konva.Node) => {
      const tl = getNodeTopLeft(el, node);
      const targets = page.elements
        .filter((e) => e.id !== el.id && e.visible)
        .map((e) => ({ left: e.left, top: e.top, width: e.width, height: e.height }));

      const result = computeSnap(
        { left: tl.x, top: tl.y, width: el.width, height: el.height },
        targets,
        {
          page: { width: metrics.widthPx, height: metrics.heightPx },
          gridSize,
          snapToGrid,
          threshold: 6,
        }
      );

      setNodeTopLeft(el, node, result.left, result.top);
      setGuides(result.guides);
    },
    [page.elements, metrics.widthPx, metrics.heightPx, gridSize, snapToGrid]
  );

  const handleDragEndExtra = useCallback(() => {
    setGuides([]);
  }, []);

  // ---- 文本内联编辑 (文本元素 / 形状内文本) ----
  const handleRequestTextEdit = useCallback((id: string) => {
    setEditingId(id);
  }, []);

  const editingElement = editingId
    ? (page.elements.find(
        (el) => el.id === editingId && (el.type === 'text' || el.type === 'shape')
      ) as TextElement | ShapeElement | undefined)
    : undefined;

  // ---- Stage 空白区域: 框选 / 工具添加 / 取消选择 ----
  const handleStageMouseDown = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
      const stage = e.target.getStage();
      if (e.target !== stage) return; // 点击到元素则忽略

      const pos = stage?.getRelativePointerPosition();
      if (activeTool === 'select') {
        // 开始框选
        if (pos) {
          marqueeStart.current = { x: pos.x, y: pos.y };
          setMarquee({ x: pos.x, y: pos.y, w: 0, h: 0 });
        }
      } else if (activeTool !== 'hand') {
        if (pos) onCanvasClick?.({ x: pos.x, y: pos.y });
      }
    },
    [activeTool, onCanvasClick]
  );

  const handleStageMouseMove = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
      if (!marqueeStart.current) return;
      const stage = e.target.getStage();
      const pos = stage?.getRelativePointerPosition();
      if (!pos) return;
      const s = marqueeStart.current;
      setMarquee({
        x: Math.min(s.x, pos.x),
        y: Math.min(s.y, pos.y),
        w: Math.abs(pos.x - s.x),
        h: Math.abs(pos.y - s.y),
      });
    },
    []
  );

  const handleStageMouseUp = useCallback(() => {
    if (marqueeStart.current && marquee) {
      if (marquee.w > 3 || marquee.h > 3) {
        // 选中与框相交的可交互元素
        const ids = page.elements
          .filter(
            (el) =>
              el.visible &&
              !el.locked &&
              el.left < marquee.x + marquee.w &&
              el.left + el.width > marquee.x &&
              el.top < marquee.y + marquee.h &&
              el.top + el.height > marquee.y
          )
          .map((el) => el.id);
        onSelectionChange(ids);
      } else {
        onSelectionChange([]);
      }
    }
    marqueeStart.current = null;
    setMarquee(null);
  }, [marquee, page.elements, onSelectionChange]);

  const handleContextMenu = useCallback(
    (e: Konva.KonvaEventObject<PointerEvent>) => {
      e.evt.preventDefault();
      const stage = e.target.getStage();
      // 向上查找携带 id 的祖先节点 (富文本/含文本形状以 Group 渲染, 命中的是子节点)
      let node: Konva.Node | null = e.target;
      let elementId: string | null = null;
      while (node && node !== stage) {
        const id = node.attrs?.id as string | undefined;
        if (id) {
          elementId = id;
          break;
        }
        node = node.getParent();
      }
      onContextMenu?.({ clientX: e.evt.clientX, clientY: e.evt.clientY, elementId });
    },
    [onContextMenu]
  );

  const setStageRef = useCallback(
    (node: Konva.Stage | null) => {
      if (stageRef) stageRef.current = node;
    },
    [stageRef]
  );

  return (
    <div style={{ position: 'relative', width: metrics.widthPx * zoom, height: metrics.heightPx * zoom }}>
      <Stage
        ref={setStageRef}
        width={metrics.widthPx * zoom}
        height={metrics.heightPx * zoom}
        scaleX={zoom}
        scaleY={zoom}
        onMouseDown={handleStageMouseDown}
        onTouchStart={handleStageMouseDown}
        onMouseMove={handleStageMouseMove}
        onMouseUp={handleStageMouseUp}
        onContextMenu={handleContextMenu}
        style={{ background: '#ffffff' }}
      >
        {/* 背景层: 底色 / 网格 / 边距参考线 */}
        <Layer listening={false}>
          <PageBackground
            metrics={metrics}
            showGrid={showGrid}
            showGuides={showGuides}
            gridSize={gridSize}
          />
        </Layer>

        {/* 内容层: 元素 */}
        <Layer>
          {sortedElements.map((el) => (
            <ElementNode
              key={el.id}
              element={el}
              interactive={interactive}
              editing={editingId === el.id}
              onSelect={handleSelect}
              onChange={onElementChange}
              onCommit={onCommit ?? (() => {})}
              onDragMove={handleDragMove}
              onDragEndExtra={handleDragEndExtra}
              onRequestTextEdit={handleRequestTextEdit}
              registerNode={registerNode}
            />
          ))}
        </Layer>

        {/* 覆盖层: 对齐参考线 + 变换器 */}
        <Layer>
          {guides.map((g, i) =>
            g.orientation === 'vertical' ? (
              <Line
                key={`guide-${i}`}
                points={[g.position, 0, g.position, metrics.heightPx]}
                stroke="#f43f5e"
                strokeWidth={1}
                dash={[4, 4]}
                listening={false}
              />
            ) : (
              <Line
                key={`guide-${i}`}
                points={[0, g.position, metrics.widthPx, g.position]}
                stroke="#f43f5e"
                strokeWidth={1}
                dash={[4, 4]}
                listening={false}
              />
            )
          )}
          {interactive && selectedElements.length > 0 && (
            <SelectionTransformer selectedElements={selectedElements} getNode={getNode} />
          )}
          {marquee && (
            <Rect
              x={marquee.x}
              y={marquee.y}
              width={marquee.w}
              height={marquee.h}
              fill="rgba(59,130,246,0.1)"
              stroke="#3b82f6"
              strokeWidth={1}
              listening={false}
            />
          )}
        </Layer>
      </Stage>

      {/* 文本/形状 内联富文本编辑 overlay */}
      {editingElement && editingElement.type === 'text' && (() => {
        const el = editingElement;
        const style = textElementStyle(el);
        return (
          <RichTextEditorOverlay
            left={el.left}
            top={el.top}
            width={el.width}
            height={el.height}
            zoom={zoom}
            fontSize={style.fontSize}
            fontFamily={style.fontFamily}
            fontWeight={style.fontWeight}
            fontStyle={style.fontStyle}
            underline={style.underline}
            strikethrough={style.strikethrough}
            color={style.color}
            textAlign={style.textAlign}
            lineHeight={style.lineHeight}
            letterSpacing={style.letterSpacing}
            initialSegments={el.segments}
            initialContent={el.content}
            onCommit={({ segments, content }) => {
              onElementChange(el.id, { segments, content });
              onCommit?.();
            }}
            onClose={() => setEditingId(null)}
          />
        );
      })()}
      {editingElement && editingElement.type === 'shape' && (() => {
        const el = editingElement;
        const style = shapeTextStyle(el);
        return (
          <RichTextEditorOverlay
            left={el.left}
            top={el.top}
            width={el.width}
            height={el.height}
            zoom={zoom}
            fontSize={style.fontSize}
            fontFamily={style.fontFamily}
            fontWeight={style.fontWeight}
            fontStyle={style.fontStyle}
            underline={style.underline}
            strikethrough={style.strikethrough}
            color={style.color}
            textAlign={style.textAlign}
            lineHeight={style.lineHeight}
            letterSpacing={style.letterSpacing}
            verticalCenter
            initialSegments={el.segments}
            initialContent={shapeText(el)}
            onCommit={({ segments, content }) => {
              onElementChange(el.id, { segments, text: content });
              onCommit?.();
            }}
            onClose={() => setEditingId(null)}
          />
        );
      })()}
    </div>
  );
};

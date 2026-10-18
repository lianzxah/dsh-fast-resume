import React, { useRef, useEffect, useCallback, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  MousePointer2,
  Type,
  Square,
  Image,
  Hand,
  ZoomIn,
  ZoomOut,
  Maximize,
  Trash2,
  Copy,
  ClipboardPaste,
  Scissors,
  AlignStartVertical,
  AlignCenterVertical,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignCenterHorizontal,
  AlignEndHorizontal,
  AlignHorizontalDistributeCenter,
  AlignVerticalDistributeCenter,
  ArrowUpToLine,
  ArrowDownToLine,
  ArrowUp,
  ArrowDown,
  Lock,
  Unlock,
  Circle,
  Triangle,
  Diamond,
  Pentagon,
  Hexagon,
  Star,
  MessageSquare,
  Minus,
  ChevronDown,
} from 'lucide-react';
import { useEditorStore } from '@/store';
import { useDrop } from 'react-dnd';
import { ResumeCanvas, getPageMetrics, type AlignType, type DistributeType } from '@resume-editor/canvas-engine';
import type { EditorTool, ResumeElement, ResumeDocument, ShapeType } from '@resume-editor/shared';
import { createDrawingElement } from '@resume-editor/shared';
import { ContextMenu, type ContextMenuItem } from '@/components/ContextMenu';

const TOOLS: { id: EditorTool; icon: React.ReactNode; label: string }[] = [
  { id: 'select', icon: <MousePointer2 className="w-4 h-4" />, label: '选择 (V)' },
  { id: 'text', icon: <Type className="w-4 h-4" />, label: '文本 (T)' },
  { id: 'shape', icon: <Square className="w-4 h-4" />, label: '形状 (R)' },
  { id: 'image', icon: <Image className="w-4 h-4" />, label: '图片 (I)' },
  { id: 'hand', icon: <Hand className="w-4 h-4" />, label: '平移 (H)' },
];

/** 可绘制形状目录 (参考 PowerPoint) */
export const SHAPE_CATALOG: { type: ShapeType; label: string; icon: React.ReactNode }[] = [
  { type: 'rectangle', label: '矩形', icon: <Square className="w-4 h-4" /> },
  { type: 'roundedRectangle', label: '圆角矩形', icon: <Square className="w-4 h-4" style={{ borderRadius: 4 }} /> },
  { type: 'ellipse', label: '椭圆', icon: <Circle className="w-4 h-4" /> },
  { type: 'triangle', label: '三角形', icon: <Triangle className="w-4 h-4" /> },
  { type: 'diamond', label: '菱形', icon: <Diamond className="w-4 h-4" /> },
  { type: 'parallelogram', label: '平行四边形', icon: <span className="text-sm italic">▱</span> },
  { type: 'trapezoid', label: '梯形', icon: <span className="text-xs">▰</span> },
  { type: 'pentagon', label: '五边形', icon: <Pentagon className="w-4 h-4" /> },
  { type: 'hexagon', label: '六边形', icon: <Hexagon className="w-4 h-4" /> },
  { type: 'star', label: '星形', icon: <Star className="w-4 h-4" /> },
  { type: 'callout', label: '标注框', icon: <MessageSquare className="w-4 h-4" /> },
  { type: 'line', label: '分割线', icon: <Minus className="w-4 h-4" /> },
];

const WHEEL_ZOOM_SENSITIVITY = 0.00045;
const WHEEL_ZOOM_MAX_FRAME_DELTA = 160;

function findElement(doc: ResumeDocument, id: string): ResumeElement | undefined {
  for (const page of doc.pages) {
    const el = page.elements.find((e) => e.id === id);
    if (el) return el;
  }
  return undefined;
}

interface MenuState {
  x: number;
  y: number;
  elementId: string | null;
}

export const CanvasWorkspace: React.FC = () => {
  const store = useEditorStore();
  const {
    ui, viewport, setActiveTool, zoomIn, zoomOut, zoomToFit,
    addElement, selectMultiple, deselectAll, removeElements,
    duplicateElement, updateElement, updateElements,
    copySelection, cutSelection, paste,
    bringToFront, sendToBack, bringForward, sendBackward, toggleElementLock,
    alignSelection, distributeSelection,
    setActivePage, setZoom, selection, document: doc, activePageIndex, clipboard,
  } = store;

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const pageWrapperRefs = useRef<(HTMLDivElement | null)[]>([]);
  const wheelZoomFrameRef = useRef<number | null>(null);
  const wheelZoomDeltaRef = useRef(0);
  const wheelZoomAnchorRef = useRef<{ clientX: number; clientY: number } | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [currentShape, setCurrentShape] = useState<ShapeType>('rectangle');
  const [shapeMenuOpen, setShapeMenuOpen] = useState(false);

  const zoom = viewport.zoom.level;
  const metrics = getPageMetrics(doc.pageConfig);
  const hasSelection = selection.selectedIds.length > 0;
  const multiSelection = selection.selectedIds.length >= 2;

  // ============================================================
  // 当前页侦测 (滚动时高亮/激活视口中心页)
  // ============================================================
  const detectActivePage = useCallback(() => {
    const container = scrollRef.current;
    if (!container) return;
    const cRect = container.getBoundingClientRect();
    const centerY = cRect.top + cRect.height / 2;
    let best = 0;
    let bestDist = Infinity;
    pageWrapperRefs.current.forEach((w, i) => {
      if (!w) return;
      const r = w.getBoundingClientRect();
      const wc = r.top + r.height / 2;
      const d = Math.abs(wc - centerY);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    });
    if (best !== useEditorStore.getState().activePageIndex) setActivePage(best);
  }, [setActivePage]);

  const zoomAtPoint = useCallback(
    (clientX: number, clientY: number, deltaY: number) => {
      const container = scrollRef.current;
      if (!container) return;

      const currentZoom = useEditorStore.getState().viewport.zoom.level;
      const { minLevel, maxLevel } = useEditorStore.getState().viewport.zoom;
      const nextZoom = Math.max(
        minLevel,
        Math.min(maxLevel, currentZoom * Math.exp(-deltaY * WHEEL_ZOOM_SENSITIVITY))
      );
      if (Math.abs(nextZoom - currentZoom) < 0.001) return;

      const rect = container.getBoundingClientRect();
      const anchorX = clientX - rect.left;
      const anchorY = clientY - rect.top;
      const ratio = nextZoom / currentZoom;
      const nextScrollLeft = (container.scrollLeft + anchorX) * ratio - anchorX;
      const nextScrollTop = (container.scrollTop + anchorY) * ratio - anchorY;

      setZoom(nextZoom);
      requestAnimationFrame(() => {
        container.scrollLeft = Math.max(0, nextScrollLeft);
        container.scrollTop = Math.max(0, nextScrollTop);
        detectActivePage();
      });
    },
    [detectActivePage, setZoom]
  );

  useEffect(() => {
    const handleScrollToElement = (event: Event) => {
      const detail = (event as CustomEvent<{ elementId: string; pageIndex: number }>).detail;
      if (!detail) return;
      const container = scrollRef.current;
      const pageNode = pageWrapperRefs.current[detail.pageIndex];
      const element = doc.pages[detail.pageIndex]?.elements.find((el) => el.id === detail.elementId);
      if (!container || !pageNode || !element) return;

      const targetTop = pageNode.offsetTop + element.top * zoom - container.clientHeight / 2 + element.height * zoom / 2;
      const targetLeft = pageNode.offsetLeft + element.left * zoom - container.clientWidth / 2 + element.width * zoom / 2;
      container.scrollTo({
        top: Math.max(0, targetTop),
        left: Math.max(0, targetLeft),
        behavior: 'smooth',
      });
    };

    window.addEventListener('resume-editor:scroll-to-element', handleScrollToElement);
    return () => window.removeEventListener('resume-editor:scroll-to-element', handleScrollToElement);
  }, [doc.pages, zoom]);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    const handleWheelZoom = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      event.stopPropagation();

      wheelZoomDeltaRef.current += event.deltaY;
      wheelZoomAnchorRef.current = { clientX: event.clientX, clientY: event.clientY };
      if (wheelZoomFrameRef.current !== null) return;

      wheelZoomFrameRef.current = requestAnimationFrame(() => {
        wheelZoomFrameRef.current = null;
        const anchor = wheelZoomAnchorRef.current;
        const delta = Math.max(
          -WHEEL_ZOOM_MAX_FRAME_DELTA,
          Math.min(WHEEL_ZOOM_MAX_FRAME_DELTA, wheelZoomDeltaRef.current)
        );
        wheelZoomDeltaRef.current = 0;
        if (anchor) zoomAtPoint(anchor.clientX, anchor.clientY, delta);
      });
    };

    container.addEventListener('wheel', handleWheelZoom, { passive: false });
    return () => {
      container.removeEventListener('wheel', handleWheelZoom);
      if (wheelZoomFrameRef.current !== null) {
        cancelAnimationFrame(wheelZoomFrameRef.current);
        wheelZoomFrameRef.current = null;
      }
      wheelZoomDeltaRef.current = 0;
      wheelZoomAnchorRef.current = null;
    };
  }, [zoomAtPoint]);

  // ============================================================
  // 画布回调 (按页)
  // ============================================================
  const handleSelectionChange = useCallback(
    (pageIndex: number, ids: string[]) => {
      if (ids.length === 0) {
        deselectAll();
      } else {
        selectMultiple(ids);
        setActivePage(pageIndex);
      }
    },
    [deselectAll, selectMultiple, setActivePage]
  );

  const handleCanvasClick = useCallback(
    (pageIndex: number, pos: { x: number; y: number }) => {
      if (ui.activeTool === 'select' || ui.activeTool === 'hand') return;
      const catalogItemId = ui.activeTool === 'shape' ? currentShape : ui.activeTool;
      const el = createDrawingElement(catalogItemId, pos.x, pos.y);
      if (el) addElement(el, pageIndex);
      setActiveTool('select');
    },
    [ui.activeTool, addElement, setActiveTool, currentShape]
  );

  const handleContextMenu = useCallback(
    (pageIndex: number, payload: { clientX: number; clientY: number; elementId: string | null }) => {
      if (payload.elementId) {
        if (!selection.selectedIds.includes(payload.elementId)) {
          selectMultiple([payload.elementId]);
        }
        setActivePage(pageIndex);
      }
      setMenu({ x: payload.clientX, y: payload.clientY, elementId: payload.elementId });
    },
    [selection.selectedIds, selectMultiple, setActivePage]
  );

  // ============================================================
  // React DnD - 接收拖拽 (换算为逻辑坐标 + 判断落点页)
  // ============================================================
  const [{ isOver }, dropRef] = useDrop({
    accept: 'COMPONENT',
    drop: (item: { type: string; componentId: string }, monitor) => {
      const offset = monitor.getClientOffset();
      if (!offset) return;
      // 判断落点在哪一页
      let targetPage = activePageIndex;
      let rect: DOMRect | undefined;
      pageWrapperRefs.current.forEach((w, i) => {
        if (!w) return;
        const r = w.getBoundingClientRect();
        if (offset.y >= r.top && offset.y <= r.bottom) {
          targetPage = i;
          rect = r;
        }
      });
      rect = rect ?? pageWrapperRefs.current[targetPage]?.getBoundingClientRect();
      if (!rect) return;
      const x = (offset.x - rect.left) / zoom;
      const y = (offset.y - rect.top) / zoom;
      const el = createDrawingElement(item.componentId, x, y);
      if (el) addElement(el, targetPage);
    },
    collect: (monitor) => ({ isOver: monitor.isOver() }),
  });

  // ============================================================
  // 键盘快捷键 (删除/复制/剪贴板/微调/工具)
  // ============================================================
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (document.activeElement as HTMLElement)?.tagName;
      const isEditing = tag === 'INPUT' || tag === 'TEXTAREA';
      if (isEditing) return;
      const ctrl = e.ctrlKey || e.metaKey;
      const ids = selection.selectedIds;

      if ((e.key === 'Delete' || e.key === 'Backspace') && ids.length > 0) {
        e.preventDefault();
        removeElements([...ids]);
        return;
      }
      if (ctrl && e.key === 'c' && ids.length > 0) { e.preventDefault(); copySelection(); return; }
      if (ctrl && e.key === 'x' && ids.length > 0) { e.preventDefault(); cutSelection(); return; }
      if (ctrl && e.key === 'v') { e.preventDefault(); paste(); return; }
      if (ctrl && e.key === 'd' && ids.length > 0) {
        e.preventDefault();
        ids.forEach((id) => duplicateElement(id));
        return;
      }
      // 方向键微调
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key) && ids.length > 0) {
        e.preventDefault();
        const delta = e.shiftKey ? 10 : 1;
        const dx = e.key === 'ArrowLeft' ? -delta : e.key === 'ArrowRight' ? delta : 0;
        const dy = e.key === 'ArrowUp' ? -delta : e.key === 'ArrowDown' ? delta : 0;
        const currentDoc = useEditorStore.getState().document;
        const updates: Record<string, Partial<ResumeElement>> = {};
        for (const id of ids) {
          const el = findElement(currentDoc, id);
          if (el) updates[id] = { left: el.left + dx, top: el.top + dy };
        }
        updateElements(updates);
        return;
      }
      if (!ctrl) {
        if (e.key === 'v') setActiveTool('select');
        if (e.key === 't') setActiveTool('text');
        if (e.key === 'r') setActiveTool('shape');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selection.selectedIds, removeElements, copySelection, cutSelection, paste, duplicateElement, updateElements, setActiveTool]);

  const setRefs = useCallback(
    (node: HTMLDivElement | null) => {
      scrollRef.current = node;
      dropRef(node);
    },
    [dropRef]
  );

  // ============================================================
  // 右键菜单项
  // ============================================================
  const buildMenuItems = (): ContextMenuItem[] => {
    const ids = selection.selectedIds;
    const targetLocked = menu?.elementId ? findElement(doc, menu.elementId)?.locked : false;
    if (!menu?.elementId) {
      return [
        { label: '粘贴', icon: <ClipboardPaste className="w-3.5 h-3.5" />, shortcut: 'Ctrl+V', disabled: clipboard.length === 0, onClick: () => paste() },
      ];
    }
    return [
      { label: '复制', icon: <Copy className="w-3.5 h-3.5" />, shortcut: 'Ctrl+C', onClick: () => copySelection() },
      { label: '剪切', icon: <Scissors className="w-3.5 h-3.5" />, shortcut: 'Ctrl+X', onClick: () => cutSelection() },
      { label: '粘贴', icon: <ClipboardPaste className="w-3.5 h-3.5" />, shortcut: 'Ctrl+V', disabled: clipboard.length === 0, onClick: () => paste() },
      { label: '创建副本', icon: <Copy className="w-3.5 h-3.5" />, shortcut: 'Ctrl+D', onClick: () => ids.forEach((id) => duplicateElement(id)) },
      { separator: true },
      { label: '置于顶层', icon: <ArrowUpToLine className="w-3.5 h-3.5" />, onClick: () => ids.forEach((id) => bringToFront(id)) },
      { label: '上移一层', icon: <ArrowUp className="w-3.5 h-3.5" />, onClick: () => ids.forEach((id) => bringForward(id)) },
      { label: '下移一层', icon: <ArrowDown className="w-3.5 h-3.5" />, onClick: () => ids.forEach((id) => sendBackward(id)) },
      { label: '置于底层', icon: <ArrowDownToLine className="w-3.5 h-3.5" />, onClick: () => ids.forEach((id) => sendToBack(id)) },
      { separator: true },
      { label: targetLocked ? '解锁' : '锁定', icon: targetLocked ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />, onClick: () => ids.forEach((id) => toggleElementLock(id)) },
      { label: '删除', icon: <Trash2 className="w-3.5 h-3.5" />, shortcut: 'Delete', danger: true, onClick: () => removeElements([...ids]) },
    ];
  };

  const alignBtns: { type: AlignType; icon: React.ReactNode; label: string }[] = [
    { type: 'left', icon: <AlignStartVertical className="w-4 h-4" />, label: '左对齐' },
    { type: 'center-h', icon: <AlignCenterVertical className="w-4 h-4" />, label: '水平居中' },
    { type: 'right', icon: <AlignEndVertical className="w-4 h-4" />, label: '右对齐' },
    { type: 'top', icon: <AlignStartHorizontal className="w-4 h-4" />, label: '顶对齐' },
    { type: 'middle-v', icon: <AlignCenterHorizontal className="w-4 h-4" />, label: '垂直居中' },
    { type: 'bottom', icon: <AlignEndHorizontal className="w-4 h-4" />, label: '底对齐' },
  ];
  const distBtns: { type: DistributeType; icon: React.ReactNode; label: string }[] = [
    { type: 'horizontal', icon: <AlignHorizontalDistributeCenter className="w-4 h-4" />, label: '水平分布' },
    { type: 'vertical', icon: <AlignVerticalDistributeCenter className="w-4 h-4" />, label: '垂直分布' },
  ];

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      {/* 工具栏 */}
      <div className="h-10 bg-background border-b border-border flex items-center px-3 gap-1">
        {TOOLS.map((tool) =>
          tool.id === 'shape' ? (
            <div key="shape" className="relative flex items-center">
              <motion.button
                className={`p-1.5 rounded-md relative ${
                  ui.activeTool === 'shape' ? 'text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
                title="形状 (R)"
                onClick={() => {
                  setActiveTool('shape');
                  setShapeMenuOpen((o) => !o);
                }}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                transition={{ type: 'spring', stiffness: 400, damping: 17 }}
              >
                {ui.activeTool === 'shape' && (
                  <motion.div layoutId="active-tool-bg" className="absolute inset-0 bg-primary rounded-md shadow-sm" transition={{ type: 'spring', stiffness: 380, damping: 25 }} />
                )}
                <span className="relative z-10 flex items-center gap-0.5">
                  {SHAPE_CATALOG.find((s) => s.type === currentShape)?.icon ?? tool.icon}
                  <ChevronDown className="w-2.5 h-2.5" />
                </span>
              </motion.button>

              <AnimatePresence>
                {shapeMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShapeMenuOpen(false)} />
                    <motion.div
                      initial={{ opacity: 0, y: -4, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -4, scale: 0.98 }}
                      transition={{ duration: 0.12 }}
                      className="absolute top-full left-0 mt-1 w-44 bg-popover border border-border rounded-lg shadow-xl p-1.5 z-50 grid grid-cols-4 gap-1"
                    >
                      {SHAPE_CATALOG.map((s) => (
                        <button
                          key={s.type}
                          title={s.label}
                          className={`h-9 flex items-center justify-center rounded-md border transition-colors ${
                            currentShape === s.type ? 'border-primary bg-primary/10 text-primary' : 'border-transparent text-muted-foreground hover:bg-accent hover:text-foreground'
                          }`}
                          onClick={() => {
                            setCurrentShape(s.type);
                            setActiveTool('shape');
                            setShapeMenuOpen(false);
                          }}
                        >
                          {s.icon}
                        </button>
                      ))}
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
          ) : (
            <motion.button
              key={tool.id}
              className={`p-1.5 rounded-md relative ${
                ui.activeTool === tool.id ? 'text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
              title={tool.label}
              onClick={() => setActiveTool(tool.id)}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              transition={{ type: 'spring', stiffness: 400, damping: 17 }}
            >
              {ui.activeTool === tool.id && (
                <motion.div layoutId="active-tool-bg" className="absolute inset-0 bg-primary rounded-md shadow-sm" transition={{ type: 'spring', stiffness: 380, damping: 25 }} />
              )}
              <span className="relative z-10">{tool.icon}</span>
            </motion.button>
          )
        )}

        {/* 层级 / 对齐 (选中时出现) */}
        <AnimatePresence>
          {hasSelection && (
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              className="flex items-center gap-1"
            >
              <div className="w-px h-5 bg-border mx-1.5" />
              <ToolbarIcon title="置于顶层" onClick={() => selection.selectedIds.forEach((id) => bringToFront(id))}><ArrowUpToLine className="w-4 h-4" /></ToolbarIcon>
              <ToolbarIcon title="置于底层" onClick={() => selection.selectedIds.forEach((id) => sendToBack(id))}><ArrowDownToLine className="w-4 h-4" /></ToolbarIcon>
              {multiSelection && (
                <>
                  <div className="w-px h-5 bg-border mx-1.5" />
                  {alignBtns.map((b) => (
                    <ToolbarIcon key={b.type} title={b.label} onClick={() => alignSelection(b.type)}>{b.icon}</ToolbarIcon>
                  ))}
                  {selection.selectedIds.length >= 3 && distBtns.map((b) => (
                    <ToolbarIcon key={b.type} title={b.label} onClick={() => distributeSelection(b.type)}>{b.icon}</ToolbarIcon>
                  ))}
                </>
              )}
              <div className="w-px h-5 bg-border mx-1.5" />
              <ToolbarIcon title="复制 (Ctrl+D)" onClick={() => selection.selectedIds.forEach((id) => duplicateElement(id))}><Copy className="w-4 h-4" /></ToolbarIcon>
              <ToolbarIcon title="删除 (Delete)" danger onClick={() => removeElements([...selection.selectedIds])}><Trash2 className="w-4 h-4" /></ToolbarIcon>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 缩放控制 */}
        <div className="ml-auto flex items-center gap-1">
          <ToolbarIcon title="缩小" onClick={zoomOut}><ZoomOut className="w-4 h-4" /></ToolbarIcon>
          <motion.span
            className="text-xs text-muted-foreground min-w-[44px] text-center select-none font-mono"
            key={Math.round(zoom * 100)}
            initial={{ scale: 1.2 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.3 }}
          >
            {Math.round(zoom * 100)}%
          </motion.span>
          <ToolbarIcon title="放大" onClick={zoomIn}><ZoomIn className="w-4 h-4" /></ToolbarIcon>
          <ToolbarIcon title="适应窗口" onClick={zoomToFit}><Maximize className="w-3.5 h-3.5" /></ToolbarIcon>
        </div>
      </div>

      {/* 画布区域 - 连续滚动多页 */}
      <div
        ref={setRefs}
        onScroll={detectActivePage}
        className={`canvas-workspace flex-1 flex flex-col items-center overflow-auto py-8 gap-6 ${
          isOver ? 'ring-2 ring-inset ring-primary/30 bg-primary/5' : ''
        }`}
      >
        {doc.pages.map((page, pageIndex) => (
          <div key={page.id} className="flex flex-col items-center">
            <div
              ref={(node) => { pageWrapperRefs.current[pageIndex] = node; }}
              className={`shadow-2xl rounded-sm relative bg-white transition-shadow ${
                pageIndex === activePageIndex ? 'ring-2 ring-primary/40' : ''
              }`}
              style={{ width: metrics.widthPx * zoom, height: metrics.heightPx * zoom }}
            >
              <ResumeCanvas
                page={page}
                pageConfig={doc.pageConfig}
                zoom={zoom}
                selectedIds={selection.selectedIds}
                activeTool={ui.activeTool}
                showGrid={ui.showGrid}
                showGuides
                snapToGrid={ui.snapToGrid}
                onSelectionChange={(ids) => handleSelectionChange(pageIndex, ids)}
                onElementChange={updateElement}
                onCanvasClick={(pos) => handleCanvasClick(pageIndex, pos)}
                onContextMenu={(payload) => handleContextMenu(pageIndex, payload)}
              />

              {page.elements.length === 0 && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="text-center">
                    <p className="text-sm text-muted-foreground/40 font-medium">拖拽组件到此处，或选择工具点击添加</p>
                    <p className="text-xs text-muted-foreground/30 mt-1">快捷键: V(选择) T(文本) R(矩形) Delete(删除)</p>
                  </div>
                </div>
              )}
            </div>
            <div className="text-center mt-2">
              <span className="text-[11px] text-muted-foreground/50">
                第 {pageIndex + 1} 页 / 共 {doc.pages.length} 页
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* 右键上下文菜单 */}
      {menu && (
        <ContextMenu x={menu.x} y={menu.y} items={buildMenuItems()} onClose={() => setMenu(null)} />
      )}
    </div>
  );
};

// ============================================================
// 工具栏图标按钮
// ============================================================
const ToolbarIcon: React.FC<{
  title: string;
  onClick: () => void;
  danger?: boolean;
  children: React.ReactNode;
}> = ({ title, onClick, danger, children }) => (
  <motion.button
    className={`p-1.5 rounded-md ${
      danger ? 'text-destructive hover:bg-destructive/10' : 'text-muted-foreground hover:text-foreground hover:bg-accent'
    }`}
    title={title}
    onClick={onClick}
    whileHover={{ scale: 1.12 }}
    whileTap={{ scale: 0.88 }}
  >
    {children}
  </motion.button>
);

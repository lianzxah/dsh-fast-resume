import React from 'react';
import {
  LayoutTemplate,
  Component,
  Layers,
  FileText,
  Type,
  Image,
  Square,
  Circle,
  Triangle,
  Diamond,
  Pentagon,
  Hexagon,
  Star,
  MessageSquare,
  Minus,
  GripVertical,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  Link2,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useDrag } from 'react-dnd';
import { useEditorStore } from '@/store';
import {
  DRAWING_CATALOG_CATEGORIES,
  createDrawingElement,
  listDrawingCatalogItems,
  renderDrawingIconSvg,
  svgToDataUrl,
  type DrawingCatalogCategoryId,
  type DrawingCatalogItem,
  type LeftPanelTab,
} from '@resume-editor/shared';
import { templates } from '@resume-editor/templates';

const TAB_ITEMS: { id: LeftPanelTab; label: string; icon: React.ReactNode }[] = [
  { id: 'templates', label: '模版', icon: <LayoutTemplate className="w-4 h-4" /> },
  { id: 'components', label: '组件', icon: <Component className="w-4 h-4" /> },
  { id: 'layers', label: '图层', icon: <Layers className="w-4 h-4" /> },
  { id: 'pages', label: '页面', icon: <FileText className="w-4 h-4" /> },
];

export const LeftPanel: React.FC = () => {
  const { ui, setLeftPanelTab } = useEditorStore();

  return (
    <div className="bg-background border-r border-border flex h-full overflow-hidden">
      {/* Tab 导航栏 */}
      <div className="w-11 border-r border-border flex flex-col items-center py-2 gap-1 bg-muted/30">
        {TAB_ITEMS.map((tab) => (
          <button
            key={tab.id}
            className={`w-9 h-9 flex items-center justify-center rounded-lg transition-all ${
              ui.leftPanelTab === tab.id
                ? 'bg-primary/10 text-primary shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent'
            }`}
            title={tab.label}
            onClick={() => setLeftPanelTab(tab.id)}
          >
            {tab.icon}
          </button>
        ))}
      </div>

      {/* Tab 内容区 */}
      <div className="flex-1 overflow-hidden flex flex-col">
        <div className="px-3 py-2 border-b border-border">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            {TAB_ITEMS.find((t) => t.id === ui.leftPanelTab)?.label}
          </h3>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          <AnimatePresence mode="wait">
            {ui.leftPanelTab === 'templates' && <TemplatesPanel key="templates" />}
            {ui.leftPanelTab === 'components' && <ComponentsPanel key="components" />}
            {ui.leftPanelTab === 'layers' && <LayersPanel key="layers" />}
            {ui.leftPanelTab === 'pages' && <PagesPanel key="pages" />}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};

// ============================================================
// 模版面板（真实模版库 + 一键应用）
// ============================================================
const TemplatesPanel: React.FC = () => {
  const { document, applyTemplate } = useEditorStore();

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -10 }}
      className="grid grid-cols-2 gap-2"
    >
      {templates.map((t) => {
        const active = document.templateId === t.id;
        return (
          <button
            key={t.id}
            title={t.description}
            onClick={() => applyTemplate(t)}
            className={`group text-left cursor-pointer rounded-lg border-2 p-2 transition-all hover:shadow-md hover:scale-[1.02] ${
              active ? 'border-primary ring-2 ring-primary/30' : 'border-border'
            }`}
            style={{ backgroundColor: `${t.theme.primaryColor}0d` }}
          >
            {/* 缩略预览：用主题色模拟版式 */}
            <div className="aspect-[210/297] rounded bg-white shadow-inner border border-gray-200 mb-1.5 overflow-hidden flex">
              <div className="w-1/3 h-full" style={{ backgroundColor: t.theme.primaryColor }} />
              <div className="flex-1 p-1.5 space-y-1">
                <div className="h-1.5 rounded w-2/3" style={{ backgroundColor: t.theme.secondaryColor }} />
                <div className="h-1 bg-gray-200 rounded w-full" />
                <div className="h-1 bg-gray-200 rounded w-4/5" />
                <div className="h-1 bg-gray-200 rounded w-full" />
                <div className="h-1 rounded w-1/2 mt-1" style={{ backgroundColor: t.theme.accentColor }} />
              </div>
            </div>
            <p className="text-[10px] text-center font-medium text-foreground/70 group-hover:text-foreground truncate">
              {t.name}
            </p>
          </button>
        );
      })}
    </motion.div>
  );
};

// ============================================================
// 组件库面板 (React DnD)
// ============================================================
const ComponentsPanel: React.FC = () => {
  const [activeCategory, setActiveCategory] = React.useState<DrawingCatalogCategoryId>('basic');
  const items = React.useMemo(() => listDrawingCatalogItems(activeCategory), [activeCategory]);
  const addElement = useEditorStore((state) => state.addElement);

  const insertItem = React.useCallback(
    (itemId: string) => {
      const state = useEditorStore.getState();
      const currentPage = state.document.pages[state.activePageIndex];
      const offset = ((currentPage?.elements.length ?? 0) % 8) * 12;
      const element = createDrawingElement(itemId, 84 + offset, 84 + offset);
      if (element) addElement(element, state.activePageIndex);
    },
    [addElement]
  );

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -10 }}
      className="space-y-3"
    >
      <div className="grid grid-cols-2 gap-1.5">
        {DRAWING_CATALOG_CATEGORIES.map((category) => (
          <button
            key={category.id}
            type="button"
            title={category.description}
            className={`h-8 rounded-md border px-2 text-[11px] font-medium transition-colors ${
              activeCategory === category.id
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border text-muted-foreground hover:border-primary/40 hover:bg-accent hover:text-foreground'
            }`}
            onClick={() => setActiveCategory(category.id)}
          >
            <span className="block truncate">{category.label}</span>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2">
        {items.map((item) => (
          <DraggableComponent key={item.id} item={item} onInsert={insertItem} />
        ))}
      </div>
    </motion.div>
  );
};

/** 可拖拽组件项 */
const DraggableComponent: React.FC<{
  item: DrawingCatalogItem;
  onInsert: (itemId: string) => void;
}> = ({ item, onInsert }) => {
  const [{ isDragging }, dragRef] = useDrag({
    type: 'COMPONENT',
    item: { type: 'COMPONENT', componentId: item.id },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  });

  return (
    <button
      type="button"
      ref={dragRef as any}
      title={`${item.label}：拖拽到画布或点击插入`}
      className={`flex min-h-[72px] flex-col items-center justify-center gap-1.5 rounded-lg border border-border bg-background p-2 text-center hover:border-primary/50 hover:bg-primary/5 cursor-grab active:cursor-grabbing transition-all ${
        isDragging ? 'opacity-50 scale-95 border-primary' : ''
      }`}
      onClick={() => onInsert(item.id)}
    >
      <div className="text-muted-foreground">
        <CatalogItemPreview item={item} />
      </div>
      <span className="flex min-h-[24px] w-full items-center justify-center break-words text-[10px] leading-tight text-muted-foreground">
        {item.label}
      </span>
    </button>
  );
};

const CatalogItemPreview: React.FC<{ item: DrawingCatalogItem }> = ({ item }) => {
  if (item.kind === 'icon') {
    const svg = renderDrawingIconSvg(item);
    if (svg) {
      return (
        <img
          className="h-6 w-6 object-contain"
          src={svgToDataUrl(svg)}
          alt=""
          draggable={false}
        />
      );
    }

    return (
      <span
        className="flex h-6 w-6 items-center justify-center rounded-md text-[9px] font-bold leading-none"
        style={{
          color: item.icon?.accentColor ?? 'currentColor',
          backgroundColor: `${item.icon?.accentColor ?? '#64748b'}1a`,
        }}
      >
        {item.icon?.glyph ?? 'I'}
      </span>
    );
  }

  switch (item.id) {
    case 'heading':
      return <Type className="w-5 h-5" />;
    case 'text':
      return <Type className="w-4 h-4" />;
    case 'image':
      return <Image className="w-5 h-5" />;
    case 'link-text':
    case 'link-icon':
      return <Link2 className="w-5 h-5" />;
    case 'rectangle':
      return <Square className="w-5 h-5" />;
    case 'roundedRectangle':
      return <Square className="w-5 h-5" style={{ borderRadius: 4 }} />;
    case 'circle':
    case 'ellipse':
      return <Circle className="w-5 h-5" />;
    case 'triangle':
      return <Triangle className="w-5 h-5" />;
    case 'diamond':
      return <Diamond className="w-5 h-5" />;
    case 'parallelogram':
      return <span className="text-base italic">▱</span>;
    case 'trapezoid':
      return <span className="text-sm">▰</span>;
    case 'pentagon':
      return <Pentagon className="w-5 h-5" />;
    case 'hexagon':
      return <Hexagon className="w-5 h-5" />;
    case 'star':
      return <Star className="w-5 h-5" />;
    case 'callout':
      return <MessageSquare className="w-5 h-5" />;
    case 'line':
      return <Minus className="w-5 h-5" />;
    default:
      return <Component className="w-5 h-5" />;
  }
};

// ============================================================
// 图层面板 (拖拽排序 + 可见/锁定)
// ============================================================
const LayersPanel: React.FC = () => {
  const { document, activePageIndex, selection, selectElement, toggleElementVisibility, toggleElementLock, reorderLayer } =
    useEditorStore();
  const currentPage = document.pages[activePageIndex];
  const elements = currentPage?.elements || [];
  const [dragIndex, setDragIndex] = React.useState<number | null>(null);

  // 顶部显示最上层元素: 视觉顺序 = 数组倒序 (zIndex 大在前)
  const ordered = [...elements].map((el, i) => ({ el, index: i })).reverse();

  const handleDrop = (targetIndex: number) => {
    if (dragIndex === null || dragIndex === targetIndex) {
      setDragIndex(null);
      return;
    }
    reorderLayer(activePageIndex, dragIndex, targetIndex);
    setDragIndex(null);
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -10 }}
      className="space-y-0.5"
    >
      {ordered.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-4">暂无元素</p>
      ) : (
        ordered.map(({ el, index }) => (
          <div
            key={el.id}
            draggable
            onDragStart={() => setDragIndex(index)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => handleDrop(index)}
            className={`flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer transition-colors ${
              selection.selectedIds.includes(el.id)
                ? 'bg-primary/10 text-primary'
                : 'hover:bg-accent text-foreground/80'
            } ${dragIndex === index ? 'opacity-50' : ''}`}
            onClick={() => selectElement(el.id)}
          >
            <GripVertical className="w-3 h-3 text-muted-foreground cursor-grab" />
            <span className="text-xs flex-1 truncate">{el.name}</span>
            <button
              className="p-0.5 hover:text-foreground"
              title={el.visible ? '隐藏' : '显示'}
              onClick={(e) => {
                e.stopPropagation();
                toggleElementVisibility(el.id);
              }}
            >
              {el.visible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3 text-muted-foreground/50" />}
            </button>
            <button
              className="p-0.5 hover:text-foreground"
              title={el.locked ? '解锁' : '锁定'}
              onClick={(e) => {
                e.stopPropagation();
                toggleElementLock(el.id);
              }}
            >
              {el.locked ? <Lock className="w-3 h-3 text-muted-foreground/50" /> : <Unlock className="w-3 h-3" />}
            </button>
          </div>
        ))
      )}
    </motion.div>
  );
};

// ============================================================
// 页面面板
// ============================================================
const PagesPanel: React.FC = () => {
  const { document, activePageIndex, setActivePage, addPage } = useEditorStore();

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -10 }}
      className="space-y-2"
    >
      {document.pages.map((page, index) => (
        <div
          key={page.id}
          className={`p-1 rounded-lg border-2 cursor-pointer transition-all ${
            index === activePageIndex
              ? 'border-primary shadow-sm'
              : 'border-border hover:border-primary/30'
          }`}
          onClick={() => setActivePage(index)}
        >
          <div className="aspect-[210/297] bg-white rounded border border-gray-100 flex items-center justify-center">
            <span className="text-xs text-muted-foreground">第 {page.pageNumber} 页</span>
          </div>
        </div>
      ))}
      <button
        className="w-full py-2 border-2 border-dashed border-border rounded-lg text-xs text-muted-foreground hover:border-primary hover:text-primary transition-colors"
        onClick={addPage}
      >
        + 添加页面
      </button>
    </motion.div>
  );
};

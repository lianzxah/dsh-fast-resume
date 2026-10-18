import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import {
  Undo2,
  Redo2,
  Save,
  Download,
  Upload,
  FileInput,
  FileImage,
  Scissors,
  Copy,
  ClipboardPaste,
  Trash2,
  MousePointer2,
  ZoomIn,
  ZoomOut,
  Maximize,
  Grid3x3,
  Ruler,
  PanelLeft,
  PanelRight,
  MessageSquare,
  Type,
  Heading,
  Image,
  Square,
  Circle,
  Minus,
  Home,
  History,
  Loader2,
} from 'lucide-react';
import { useEditorStore } from '@/store';

import { generateElementId } from '@resume-editor/shared';

import { triggerManualSave, triggerOpenVersions } from '@/lib/save-bus';

// ============================================================
// 菜单数据定义
// ============================================================

interface MenuItem {
  label: string;
  icon?: React.ReactNode;
  shortcut?: string;
  action?: () => void;
  disabled?: boolean;
  separator?: boolean;
}

export const MenuBar: React.FC<{ onExport: (format: 'json' | 'png' | 'pdf') => void; onImport: () => void; labels: {save:string;versions:string;showLeft:string;showRight:string} }> = ({ onExport, onImport, labels }) => {
  const store = useEditorStore();
  const { isDirty, selection, ui } = store;
  const navigate = useNavigate();
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const setImportOpen = (_open: boolean) => onImport();
  const menuBarRef = useRef<HTMLDivElement>(null);

  const hasSelection = selection.selectedIds.length > 0;

  // 关闭菜单
  const closeMenu = useCallback(() => setActiveMenu(null), []);

  // 点击外部关闭
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuBarRef.current && !menuBarRef.current.contains(e.target as Node)) {
        closeMenu();
      }
    };
    if (activeMenu) {
      const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') closeMenu(); };
      document.addEventListener('keydown', escape);
      document.addEventListener('mousedown', handleClick);
      return () => { document.removeEventListener('mousedown', handleClick); document.removeEventListener('keydown', escape); };
    }
  }, [activeMenu, closeMenu]);

  // ============================================================
  // 菜单定义
  // ============================================================
  const menus: Record<string, MenuItem[]> = {
    文件: [
      {
        label: '返回首页',
        icon: <Home className="w-3.5 h-3.5" />,
        action: () => {
          navigate('/');
          closeMenu();
        },
      },
      {
        label: '导入简历...',
        icon: <FileInput className="w-3.5 h-3.5" />,
        shortcut: 'Ctrl+O',
        action: () => {
          setImportOpen(true);
          closeMenu();
        },
      },
      { separator: true, label: '' },
      {
        label: '保存',
        icon: <Save className="w-3.5 h-3.5" />,
        shortcut: 'Ctrl+S',
        action: () => {
          saveDocument();
          closeMenu();
        },
      },
      {
        label: '版本历史',
        icon: <History className="w-3.5 h-3.5" />,
        action: () => {
          triggerOpenVersions();
          closeMenu();
        },
      },
      {
        label: '导出 JSON 备份',
        icon: <Download className="w-3.5 h-3.5" />,
        action: () => {
          exportJson();
          closeMenu();
        },
      },
      { separator: true, label: '' },
      {
        label: '导出为 PDF',
        icon: <Download className="w-3.5 h-3.5" />,
        shortcut: 'Ctrl+Shift+E',
        action: () => {
          exportPDF();
          closeMenu();
        },
      },
      {
        label: '导出为图片',
        icon: <FileImage className="w-3.5 h-3.5" />,
        action: () => {
          exportPNG();
          closeMenu();
        },
      },
    ],
    编辑: [
      {
        label: '撤销',
        icon: <Undo2 className="w-3.5 h-3.5" />,
        shortcut: 'Ctrl+Z',
        disabled: store.past.length === 0,
        action: () => {
          store.undo();
          closeMenu();
        },
      },
      {
        label: '重做',
        icon: <Redo2 className="w-3.5 h-3.5" />,
        shortcut: 'Ctrl+Shift+Z',
        disabled: store.future.length === 0,
        action: () => {
          store.redo();
          closeMenu();
        },
      },
      { separator: true, label: '' },
      {
        label: '剪切',
        icon: <Scissors className="w-3.5 h-3.5" />,
        shortcut: 'Ctrl+X',
        disabled: !hasSelection,
        action: () => { store.cutSelection(); closeMenu(); },
      },
      {
        label: '复制',
        icon: <Copy className="w-3.5 h-3.5" />,
        shortcut: 'Ctrl+C',
        disabled: !hasSelection,
        action: () => {
          store.copySelection();
          closeMenu();
        },
      },
      {
        label: '粘贴',
        icon: <ClipboardPaste className="w-3.5 h-3.5" />,
        shortcut: 'Ctrl+V',
        action: () => { store.paste(); closeMenu(); },
      },
      { separator: true, label: '' },
      {
        label: '全选',
        icon: <MousePointer2 className="w-3.5 h-3.5" />,
        shortcut: 'Ctrl+A',
        action: () => {
          selectAll();
          closeMenu();
        },
      },
      {
        label: '删除',
        icon: <Trash2 className="w-3.5 h-3.5" />,
        shortcut: 'Delete',
        disabled: !hasSelection,
        action: () => {
          selection.selectedIds.forEach((id) => store.removeElement(id));
          closeMenu();
        },
      },
    ],
    视图: [
      {
        label: '放大',
        icon: <ZoomIn className="w-3.5 h-3.5" />,
        shortcut: 'Ctrl+=',
        action: () => {
          store.zoomIn();
          closeMenu();
        },
      },
      {
        label: '缩小',
        icon: <ZoomOut className="w-3.5 h-3.5" />,
        shortcut: 'Ctrl+-',
        action: () => {
          store.zoomOut();
          closeMenu();
        },
      },
      {
        label: '适应窗口',
        icon: <Maximize className="w-3.5 h-3.5" />,
        shortcut: 'Ctrl+0',
        action: () => {
          store.zoomToFit();
          closeMenu();
        },
      },
      { separator: true, label: '' },
      {
        label: `${ui.showGrid ? '✓ ' : ''}显示网格`,
        icon: <Grid3x3 className="w-3.5 h-3.5" />,
        shortcut: 'Ctrl+G',
        action: () => {
          store.toggleGrid();
          closeMenu();
        },
      },
      {
        label: `${ui.showRuler ? '✓ ' : ''}显示标尺`,
        icon: <Ruler className="w-3.5 h-3.5" />,
        shortcut: 'Ctrl+R',
        action: () => {
          store.toggleRuler();
          closeMenu();
        },
      },
      { separator: true, label: '' },
      {
        label: `${ui.leftPanelVisible ? '✓ ' : ''}左侧面板`,
        icon: <PanelLeft className="w-3.5 h-3.5" />,
        shortcut: 'Ctrl+B',
        action: () => {
          store.toggleLeftPanel();
          closeMenu();
        },
      },
      {
        label: `${ui.rightPanelVisible ? '✓ ' : ''}右侧面板`,
        icon: <PanelRight className="w-3.5 h-3.5" />,
        shortcut: 'Ctrl+.',
        action: () => {
          store.toggleRightPanel();
          closeMenu();
        },
      },
      {
        label: `${ui.bottomPanelVisible ? '✓ ' : ''}AI 助手`,
        icon: <MessageSquare className="w-3.5 h-3.5" />,
        shortcut: 'Ctrl+J',
        action: () => {
          store.toggleBottomPanel();
          closeMenu();
        },
      },
    ],
    插入: [
      {
        label: '文本框',
        icon: <Type className="w-3.5 h-3.5" />,
        shortcut: 'T',
        action: () => {
          store.setActiveTool('text');
          closeMenu();
        },
      },
      {
        label: '标题',
        icon: <Heading className="w-3.5 h-3.5" />,
        shortcut: 'H',
        action: () => {
          insertHeading();
          closeMenu();
        },
      },
      { separator: true, label: '' },
      {
        label: '图片',
        icon: <Image className="w-3.5 h-3.5" />,
        shortcut: 'I',
        action: () => {
          store.setActiveTool('image');
          closeMenu();
        },
      },
      { separator: true, label: '' },
      {
        label: '矩形',
        icon: <Square className="w-3.5 h-3.5" />,
        shortcut: 'R',
        action: () => {
          store.setActiveTool('shape');
          closeMenu();
        },
      },
      {
        label: '圆形',
        icon: <Circle className="w-3.5 h-3.5" />,
        shortcut: 'O',
        action: () => {
          insertCircle();
          closeMenu();
        },
      },
      {
        label: '分割线',
        icon: <Minus className="w-3.5 h-3.5" />,
        shortcut: 'L',
        action: () => {
          insertDivider();
          closeMenu();
        },
      },
    ],
  };

  // ============================================================
  // Action 实现
  // ============================================================
  /** 保存到后端 (生成版本快照) */
  function saveDocument() {
    triggerManualSave();
  }

  function exportJson() { onExport('json'); }
  function exportPNG() { onExport('png'); }
  function exportPDF() { onExport('pdf'); }

  function selectAll() {
    const current = useEditorStore.getState();
    const page = current.document.pages[current.activePageIndex];
    if (page) current.selectMultiple(page.elements.map((el) => el.id));
  }

  function insertHeading() {
    store.addElement({
      id: generateElementId('text'),
      type: 'text',
      name: '标题',
      left: 80,
      top: 80,
      width: 300,
      height: 40,
      rotation: 0,
      opacity: 1,
      visible: true,
      locked: false,
      zIndex: 0,
      content: '标题文本',
      fontSize: 24,
      fontFamily: 'Microsoft YaHei, sans-serif',
      fontWeight: 'bold',
      fontStyle: 'normal',
      textAlign: 'left',
      lineHeight: 1.3,
      letterSpacing: 1,
      color: '#1a1a1a',
      underline: false,
      strikethrough: false,
    });
  }

  function insertCircle() {
    store.addElement({
      id: generateElementId('shape'),
      type: 'shape',
      name: '圆形',
      left: 100,
      top: 100,
      width: 100,
      height: 100,
      rotation: 0,
      opacity: 1,
      visible: true,
      locked: false,
      zIndex: 0,
      shapeType: 'circle',
      fill: '#dbeafe',
      strokeColor: '#60a5fa',
      strokeWidth: 1,
      borderRadius: 0,
    });
  }

  function insertDivider() {
    store.addElement({
      id: generateElementId('shape'),
      type: 'shape',
      name: '分割线',
      left: 60,
      top: 200,
      width: 400,
      height: 2,
      rotation: 0,
      opacity: 1,
      visible: true,
      locked: false,
      zIndex: 0,
      shapeType: 'line',
      fill: 'transparent',
      strokeColor: '#d1d5db',
      strokeWidth: 1,
      borderRadius: 0,
    });
  }

  // ============================================================
  // 全局快捷键
  // ============================================================
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey;
      const shift = e.shiftKey;
      const tag = (document.activeElement as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || document.querySelector('[role="dialog"]')) return;

      if (ctrl && e.key === 'o') {
        e.preventDefault();
        setImportOpen(true);
      }
      if (ctrl && e.key === 's') {
        e.preventDefault();
        saveDocument();
      }
      if (ctrl && e.key === 'g') {
        e.preventDefault();
        store.toggleGrid();
      }
      if (ctrl && e.key === 'b') {
        e.preventDefault();
        store.toggleLeftPanel();
      }
      if (ctrl && e.key === '.') {
        e.preventDefault();
        store.toggleRightPanel();
      }
      if (ctrl && e.key === 'j') {
        e.preventDefault();
        store.toggleBottomPanel();
      }
      if (ctrl && e.key === '=') {
        e.preventDefault();
        store.zoomIn();
      }
      if (ctrl && e.key === '-') {
        e.preventDefault();
        store.zoomOut();
      }
      if (ctrl && e.key === '0') {
        e.preventDefault();
        store.zoomToFit();
      }
      if (ctrl && e.key === 'a') {
        e.preventDefault();
        selectAll();
      }
      if (ctrl && !shift && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        store.undo();
      }
      if (ctrl && ((shift && (e.key === 'z' || e.key === 'Z')) || e.key === 'y')) {
        e.preventDefault();
        store.redo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <>
      <motion.div
        ref={menuBarRef}
        initial={false}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        className="editor-menubar h-10 bg-background border-b border-border flex items-center px-2 gap-0.5 select-none relative z-50"
      >
        {/* 菜单按钮 */}
        {Object.keys(menus).map((menuName) => (
          <div key={menuName} className="relative">
            <button
              className={`px-2.5 py-1 text-sm rounded-md transition-colors ${
                activeMenu === menuName
                  ? 'bg-accent text-foreground'
                  : 'text-foreground/80 hover:bg-accent hover:text-foreground'
              }`}
              onClick={() => setActiveMenu(activeMenu === menuName ? null : menuName)}
              onMouseEnter={() => activeMenu && setActiveMenu(menuName)}
            >
              {menuName}
            </button>

            {/* 下拉菜单 */}
            <AnimatePresence>
              {activeMenu === menuName && (
                <motion.div
                  initial={{ opacity: 0, y: -4, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -4, scale: 0.98 }}
                  transition={{ duration: 0.12 }}
                  className="absolute top-full left-0 mt-1 w-56 bg-popover border border-border rounded-lg shadow-xl py-1 z-50"
                >
                  {menus[menuName].map((item, i) =>
                    item.separator ? (
                      <div key={i} className="h-px bg-border my-1 mx-2" />
                    ) : (
                      <button
                        key={i}
                        className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-sm text-left transition-colors ${
                          item.disabled
                            ? 'text-muted-foreground/50 cursor-not-allowed'
                            : 'text-foreground hover:bg-accent'
                        }`}
                        onClick={item.disabled ? undefined : item.action}
                        disabled={item.disabled}
                      >
                        <span className="w-4 flex-shrink-0 text-muted-foreground">{item.icon}</span>
                        <span className="flex-1">{item.label}</span>
                        {item.shortcut && (
                          <span className="text-[10px] text-muted-foreground/60 font-mono">
                            {item.shortcut}
                          </span>
                        )}
                      </button>
                    )
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))}

        <div className="fr-menu-actions ml-auto flex items-center gap-1">
          <ToolButton
            icon={<History className="w-4 h-4" />}
            tooltip={labels.versions}
            onClick={triggerOpenVersions}
          />
          <div className="w-px h-5 bg-border mx-1" />
          <ToolButton
            icon={<Undo2 className="w-4 h-4" />}
            tooltip="撤销 (Ctrl+Z)"
            onClick={store.undo}
          />
          <ToolButton
            icon={<Redo2 className="w-4 h-4" />}
            tooltip="重做 (Ctrl+Shift+Z)"
            onClick={store.redo}
          />
          <div className="w-px h-5 bg-border mx-1" />
          <ToolButton
            icon={<Upload className="w-4 h-4" />}
            tooltip="导入 (Ctrl+O)"
            onClick={() => setImportOpen(true)}
          />
          <ToolButton
            icon={<Download className="w-4 h-4" />}
            tooltip="导出 PDF"
            onClick={exportPDF}
          />
          <div className="w-px h-5 bg-border mx-1" />
          <ToolButton
            icon={<Save className="w-4 h-4" />}
            tooltip={`${labels.save} (Ctrl+S)`}
            active={isDirty}
            onClick={saveDocument}
          />

          <div className="w-px h-5 bg-border mx-1" />
          <ToolButton icon={<PanelLeft className="w-4 h-4" />} tooltip={labels.showLeft} pressed={ui.leftPanelVisible} onClick={store.toggleLeftPanel}/>
          <ToolButton icon={<PanelRight className="w-4 h-4" />} tooltip={labels.showRight} pressed={ui.rightPanelVisible} onClick={store.toggleRightPanel}/>

        </div>
      </motion.div>

      {/* 导入对话框 */}

    </>
  );
};

// ============================================================
// 工具按钮
// ============================================================
const ToolButton: React.FC<{
  icon: React.ReactNode;
  tooltip: string;
  active?: boolean;
  pressed?: boolean;
  onClick?: () => void;
}> = ({ icon, tooltip, active, pressed, onClick }) => (
  <button
    type="button"
    aria-label={tooltip}
    aria-pressed={pressed}
    className={`fr-menu-tool p-1.5 rounded-md ${
      (active || pressed)
        ? 'text-primary bg-primary/10'
        : 'text-muted-foreground hover:text-foreground hover:bg-accent'
    }`}
    title={tooltip}
    onClick={onClick}
  >
    {icon}
  </button>
);

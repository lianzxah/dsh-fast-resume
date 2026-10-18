import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

// ============================================================
// 通用右键上下文菜单
// ============================================================

export interface ContextMenuItem {
  label?: string;
  icon?: React.ReactNode;
  shortcut?: string;
  onClick?: () => void;
  disabled?: boolean;
  danger?: boolean;
  separator?: boolean;
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

export const ContextMenu: React.FC<ContextMenuProps> = ({ x, y, items, onClose }) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('mousedown', handle);
    window.addEventListener('keydown', handleEsc);
    return () => {
      window.removeEventListener('mousedown', handle);
      window.removeEventListener('keydown', handleEsc);
    };
  }, [onClose]);

  // 防止超出视口
  const style: React.CSSProperties = {
    position: 'fixed',
    left: Math.min(x, window.innerWidth - 200),
    top: Math.min(y, window.innerHeight - items.length * 30 - 10),
    zIndex: 1000,
  };

  return createPortal(
    <div
      ref={ref}
      style={style}
      className="min-w-[180px] bg-popover border border-border rounded-lg shadow-xl py-1 select-none"
    >
      {items.map((item, i) =>
        item.separator ? (
          <div key={i} className="h-px bg-border my-1 mx-2" />
        ) : (
          <button
            key={i}
            className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-sm text-left transition-colors ${
              item.disabled
                ? 'text-muted-foreground/50 cursor-not-allowed'
                : item.danger
                  ? 'text-destructive hover:bg-destructive/10'
                  : 'text-foreground hover:bg-accent'
            }`}
            disabled={item.disabled}
            onClick={() => {
              if (item.disabled) return;
              item.onClick?.();
              onClose();
            }}
          >
            <span className="w-4 flex-shrink-0 text-muted-foreground">{item.icon}</span>
            <span className="flex-1">{item.label}</span>
            {item.shortcut && (
              <span className="text-[10px] text-muted-foreground/60 font-mono">{item.shortcut}</span>
            )}
          </button>
        )
      )}
    </div>,
    document.body
  );
};

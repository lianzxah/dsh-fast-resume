import React from 'react';
import { motion } from 'motion/react';
import { Sparkles } from 'lucide-react';
import { useEditorStore } from '@/store';

export const StatusBar: React.FC = () => {
  const { document: doc, activePageIndex, viewport, ui, toggleBottomPanel } = useEditorStore();

  return (
    <motion.div
      initial={{ y: 24, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.3, delay: 0.1 }}
      className="editor-statusbar h-6 bg-primary text-primary-foreground flex items-center px-3 text-[11px] select-none"
    >
      <div className="flex items-center gap-3">
        <span>
          页面 {activePageIndex + 1} / {doc.pages.length}
        </span>
        <span className="opacity-50">|</span>
        <span>
          {doc.pageConfig.width} x {doc.pageConfig.height} mm
        </span>
        <span className="opacity-50">|</span>
        <motion.span
          key={Math.round(viewport.zoom.level * 100)}
          initial={{ scale: 1.3 }}
          animate={{ scale: 1 }}
          transition={{ duration: 0.2 }}
        >
          {Math.round(viewport.zoom.level * 100)}%
        </motion.span>
      </div>

      <div className="ml-auto flex items-center gap-3">
        <motion.button
          className="flex items-center gap-1 relative"
          onClick={toggleBottomPanel}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          <motion.div
            animate={{
              opacity: [0.5, 1, 0.5],
              scale: [1, 1.1, 1],
            }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          >
            <Sparkles className="w-3 h-3" />
          </motion.div>
          <span>AI助手</span>
          {ui.bottomPanelVisible && (
            <motion.div
              className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-green-400 rounded-full"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 500 }}
            />
          )}
        </motion.button>
        <span className="opacity-50">|</span>
        <span className="opacity-70">
          {ui.showGrid ? '网格' : ''} {ui.snapToGrid ? '吸附' : ''}
        </span>
      </div>
    </motion.div>
  );
};

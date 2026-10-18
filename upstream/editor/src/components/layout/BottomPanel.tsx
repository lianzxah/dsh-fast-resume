import React from 'react';
import { Sparkles, X } from 'lucide-react';
import { useEditorStore } from '@/store';
import { AiAssistantPanel } from '@/components/ai/AiAssistantPanel';

export const BottomPanel: React.FC = () => {
  const { ui, toggleBottomPanel } = useEditorStore();

  if (!ui.bottomPanelVisible) return null;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
      <div className="h-9 shrink-0 flex items-center justify-between px-3 border-b border-border bg-muted/30">
        <div className="flex items-center gap-2">
          <Sparkles className="w-3.5 h-3.5 text-primary" />
          <span className="text-xs font-medium">AI 简历助手</span>
        </div>
        <button
          className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
          onClick={toggleBottomPanel}
          title="关闭 AI 助手"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="min-h-0 flex-1">
        <AiAssistantPanel />
      </div>
    </div>
  );
};

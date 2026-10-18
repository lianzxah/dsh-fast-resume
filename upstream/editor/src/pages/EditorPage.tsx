import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { PanelGroup, Panel, PanelResizeHandle } from 'react-resizable-panels';
import { GripHorizontal, GripVertical, Loader2, FileWarning } from 'lucide-react';
import { MenuBar, LeftPanel, RightPanel, CanvasWorkspace, BottomPanel, StatusBar } from '@/components/layout';
import { VersionHistoryDialog } from '@/components/VersionHistoryDialog';
import { useEditorStore } from '@/store';
import { resumeApi } from '@/lib/api';
import { useResumePersistence, readBackup } from '@/hooks/useResumePersistence';
import { registerManualSave, registerOpenVersions } from '@/lib/save-bus';
import type { ResumeDocument } from '@resume-editor/shared';

export const EditorPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { setDocument, setResumeId } = useEditorStore();
  const ui = useEditorStore((s) => s.ui);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [versionsOpen, setVersionsOpen] = useState(false);

  const { saveNow } = useResumePersistence(status === 'ready' ? id ?? null : null);

  // 装载简历
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setStatus('loading');
    (async () => {
      try {
        const detail = await resumeApi.get(id);
        if (cancelled) return;
        let doc = detail.document as ResumeDocument;
        // localStorage 兜底：若存在未成功上传的本地备份，优先采用
        const backup = readBackup(id);
        const useBackup = backup && JSON.stringify(backup) !== JSON.stringify(doc);
        setDocument(useBackup ? (backup as ResumeDocument) : doc);
        setResumeId(id);
        if (useBackup) useEditorStore.getState().markDirty();
        setStatus('ready');
      } catch (e: any) {
        if (cancelled) return;
        setError(e?.message || '加载失败');
        setStatus('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, setDocument, setResumeId]);

  // 注册手动保存 / 版本历史触发
  useEffect(() => {
    registerManualSave(() => saveNow());
    registerOpenVersions(() => setVersionsOpen(true));
    return () => {
      registerManualSave(null);
      registerOpenVersions(null);
    };
  }, [saveNow]);

  if (status === 'loading') {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-background text-muted-foreground">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center gap-3 bg-background text-muted-foreground">
        <FileWarning className="w-8 h-8" />
        <p className="text-sm">{error}</p>
        <button onClick={() => navigate('/')} className="text-sm text-primary">
          返回首页
        </button>
      </div>
    );
  }

  return (
    <DndProvider backend={HTML5Backend}>
      <div className="h-screen w-screen overflow-hidden flex flex-col bg-background">
        <MenuBar />

        <PanelGroup direction="vertical" className="flex-1 min-h-0">
          <Panel defaultSize={ui.bottomPanelVisible ? 68 : 100} minSize={32} order={1}>
            <PanelGroup direction="horizontal" className="h-full min-h-0">
              {ui.leftPanelVisible && (
                <>
                  <Panel defaultSize={18} minSize={12} maxSize={30} collapsible order={1}>
                    <LeftPanel />
                  </Panel>
                  <PanelResizeHandle className="group relative w-[3px] bg-border hover:bg-primary/40 active:bg-primary/60 transition-colors data-[resize-handle-active]:bg-primary/60">
                    <div className="absolute inset-y-0 -left-[3px] -right-[3px]" />
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <GripVertical className="w-3 h-3 text-muted-foreground" />
                    </div>
                  </PanelResizeHandle>
                </>
              )}

              <Panel defaultSize={64} minSize={30} order={2}>
                <CanvasWorkspace />
              </Panel>

              {ui.rightPanelVisible && (
                <>
                  <PanelResizeHandle className="group relative w-[3px] bg-border hover:bg-primary/40 active:bg-primary/60 transition-colors data-[resize-handle-active]:bg-primary/60">
                    <div className="absolute inset-y-0 -left-[3px] -right-[3px]" />
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <GripVertical className="w-3 h-3 text-muted-foreground" />
                    </div>
                  </PanelResizeHandle>
                  <Panel defaultSize={18} minSize={14} maxSize={30} collapsible order={3}>
                    <RightPanel />
                  </Panel>
                </>
              )}
            </PanelGroup>
          </Panel>

          {ui.bottomPanelVisible && (
            <>
              <PanelResizeHandle className="group relative h-[6px] bg-border hover:bg-primary/35 active:bg-primary/60 transition-colors data-[resize-handle-active]:bg-primary/60">
                <div className="absolute -top-[4px] -bottom-[4px] inset-x-0" />
                <div className="absolute left-1/2 top-1/2 flex h-4 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-background text-muted-foreground opacity-0 shadow-sm transition-opacity group-hover:opacity-100 group-data-[resize-handle-active]:opacity-100">
                  <GripHorizontal className="h-3.5 w-3.5" />
                </div>
              </PanelResizeHandle>
              <Panel defaultSize={32} minSize={18} maxSize={68} collapsible order={2}>
                <BottomPanel />
              </Panel>
            </>
          )}
        </PanelGroup>
        <StatusBar />
      </div>

      {id && (
        <VersionHistoryDialog
          resumeId={id}
          open={versionsOpen}
          onClose={() => setVersionsOpen(false)}
          onRestored={(doc, version) => {
            setDocument(doc);
            setResumeId(id);
            useEditorStore.getState().setSaveState({ lastSavedAt: new Date().toISOString() });
            void version;
          }}
        />
      )}
    </DndProvider>
  );
};

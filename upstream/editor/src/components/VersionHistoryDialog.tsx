import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { X, History, Loader2, RotateCcw } from 'lucide-react';
import type { ResumeVersionDTO, ResumeDocument } from '@resume-editor/shared';
import { resumeApi } from '@/lib/api';
import { AuthImage } from '@/components/AuthImage';

interface Props {
  resumeId: string;
  open: boolean;
  onClose: () => void;
  /** 回滚后回调：应用返回的文档与新版本号 */
  onRestored: (document: ResumeDocument, currentVersion: number) => void;
}

export const VersionHistoryDialog: React.FC<Props> = ({ resumeId, open, onClose, onRestored }) => {
  const [versions, setVersions] = useState<ResumeVersionDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    resumeApi
      .versions(resumeId)
      .then(setVersions)
      .catch(() => setVersions([]))
      .finally(() => setLoading(false));
  }, [open, resumeId]);

  const handleRestore = async (version: number) => {
    if (!confirm(`回滚到版本 v${version}？将基于该版本生成一个新版本。`)) return;
    setRestoring(version);
    try {
      const { meta, document } = await resumeApi.restore(resumeId, version);
      onRestored(document, meta.currentVersion);
      onClose();
    } catch (e: any) {
      alert(e?.message || '回滚失败');
    } finally {
      setRestoring(null);
    }
  };

  if (!open) return null;

  return createPortal(
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[100] flex items-center justify-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
        <motion.div
          className="relative bg-background rounded-xl shadow-2xl border border-border w-[520px] max-h-[80vh] overflow-hidden"
          initial={{ scale: 0.95, y: 20 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.95, y: 20 }}
        >
          <div className="flex items-center justify-between px-5 py-3 border-b border-border">
            <div className="flex items-center gap-2">
              <History className="w-4 h-4 text-primary" />
              <h2 className="text-sm font-semibold">版本历史</h2>
            </div>
            <button onClick={onClose} className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-4 overflow-y-auto max-h-[68vh]">
            {loading ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                <Loader2 className="w-6 h-6 animate-spin" />
              </div>
            ) : versions.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-12">暂无版本记录</p>
            ) : (
              <div className="space-y-2">
                {versions.map((v) => (
                  <div
                    key={v.id}
                    className="flex items-center gap-3 p-2.5 rounded-lg border border-border hover:bg-accent/50 transition-colors"
                  >
                    <div className="w-12 h-16 rounded bg-slate-100 overflow-hidden flex items-center justify-center flex-shrink-0">
                      <AuthImage
                        src={v.thumbnail}
                        className="w-full h-full object-cover object-top"
                        fallback={<History className="w-4 h-4 text-slate-300" />}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">
                        版本 v{v.version}
                        {v.message && <span className="ml-2 text-xs text-muted-foreground">{v.message}</span>}
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {new Date(v.createdAt).toLocaleString('zh-CN', { hour12: false })}
                      </p>
                    </div>
                    <button
                      onClick={() => handleRestore(v.version)}
                      disabled={restoring !== null}
                      className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-md bg-primary/10 text-primary hover:bg-primary/20 transition-colors disabled:opacity-50"
                    >
                      {restoring === v.version ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                      回滚
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
};

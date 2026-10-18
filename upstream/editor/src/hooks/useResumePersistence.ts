import { useCallback, useEffect, useRef } from 'react';
import { useEditorStore } from '@/store';
import { resumeApi } from '@/lib/api';
import { renderPageToDataURL } from '@resume-editor/canvas-engine';
import type { ResumeDocument } from '@resume-editor/shared';

// ============================================================
// 简历持久化 Hook
// 防抖自动保存 + localStorage 兜底 + 缩略图生成 + 手动保存(生成版本)。
// ============================================================

const AUTOSAVE_DELAY = 2000;
const BACKUP_PREFIX = 'resume-editor-backup-';

export function backupKey(resumeId: string): string {
  return `${BACKUP_PREFIX}${resumeId}`;
}

/** 读取本地兜底备份 */
export function readBackup(resumeId: string): ResumeDocument | null {
  try {
    const raw = localStorage.getItem(backupKey(resumeId));
    return raw ? (JSON.parse(raw) as ResumeDocument) : null;
  } catch {
    return null;
  }
}

/** 生成首页缩略图 (低倍率 PNG dataURL) */
async function makeThumbnail(doc: ResumeDocument): Promise<string | undefined> {
  try {
    const page = doc.pages[0];
    if (!page) return undefined;
    return await renderPageToDataURL(page, doc.pageConfig, { pixelRatio: 0.35 });
  } catch {
    return undefined;
  }
}

export function useResumePersistence(resumeId: string | null) {
  const timer = useRef<number | null>(null);

  const doSave = useCallback(async (createVersion: boolean, message?: string) => {
    const store = useEditorStore.getState();
    const rid = store.resumeId;
    if (!rid) return;
    const doc = store.document;
    store.setSaveState({ isSaving: true, saveError: null });
    try {
      const thumbnail = await makeThumbnail(doc);
      await resumeApi.update(rid, {
        title: doc.metadata.title,
        document: doc,
        thumbnail,
        createVersion,
        message,
      });
      store.markClean();
      store.setSaveState({ isSaving: false, lastSavedAt: new Date().toISOString() });
      try {
        localStorage.removeItem(backupKey(rid));
      } catch {
        /* ignore */
      }
    } catch (e: any) {
      store.setSaveState({ isSaving: false, saveError: e?.message || '保存失败' });
      // 兜底：写入 localStorage，避免数据丢失
      try {
        localStorage.setItem(backupKey(rid), JSON.stringify(doc));
      } catch {
        /* ignore */
      }
    }
  }, []);

  /** 手动保存 (生成版本快照) */
  const saveNow = useCallback(() => doSave(true, '手动保存'), [doSave]);

  // 自动保存：订阅 store，文档变化且 dirty 时防抖保存
  useEffect(() => {
    if (!resumeId) return;
    const unsub = useEditorStore.subscribe((state, prev) => {
      if (state.document === prev.document) return;
      if (!state.isDirty) return;
      // 立即写本地兜底
      try {
        localStorage.setItem(backupKey(resumeId), JSON.stringify(state.document));
      } catch {
        /* ignore */
      }
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => doSave(false), AUTOSAVE_DELAY);
    });
    return () => {
      unsub();
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [resumeId, doSave]);

  return { saveNow };
}

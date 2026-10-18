import type { ResumeDocument } from '@resume-editor/shared';
import { generateId } from '@resume-editor/shared';

// ============================================================
// 撤销/重做 历史管理器
// ============================================================

export interface HistoryEntry {
  id: string;
  timestamp: number;
  description: string;
  snapshot: string; // JSON serialized document
}

export interface HistoryManagerOptions {
  maxEntries?: number;
  onChange?: (canUndo: boolean, canRedo: boolean) => void;
}

export class HistoryManager {
  private entries: HistoryEntry[] = [];
  private currentIndex = -1;
  private maxEntries: number;
  private onChange?: (canUndo: boolean, canRedo: boolean) => void;

  constructor(options: HistoryManagerOptions = {}) {
    this.maxEntries = options.maxEntries || 50;
    this.onChange = options.onChange;
  }

  /** 推入新的历史记录 */
  push(document: ResumeDocument, description: string): void {
    // 删除当前位置之后的所有记录
    this.entries = this.entries.slice(0, this.currentIndex + 1);

    const entry: HistoryEntry = {
      id: generateId('hist'),
      timestamp: Date.now(),
      description,
      snapshot: JSON.stringify(document),
    };

    this.entries.push(entry);

    // 限制历史数量
    if (this.entries.length > this.maxEntries) {
      this.entries.shift();
    } else {
      this.currentIndex++;
    }

    this.notifyChange();
  }

  /** 撤销 */
  undo(): ResumeDocument | null {
    if (!this.canUndo()) return null;
    this.currentIndex--;
    this.notifyChange();
    return JSON.parse(this.entries[this.currentIndex].snapshot);
  }

  /** 重做 */
  redo(): ResumeDocument | null {
    if (!this.canRedo()) return null;
    this.currentIndex++;
    this.notifyChange();
    return JSON.parse(this.entries[this.currentIndex].snapshot);
  }

  /** 是否可撤销 */
  canUndo(): boolean {
    return this.currentIndex > 0;
  }

  /** 是否可重做 */
  canRedo(): boolean {
    return this.currentIndex < this.entries.length - 1;
  }

  /** 获取当前快照 */
  getCurrentSnapshot(): ResumeDocument | null {
    if (this.currentIndex < 0) return null;
    return JSON.parse(this.entries[this.currentIndex].snapshot);
  }

  /** 获取历史列表 */
  getEntries(): HistoryEntry[] {
    return [...this.entries];
  }

  /** 获取当前索引 */
  getCurrentIndex(): number {
    return this.currentIndex;
  }

  /** 清空历史 */
  clear(): void {
    this.entries = [];
    this.currentIndex = -1;
    this.notifyChange();
  }

  private notifyChange(): void {
    this.onChange?.(this.canUndo(), this.canRedo());
  }
}

// ============================================================
// 手动保存总线
// 解耦 MenuBar (触发) 与 EditorPage (持有 saveNow 实现)。
// ============================================================

let manualSave: (() => void) | null = null;

export function registerManualSave(fn: (() => void) | null): void {
  manualSave = fn;
}

export function triggerManualSave(): void {
  manualSave?.();
}

let openVersions: (() => void) | null = null;

export function registerOpenVersions(fn: (() => void) | null): void {
  openVersions = fn;
}

export function triggerOpenVersions(): void {
  openVersions?.();
}

import React, { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { AlertTriangle, Loader2, X } from 'lucide-react';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  loading?: boolean;
  error?: string;
  fallbackFocusRef?: React.RefObject<HTMLElement>;
  onConfirm: () => void;
  onClose: () => void;
}

export const ConfirmDialog = React.memo<ConfirmDialogProps>(
  ({
    open,
    title,
    description,
    confirmLabel = '确认删除',
    cancelLabel = '取消',
    loading = false,
    error,
    fallbackFocusRef,
    onConfirm,
    onClose,
  }) => {
    const cancelButtonRef = useRef<HTMLButtonElement>(null);
    const dialogRef = useRef<HTMLDivElement>(null);
    const loadingRef = useRef(loading);
    loadingRef.current = loading;
    const titleId = useId();
    const descriptionId = useId();

    useEffect(() => {
      if (!open) return;
      const previousFocus = document.activeElement as HTMLElement | null;
      const previousOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      cancelButtonRef.current?.focus();

      const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key === 'Escape' && !loadingRef.current) {
          onClose();
          return;
        }
        if (event.key !== 'Tab') return;
        const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (!focusable?.length) {
          event.preventDefault();
          dialogRef.current?.focus();
          return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (!dialogRef.current?.contains(document.activeElement)) {
          event.preventDefault();
          (event.shiftKey ? last : first).focus();
        } else if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      };
      document.addEventListener('keydown', handleKeyDown);

      return () => {
        document.removeEventListener('keydown', handleKeyDown);
        document.body.style.overflow = previousOverflow;
        if (previousFocus?.isConnected) previousFocus.focus();
        else fallbackFocusRef?.current?.focus();
      };
    }, [fallbackFocusRef, onClose, open]);

    useEffect(() => {
      if (!open) return;
      if (loading) dialogRef.current?.focus();
      else cancelButtonRef.current?.focus();
    }, [loading, open]);

    return createPortal(
      <AnimatePresence>
        {open && (
          <motion.div
            className="fixed inset-0 z-[120] flex items-center justify-center px-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <button
              type="button"
              className="absolute inset-0 cursor-default bg-slate-950/45 backdrop-blur-[2px]"
              aria-label="关闭确认弹窗"
              disabled={loading}
              onClick={onClose}
            />
            <motion.div
              ref={dialogRef}
              tabIndex={-1}
              role="alertdialog"
              aria-modal="true"
              aria-busy={loading}
              aria-labelledby={titleId}
              aria-describedby={descriptionId}
              className="relative w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
              initial={{ scale: 0.96, y: 16 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.96, y: 16 }}
              transition={{ type: 'spring', stiffness: 360, damping: 30 }}
            >
              <div className="flex items-start gap-3 px-5 pb-4 pt-5">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-red-50 text-red-600">
                  <AlertTriangle className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 id={titleId} className="text-base font-semibold text-slate-900">
                    {title}
                  </h2>
                  <div id={descriptionId} className="mt-1.5 text-sm leading-6 text-slate-600">
                    {description}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  disabled={loading}
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40"
                  aria-label="关闭"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {error && (
                <div
                  role="alert"
                  className="mx-5 mb-4 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700"
                >
                  {error}
                </div>
              )}

              <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50/80 px-5 py-3.5">
                <button
                  ref={cancelButtonRef}
                  type="button"
                  onClick={onClose}
                  disabled={loading}
                  className="h-9 rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  {cancelLabel}
                </button>
                <button
                  type="button"
                  onClick={onConfirm}
                  disabled={loading}
                  className="inline-flex h-9 min-w-24 items-center justify-center gap-2 rounded-lg bg-red-600 px-4 text-sm font-medium text-white shadow-sm hover:bg-red-700 disabled:cursor-wait disabled:opacity-70"
                >
                  {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                  {loading ? '正在删除' : confirmLabel}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>,
      document.body
    );
  }
);

ConfirmDialog.displayName = 'ConfirmDialog';

import React, { useEffect, useId, useRef, useState } from 'react';
import { AlertTriangle, Trash2, X } from 'lucide-react';

export interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'warning';
  requireAcknowledge?: boolean;
  acknowledgeLabel?: string;
  requireReason?: boolean;
  reasonLabel?: string;
  reasonPlaceholder?: string;
  isProcessing?: boolean;
  onCancel: () => void;
  onConfirm: (reason?: string) => void | Promise<void>;
}

/** Shared accessible confirmation dialog for destructive and irreversible actions. */
export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  title,
  message,
  confirmLabel = 'Yes, Delete',
  cancelLabel = 'No, Cancel',
  tone = 'danger',
  requireAcknowledge = false,
  acknowledgeLabel = 'Yes, I am sure — this action cannot be undone',
  requireReason = false,
  reasonLabel = 'Reason *',
  reasonPlaceholder = 'Please enter a reason',
  isProcessing = false,
  onCancel,
  onConfirm,
}) => {
  const [acknowledged, setAcknowledged] = useState(false);
  const [reason, setReason] = useState('');
  const cancelButtonRef = useRef<HTMLButtonElement | null>(null);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    if (!isOpen) return;
    setAcknowledged(false);
    setReason('');
    const raf = window.requestAnimationFrame(() => {
      cancelButtonRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(raf);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isProcessing) {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isProcessing, onCancel]);

  if (!isOpen) return null;

  const isDanger = tone === 'danger';
  const canConfirm =
    !isProcessing &&
    (!requireAcknowledge || acknowledged) &&
    (!requireReason || reason.trim().length > 0);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs overflow-y-auto ui-backdrop"
      onClick={() => {
        if (!isProcessing) onCancel();
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        onClick={(e) => e.stopPropagation()}
        className={`relative bg-white rounded-3xl p-5 sm:p-6 max-w-md w-full max-h-[90dvh] overflow-y-auto my-auto space-y-4 shadow-2xl border ui-modal ${
          isDanger ? 'border-red-200' : 'border-amber-200'
        }`}
      >
        <button
          type="button"
          onClick={onCancel}
          disabled={isProcessing}
          aria-label={cancelLabel}
          className="absolute top-3.5 right-3.5 p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 ui-press cursor-pointer disabled:opacity-40"
        >
          <X className="w-4 h-4" />
        </button>

        <div
          className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto ui-pop ${
            isDanger ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-600'
          }`}
        >
          {isDanger ? <Trash2 className="w-6 h-6" /> : <AlertTriangle className="w-6 h-6" />}
        </div>

        <div className="text-center space-y-1.5 px-1">
          <h3 id={titleId} className="text-base font-bold text-slate-900">
            {title}
          </h3>
          <div id={descId} className="text-xs text-slate-600 leading-relaxed">
            {message}
          </div>
        </div>

        {requireReason && (
          <div className="space-y-1.5 text-left">
            <label className="block text-xs font-bold text-slate-700">{reasonLabel}</label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={reasonPlaceholder}
              disabled={isProcessing}
              className="w-full px-3 py-2.5 text-xs bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500"
            />
          </div>
        )}

        {requireAcknowledge && (
          <label
            className={`flex items-start gap-2.5 p-3 rounded-xl border text-left cursor-pointer select-none ${
              isDanger
                ? 'bg-red-50/70 border-red-200 text-red-900'
                : 'bg-amber-50/70 border-amber-200 text-amber-900'
            }`}
          >
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
              disabled={isProcessing}
              className="mt-0.5 w-4 h-4 rounded accent-red-600 cursor-pointer shrink-0"
            />
            <span className="text-xs font-semibold leading-snug">{acknowledgeLabel}</span>
          </label>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
          <button
            ref={cancelButtonRef}
            type="button"
            onClick={onCancel}
            disabled={isProcessing}
            className="w-full min-h-[44px] px-4 py-2.5 border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 rounded-xl text-xs font-bold cursor-pointer ui-press disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={!canConfirm}
            onClick={() => onConfirm(requireReason ? reason.trim() : undefined)}
            className={`w-full min-h-[44px] px-4 py-2.5 text-white rounded-xl text-xs font-bold cursor-pointer ui-press shadow-xs disabled:opacity-45 disabled:cursor-not-allowed ${
              isDanger ? 'bg-red-600 hover:bg-red-700' : 'bg-amber-600 hover:bg-amber-700'
            }`}
          >
            {isProcessing ? 'Processing...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

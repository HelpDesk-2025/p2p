import { useState } from 'react';
import { AlertTriangle, HelpCircle, X, Loader2 } from 'lucide-react';

export interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'primary';
  requireInput?: boolean;
  inputLabel?: string;
  inputPlaceholder?: string;
  loading?: boolean;
  onConfirm: (inputValue?: string) => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'primary',
  requireInput = false,
  inputLabel = 'Reason',
  inputPlaceholder = 'Enter a reason...',
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const [inputValue, setInputValue] = useState('');

  if (!isOpen) return null;

  const isDanger = variant === 'danger';
  const canConfirm = !requireInput || inputValue.trim().length > 0;

  const handleConfirm = () => {
    if (!canConfirm || loading) return;
    onConfirm(requireInput ? inputValue.trim() : undefined);
  };

  const handleCancel = () => {
    if (loading) return;
    setInputValue('');
    onCancel();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={handleCancel} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="px-6 py-5 flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div
              className={`w-10 h-10 shrink-0 rounded-xl flex items-center justify-center ${
                isDanger ? 'bg-red-100' : 'bg-blue-100'
              }`}
            >
              {isDanger ? (
                <AlertTriangle className="w-5 h-5 text-red-600" />
              ) : (
                <HelpCircle className="w-5 h-5 text-blue-600" />
              )}
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">{title}</h3>
              <p className="text-sm text-slate-600 mt-1">{message}</p>
            </div>
          </div>
          <button
            onClick={handleCancel}
            className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors shrink-0"
            disabled={loading}
          >
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>

        {requireInput && (
          <div className="px-6 pb-2">
            <label className="block text-sm font-medium text-slate-700 mb-1">
              {inputLabel}
            </label>
            <textarea
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder={inputPlaceholder}
              rows={3}
              autoFocus
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
            />
          </div>
        )}

        <div className="px-6 py-4 flex items-center justify-end gap-3 border-t border-slate-200 mt-4">
          <button
            onClick={handleCancel}
            disabled={loading}
            className="px-4 py-2 text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50 transition disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            onClick={handleConfirm}
            disabled={!canConfirm || loading}
            className={`px-4 py-2 rounded-lg text-white transition flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed ${
              isDanger ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

import { useState } from 'react';
import { X, Paperclip, Loader2, AlertTriangle } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface ChangeAttachmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  requestType: string;
  requestId: string;
  requestNumber: string;
  requesterId: string;
  companyId?: string;
  approverId: string;
  approverName: string;
  onSuccess: () => void;
}

export function ChangeAttachmentModal({
  isOpen,
  onClose,
  requestType,
  requestId,
  requestNumber,
  requesterId,
  companyId,
  approverId,
  approverName,
  onSuccess,
}: ChangeAttachmentModalProps) {
  const [remarks, setRemarks] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!remarks.trim()) {
      alert('Please provide remarks explaining what attachment changes are needed.');
      return;
    }

    if (!confirm(`Are you sure you want to request an attachment change on ${requestNumber}?`)) {
      return;
    }

    setSubmitting(true);
    try {
      const { error: insertError } = await supabase
        .from('attachment_change_requests')
        .insert({
          request_type: requestType,
          request_id: requestId,
          request_number: requestNumber,
          requested_by: approverId,
          requested_by_name: approverName,
          requester_id: requesterId,
          company_id: companyId || null,
          attachments_to_replace: [],
          remarks: remarks.trim(),
          status: 'pending',
        });

      if (insertError) {
        if (insertError.code === '23505') {
          alert('There is already a pending attachment change request for this document. Please wait for the requester to complete it first.');
        } else {
          throw insertError;
        }
        setSubmitting(false);
        return;
      }

      await supabase.from('user_notifications').insert({
        user_id: requesterId,
        title: 'Attachment Change Requested',
        message: `${approverName} has requested an attachment change on ${requestType} ${requestNumber}: "${remarks.trim()}"`,
        notification_type: 'attachment_change',
        request_type: requestType,
        request_number: requestNumber,
        request_id: requestId,
      });

      alert('Attachment change request submitted successfully. The requester has been notified.');
      setRemarks('');
      onSuccess();
      onClose();
    } catch (error: any) {
      console.error('Error requesting attachment change:', error);
      alert('Failed to submit attachment change request: ' + (error.message || 'Unknown error'));
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg">
        <div className="border-b border-slate-200 px-6 py-4 flex items-center justify-between rounded-t-xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center">
              <Paperclip className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">Request Attachment Change</h3>
              <p className="text-sm text-slate-500">{requestNumber}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg transition">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-amber-800">
              This will notify the requester to replace their attachment(s). The approval progress will not be affected.
            </p>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              Instructions for the Requester <span className="text-red-500">*</span>
            </label>
            <textarea
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="Describe what attachment(s) need to be changed and why..."
              rows={4}
              className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-sm resize-none"
            />
          </div>
        </div>

        <div className="border-t border-slate-200 px-6 py-4 flex gap-3 rounded-b-xl">
          <button
            onClick={onClose}
            disabled={submitting}
            className="flex-1 px-4 py-2.5 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition font-medium text-sm disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || !remarks.trim()}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Paperclip className="w-4 h-4" />}
            {submitting ? 'Submitting...' : 'Request Change'}
          </button>
        </div>
      </div>
    </div>
  );
}

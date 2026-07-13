import { useState } from 'react';
import { X, Paperclip, Loader2, AlertTriangle } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface AttachmentItem {
  name: string;
  index: number;
}

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
  attachments: AttachmentItem[];
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
  attachments,
  onSuccess,
}: ChangeAttachmentModalProps) {
  const [selectedAttachments, setSelectedAttachments] = useState<number[]>([]);
  const [remarks, setRemarks] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const toggleAttachment = (index: number) => {
    setSelectedAttachments(prev =>
      prev.includes(index) ? prev.filter(i => i !== index) : [...prev, index]
    );
  };

  const handleSubmit = async () => {
    if (selectedAttachments.length === 0) {
      alert('Please select at least one attachment to replace.');
      return;
    }
    if (!remarks.trim()) {
      alert('Please provide remarks explaining why the attachment needs to be changed.');
      return;
    }

    if (!confirm(`Are you sure you want to request the requester to change ${selectedAttachments.length} attachment(s) on ${requestNumber}?`)) {
      return;
    }

    setSubmitting(true);
    try {
      const attachmentsToReplace = selectedAttachments.map(idx => ({
        name: attachments[idx].name,
        index: attachments[idx].index,
      }));

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
          attachments_to_replace: attachmentsToReplace,
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

      // Notify the requestor
      await supabase.from('user_notifications').insert({
        user_id: requesterId,
        title: 'Attachment Change Requested',
        message: `${approverName} has requested you to change attachment(s) on ${requestType} ${requestNumber}: ${attachmentsToReplace.map(a => a.name).join(', ')}. Reason: ${remarks.trim()}`,
        notification_type: 'attachment_change',
        request_type: requestType,
        request_number: requestNumber,
        request_id: requestId,
      });

      alert('Attachment change request submitted successfully. The requester has been notified.');
      setSelectedAttachments([]);
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
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between rounded-t-xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center">
              <Paperclip className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">Change Attachment</h3>
              <p className="text-sm text-slate-500">{requestNumber}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg transition">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-amber-800">
              This will notify the requester to replace the selected attachment(s). The approval progress will not be affected.
            </p>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              Select Attachment(s) to Replace <span className="text-red-500">*</span>
            </label>
            {attachments.length === 0 ? (
              <p className="text-sm text-slate-500 italic">No attachments found for this request.</p>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto border border-slate-200 rounded-lg p-3">
                {attachments.map((attachment, idx) => (
                  <label
                    key={idx}
                    className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition ${
                      selectedAttachments.includes(idx) ? 'bg-orange-50 border border-orange-200' : 'hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedAttachments.includes(idx)}
                      onChange={() => toggleAttachment(idx)}
                      className="w-4 h-4 rounded border-slate-300 text-orange-600 focus:ring-orange-500"
                    />
                    <Paperclip className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    <span className="text-sm text-slate-700">{attachment.name}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              Remarks <span className="text-red-500">*</span>
            </label>
            <textarea
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="Explain why this attachment needs to be changed..."
              rows={3}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-sm resize-none"
            />
          </div>
        </div>

        <div className="sticky bottom-0 bg-white border-t border-slate-200 px-6 py-4 flex gap-3 rounded-b-xl">
          <button
            onClick={onClose}
            disabled={submitting}
            className="flex-1 px-4 py-2.5 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition font-medium text-sm disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || selectedAttachments.length === 0 || !remarks.trim()}
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

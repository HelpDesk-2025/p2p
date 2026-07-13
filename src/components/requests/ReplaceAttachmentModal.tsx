import { useState } from 'react';
import { X, Upload, Loader2, Paperclip, CheckCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { mergeFilesToPDFBlob } from '../../lib/pdfMerger';
import { uploadLargeFile } from '../../lib/storageHelper';
import { AttachmentChangeRequest } from '../../lib/useAttachmentChangeRequests';

interface ReplaceAttachmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  changeRequest: AttachmentChangeRequest;
  requestType: string;
  requestId: string;
  requestNumber: string;
  requesterId: string;
  companyId?: string;
  existingChecklist: Array<{ item_name: string; fileName?: string; is_required?: boolean }>;
  existingMergedPdfPath?: string | null;
  onComplete: (newMergedPdfPath: string, updatedChecklist: any[]) => Promise<void>;
}

export function ReplaceAttachmentModal({
  isOpen,
  onClose,
  changeRequest,
  requestType,
  requestId,
  requestNumber,
  requesterId,
  companyId,
  existingChecklist,
  existingMergedPdfPath,
  onComplete,
}: ReplaceAttachmentModalProps) {
  const [files, setFiles] = useState<Record<number, File | null>>({});
  const [submitting, setSubmitting] = useState(false);

  const flaggedIndices = changeRequest.attachments_to_replace.map(a => a.index);

  const handleFileChange = (index: number, file: File | null) => {
    setFiles(prev => ({ ...prev, [index]: file }));
  };

  const allFlaggedHaveFiles = flaggedIndices.every(idx => files[idx]);

  const handleSubmit = async () => {
    if (!allFlaggedHaveFiles) {
      alert('Please upload replacement files for all flagged attachments.');
      return;
    }

    if (!confirm('Submit the replacement attachment(s)? This will update the merged PDF and notify the approver.')) {
      return;
    }

    setSubmitting(true);
    try {
      // Build new checklist with replaced files
      const updatedChecklist = existingChecklist.map((item, idx) => {
        if (files[idx]) {
          return { ...item, fileName: files[idx]!.name };
        }
        return item;
      });

      // Merge all files into PDF (use new files for flagged, need existing for others)
      // We only re-merge the flagged items since that's what changed
      const filesToMerge = flaggedIndices.map(idx => files[idx]!);
      const mergedPdfBlob = await mergeFilesToPDFBlob(filesToMerge);

      const maxSizeInBytes = 40 * 1024 * 1024;
      if (mergedPdfBlob.size > maxSizeInBytes) {
        throw new Error(`Merged PDF is too large (${(mergedPdfBlob.size / 1024 / 1024).toFixed(2)}MB). Maximum allowed size is 40MB.`);
      }

      const timestamp = Date.now();
      const mergedFileName = `merged_replacement_${timestamp}.pdf`;
      const tablePath = requestType.toLowerCase().replace(/\s+/g, '-') + 's';
      const filePath = `${tablePath}/${requesterId}/${mergedFileName}`;

      const arrayBuffer = await mergedPdfBlob.arrayBuffer();
      const { path } = await uploadLargeFile(filePath, arrayBuffer, 'application/pdf');

      await onComplete(path, updatedChecklist);

      // Complete the change request
      const { data: approvers } = await supabase
        .from('approval_ledger')
        .select('approver_id')
        .eq('request_id', requestId)
        .eq('request_type', requestType);
      const approverIds = [...new Set((approvers || []).map(a => a.approver_id).filter(Boolean))];

      // Mark completed
      await supabase
        .from('attachment_change_requests')
        .update({ status: 'completed', completed_at: new Date().toISOString() })
        .eq('id', changeRequest.id);

      // Notify approvers
      if (approverIds.length > 0) {
        const notifications = approverIds.map(approverId => ({
          user_id: approverId,
          title: 'Attachment Replaced',
          message: `The requester has replaced attachment(s) on ${requestType} ${requestNumber} as requested.`,
          notification_type: 'attachment_change' as const,
          request_type: requestType,
          request_number: requestNumber,
          request_id: requestId,
        }));
        await supabase.from('user_notifications').insert(notifications);
      }

      alert('Attachments replaced successfully. The approver(s) have been notified.');
      onClose();
    } catch (error: any) {
      console.error('Error replacing attachments:', error);
      alert('Failed to replace attachments: ' + (error.message || 'Unknown error'));
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between rounded-t-xl z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center">
              <Paperclip className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">Replace Attachment(s)</h3>
              <p className="text-sm text-slate-500">{requestNumber}</p>
            </div>
          </div>
          <button onClick={onClose} disabled={submitting} className="p-2 hover:bg-slate-100 rounded-lg transition">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
            <p className="text-sm text-orange-800">
              <span className="font-semibold">{changeRequest.requested_by_name}</span> has requested you to replace the following attachment(s):
            </p>
            <p className="text-sm text-orange-700 mt-1 italic">"{changeRequest.remarks}"</p>
          </div>

          <div className="space-y-3">
            {flaggedIndices.map(idx => {
              const item = existingChecklist[idx];
              if (!item) return null;
              const file = files[idx];
              return (
                <div key={idx} className="border border-slate-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-semibold text-slate-800">{item.item_name}</span>
                    {file && <CheckCircle className="w-4 h-4 text-green-500" />}
                  </div>
                  {item.fileName && (
                    <p className="text-xs text-slate-500 mb-2">Current: {item.fileName}</p>
                  )}
                  <label className="block">
                    <div className={`flex items-center gap-2 px-3 py-2.5 border-2 border-dashed rounded-lg cursor-pointer transition ${
                      file ? 'border-green-300 bg-green-50' : 'border-slate-300 hover:border-orange-400 hover:bg-orange-50'
                    }`}>
                      <Upload className={`w-4 h-4 ${file ? 'text-green-600' : 'text-slate-400'}`} />
                      <span className={`text-sm ${file ? 'text-green-700 font-medium' : 'text-slate-500'}`}>
                        {file ? file.name : 'Choose replacement file...'}
                      </span>
                    </div>
                    <input
                      type="file"
                      className="hidden"
                      accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx"
                      onChange={(e) => handleFileChange(idx, e.target.files?.[0] || null)}
                    />
                  </label>
                </div>
              );
            })}
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
            disabled={submitting || !allFlaggedHaveFiles}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {submitting ? 'Uploading...' : 'Submit Replacement'}
          </button>
        </div>
      </div>
    </div>
  );
}

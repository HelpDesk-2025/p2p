import { AlertTriangle } from 'lucide-react';

interface AttachmentChangeRequest {
  id: string;
  request_type: string;
  request_id: string;
  request_number: string;
  requested_by_name: string;
  attachments_to_replace: Array<{ name: string; index: number }>;
  remarks: string;
  created_at: string;
}

interface AttachmentChangeBannerProps {
  changeRequest: AttachmentChangeRequest;
  onResolve: () => void;
}

export function AttachmentChangeBanner({ changeRequest, onResolve }: AttachmentChangeBannerProps) {
  return (
    <div className="bg-orange-50 border border-orange-300 rounded-xl p-4 mb-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0">
          <AlertTriangle className="w-5 h-5 text-orange-600" />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-bold text-orange-900">Attachment Change Required</h4>
          <p className="text-sm text-orange-800 mt-1">
            <span className="font-semibold">{changeRequest.requested_by_name}</span> has requested an attachment change on <span className="font-semibold">{changeRequest.request_number}</span>.
          </p>
          <div className="mt-2 bg-white/60 rounded-lg p-2.5 border border-orange-200">
            <p className="text-xs font-semibold text-orange-700 mb-0.5">Instructions:</p>
            <p className="text-sm text-orange-800">{changeRequest.remarks}</p>
          </div>
          <button
            onClick={onResolve}
            className="mt-3 px-4 py-2 bg-orange-600 text-white text-sm font-medium rounded-lg hover:bg-orange-700 transition"
          >
            Replace Attachment(s)
          </button>
        </div>
      </div>
    </div>
  );
}

interface BlockingBannerProps {
  changeRequest: AttachmentChangeRequest;
  onResolve?: () => void;
}

export function AttachmentChangeBlockingBanner({ changeRequest, onResolve }: BlockingBannerProps) {
  return (
    <div className="bg-orange-50 border border-orange-300 rounded-xl p-4 mb-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0">
          <AlertTriangle className="w-5 h-5 text-orange-600" />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-bold text-orange-900">Action Required: Attachment Change Pending</h4>
          <p className="text-sm text-orange-800 mt-1">
            An approver has requested an attachment change on <span className="font-semibold">{changeRequest.request_number}</span>. You must resolve this before submitting new requests or editing other documents.
          </p>
          <div className="mt-2 bg-white/60 rounded-lg p-2.5 border border-orange-200">
            <p className="text-xs font-semibold text-orange-700 mb-0.5">Instructions from {changeRequest.requested_by_name}:</p>
            <p className="text-sm text-orange-800">{changeRequest.remarks}</p>
          </div>
          {onResolve && (
            <button
              onClick={onResolve}
              className="mt-3 px-4 py-2 bg-orange-600 text-white text-sm font-medium rounded-lg hover:bg-orange-700 transition"
            >
              Replace Attachment(s)
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

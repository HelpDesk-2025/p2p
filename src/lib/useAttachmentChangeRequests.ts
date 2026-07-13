import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

export interface AttachmentChangeRequest {
  id: string;
  request_type: string;
  request_id: string;
  request_number: string;
  requested_by: string;
  requested_by_name: string;
  requester_id: string;
  company_id: string | null;
  attachments_to_replace: Array<{ name: string; index: number }>;
  remarks: string;
  status: string;
  completed_at: string | null;
  created_at: string;
}

export function useAttachmentChangeRequests(userId: string | undefined) {
  const [pendingChangeRequest, setPendingChangeRequest] = useState<AttachmentChangeRequest | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchPendingChange = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('attachment_change_requests')
        .select('*')
        .eq('requester_id', userId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error('Error fetching pending attachment change:', error);
      } else {
        setPendingChangeRequest(data);
      }
    } catch (err) {
      console.error('Error fetching pending attachment change:', err);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchPendingChange();
  }, [fetchPendingChange]);

  const completeChangeRequest = async (changeRequestId: string, approverUserIds: string[], requestType: string, requestNumber: string) => {
    const { error } = await supabase
      .from('attachment_change_requests')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('id', changeRequestId);

    if (error) throw error;

    // Notify all approvers
    if (approverUserIds.length > 0) {
      const notifications = approverUserIds.map(approverId => ({
        user_id: approverId,
        title: 'Attachment Replaced',
        message: `The requester has replaced attachment(s) on ${requestType} ${requestNumber} as requested.`,
        notification_type: 'attachment_change',
        request_type: requestType,
        request_number: requestNumber,
      }));

      await supabase.from('user_notifications').insert(notifications);
    }

    setPendingChangeRequest(null);
  };

  return {
    pendingChangeRequest,
    loading,
    fetchPendingChange,
    completeChangeRequest,
  };
}

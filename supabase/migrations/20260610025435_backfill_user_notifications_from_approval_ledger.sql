-- Backfill notifications from existing approval_ledger entries
-- This generates notifications for approved, rejected, submitted, cancelled, and returned requests
INSERT INTO user_notifications (user_id, title, message, notification_type, request_type, request_number, request_id, target_view, is_read, created_at)
SELECT
  COALESCE(
    CASE al.request_type
      WHEN 'Purchase Requisition' THEN (SELECT requester_id FROM purchase_requisitions WHERE id = al.request_id)
      WHEN 'Canvass' THEN (SELECT requester_id FROM canvass_requests WHERE id = al.request_id)
      WHEN 'Petty Cash' THEN (SELECT requester_id FROM petty_cash_requests WHERE id = al.request_id)
      WHEN 'Cash Advance' THEN (SELECT requester_id FROM cash_advance_requests WHERE id = al.request_id)
      WHEN 'Reimbursement' THEN (SELECT requester_id FROM reimbursement_requests WHERE id = al.request_id)
      WHEN 'Purchase Order' THEN (SELECT prepared_by FROM purchase_orders WHERE id = al.request_id)
    END,
    al.approver_id
  ) AS user_id,
  CASE al.action
    WHEN 'Submitted' THEN 'Request Submitted'
    WHEN 'Approved' THEN 'Request Approved'
    WHEN 'Rejected' THEN 'Request Rejected'
    WHEN 'Returned to Maker' THEN 'Request Returned'
    WHEN 'Cancelled' THEN 'Request Cancelled'
    ELSE 'Request Update'
  END AS title,
  CASE al.action
    WHEN 'Submitted' THEN al.request_number || ' (' || al.request_type || ') has been submitted for approval'
    WHEN 'Approved' THEN al.request_number || ' (' || al.request_type || ') was approved by ' || al.approver_name
    WHEN 'Rejected' THEN al.request_number || ' (' || al.request_type || ') was rejected by ' || al.approver_name
    WHEN 'Returned to Maker' THEN al.request_number || ' (' || al.request_type || ') was returned by ' || al.approver_name
    WHEN 'Cancelled' THEN al.request_number || ' (' || al.request_type || ') has been cancelled'
    ELSE al.request_number || ' (' || al.request_type || ') - ' || al.action
  END AS message,
  CASE al.action
    WHEN 'Submitted' THEN 'submission'
    WHEN 'Approved' THEN 'approval'
    WHEN 'Rejected' THEN 'rejection'
    WHEN 'Returned to Maker' THEN 'return'
    WHEN 'Cancelled' THEN 'cancellation'
    ELSE 'system'
  END AS notification_type,
  al.request_type,
  al.request_number,
  al.request_id,
  CASE al.request_type
    WHEN 'Purchase Requisition' THEN 'pr-request'
    WHEN 'Canvass' THEN 'canvass-request'
    WHEN 'Petty Cash' THEN 'petty-cash-request'
    WHEN 'Cash Advance' THEN 'cash-advance-request'
    WHEN 'Reimbursement' THEN 'reimbursement-request'
    WHEN 'Purchase Order' THEN 'po-request'
    ELSE 'dashboard'
  END AS target_view,
  true AS is_read,
  al.created_at
FROM approval_ledger al
WHERE al.action IN ('Submitted', 'Approved', 'Rejected', 'Returned to Maker', 'Cancelled')
AND COALESCE(
  CASE al.request_type
    WHEN 'Purchase Requisition' THEN (SELECT requester_id FROM purchase_requisitions WHERE id = al.request_id)
    WHEN 'Canvass' THEN (SELECT requester_id FROM canvass_requests WHERE id = al.request_id)
    WHEN 'Petty Cash' THEN (SELECT requester_id FROM petty_cash_requests WHERE id = al.request_id)
    WHEN 'Cash Advance' THEN (SELECT requester_id FROM cash_advance_requests WHERE id = al.request_id)
    WHEN 'Reimbursement' THEN (SELECT requester_id FROM reimbursement_requests WHERE id = al.request_id)
    WHEN 'Purchase Order' THEN (SELECT prepared_by FROM purchase_orders WHERE id = al.request_id)
  END,
  al.approver_id
) IS NOT NULL;

CREATE OR REPLACE FUNCTION generate_notification_on_approval_ledger()
RETURNS TRIGGER AS $$
DECLARE
  v_requester_id uuid;
  v_requester_name text;
  v_target_view text;
  v_requester_view text;
  v_title text;
  v_message text;
  v_notif_type text;
BEGIN
  -- Determine navigation views
  CASE NEW.request_type
    WHEN 'Purchase Requisition' THEN v_target_view := 'pr-approval'; v_requester_view := 'pr-request';
    WHEN 'Canvass' THEN v_target_view := 'canvass-approval'; v_requester_view := 'canvass-request';
    WHEN 'Petty Cash' THEN v_target_view := 'petty-cash-approval'; v_requester_view := 'petty-cash-request';
    WHEN 'Cash Advance' THEN v_target_view := 'cash-advance-approval'; v_requester_view := 'cash-advance-request';
    WHEN 'Reimbursement' THEN v_target_view := 'reimbursement-approval'; v_requester_view := 'reimbursement-request';
    WHEN 'Purchase Order' THEN v_target_view := 'po-approval'; v_requester_view := 'po-request';
    ELSE v_target_view := 'dashboard'; v_requester_view := 'dashboard';
  END CASE;

  -- Look up the requester for this request
  CASE NEW.request_type
    WHEN 'Purchase Requisition' THEN SELECT requester_id INTO v_requester_id FROM purchase_requisitions WHERE id = NEW.request_id;
    WHEN 'Canvass' THEN SELECT requester_id INTO v_requester_id FROM canvass_requests WHERE id = NEW.request_id;
    WHEN 'Petty Cash' THEN SELECT requester_id INTO v_requester_id FROM petty_cash_requests WHERE id = NEW.request_id;
    WHEN 'Cash Advance' THEN SELECT requester_id INTO v_requester_id FROM cash_advance_requests WHERE id = NEW.request_id;
    WHEN 'Reimbursement' THEN SELECT requester_id INTO v_requester_id FROM reimbursement_requests WHERE id = NEW.request_id;
    WHEN 'Purchase Order' THEN SELECT prepared_by INTO v_requester_id FROM purchase_orders WHERE id = NEW.request_id;
    ELSE v_requester_id := NULL;
  END CASE;

  -- Only create notifications that are directly relevant to the user
  IF NEW.action = 'Submitted' THEN
    -- Notify requester: confirmation that their request was submitted
    v_notif_type := 'submission';
    v_title := 'Request Submitted';
    v_message := 'Your ' || NEW.request_type || ' ' || COALESCE(NEW.request_number, '') || ' has been submitted for approval';
    IF v_requester_id IS NOT NULL THEN
      INSERT INTO user_notifications (user_id, title, message, notification_type, request_type, request_number, request_id, target_view)
      VALUES (v_requester_id, v_title, v_message, v_notif_type, NEW.request_type, NEW.request_number, NEW.request_id, v_requester_view);
    END IF;

  ELSIF NEW.action = 'Approved' THEN
    -- Notify requester: their request was approved at this level
    v_notif_type := 'approval';
    v_title := 'Request Approved';
    v_message := 'Your ' || NEW.request_type || ' ' || COALESCE(NEW.request_number, '') || ' was approved by ' || COALESCE(NEW.approver_name, 'an approver');
    IF v_requester_id IS NOT NULL AND v_requester_id IS DISTINCT FROM NEW.approver_id THEN
      INSERT INTO user_notifications (user_id, title, message, notification_type, request_type, request_number, request_id, target_view)
      VALUES (v_requester_id, v_title, v_message, v_notif_type, NEW.request_type, NEW.request_number, NEW.request_id, v_requester_view);
    END IF;

  ELSIF NEW.action = 'Rejected' THEN
    -- Notify requester: their request was rejected
    v_notif_type := 'rejection';
    v_title := 'Request Rejected';
    v_message := 'Your ' || NEW.request_type || ' ' || COALESCE(NEW.request_number, '') || ' was rejected by ' || COALESCE(NEW.approver_name, 'an approver');
    IF NEW.comments IS NOT NULL AND NEW.comments != '' THEN
      v_message := v_message || '. Reason: ' || LEFT(NEW.comments, 100);
    END IF;
    IF v_requester_id IS NOT NULL THEN
      INSERT INTO user_notifications (user_id, title, message, notification_type, request_type, request_number, request_id, target_view)
      VALUES (v_requester_id, v_title, v_message, v_notif_type, NEW.request_type, NEW.request_number, NEW.request_id, v_requester_view);
    END IF;

  ELSIF NEW.action = 'Returned to Maker' THEN
    -- Notify requester: their request was returned
    v_notif_type := 'return';
    v_title := 'Request Returned';
    v_message := 'Your ' || NEW.request_type || ' ' || COALESCE(NEW.request_number, '') || ' was returned by ' || COALESCE(NEW.approver_name, 'an approver');
    IF NEW.comments IS NOT NULL AND NEW.comments != '' THEN
      v_message := v_message || '. Reason: ' || LEFT(NEW.comments, 100);
    END IF;
    IF v_requester_id IS NOT NULL THEN
      INSERT INTO user_notifications (user_id, title, message, notification_type, request_type, request_number, request_id, target_view)
      VALUES (v_requester_id, v_title, v_message, v_notif_type, NEW.request_type, NEW.request_number, NEW.request_id, v_requester_view);
    END IF;

  ELSIF NEW.action = 'Cancelled' THEN
    -- Notify requester: their request was cancelled
    v_notif_type := 'cancellation';
    v_title := 'Request Cancelled';
    v_message := 'Your ' || NEW.request_type || ' ' || COALESCE(NEW.request_number, '') || ' has been cancelled';
    IF v_requester_id IS NOT NULL THEN
      INSERT INTO user_notifications (user_id, title, message, notification_type, request_type, request_number, request_id, target_view)
      VALUES (v_requester_id, v_title, v_message, v_notif_type, NEW.request_type, NEW.request_number, NEW.request_id, v_requester_view);
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
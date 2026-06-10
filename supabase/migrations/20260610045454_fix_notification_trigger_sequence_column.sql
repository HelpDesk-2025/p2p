CREATE OR REPLACE FUNCTION generate_notification_on_approval_ledger()
RETURNS TRIGGER AS $$
DECLARE
  v_requester_id uuid;
  v_target_view text;
  v_requester_view text;
  v_title text;
  v_message text;
  v_notif_type text;
  v_next_approver record;
  v_current_sequence int;
BEGIN
  CASE NEW.request_type
    WHEN 'Purchase Requisition' THEN v_target_view := 'pr-approval'; v_requester_view := 'pr-request';
    WHEN 'Canvass' THEN v_target_view := 'canvass-approval'; v_requester_view := 'canvass-request';
    WHEN 'Petty Cash' THEN v_target_view := 'petty-cash-approval'; v_requester_view := 'petty-cash-request';
    WHEN 'Cash Advance' THEN v_target_view := 'cash-advance-approval'; v_requester_view := 'cash-advance-request';
    WHEN 'Reimbursement' THEN v_target_view := 'reimbursement-approval'; v_requester_view := 'reimbursement-request';
    WHEN 'Purchase Order' THEN v_target_view := 'po-approval'; v_requester_view := 'po-request';
    ELSE v_target_view := 'dashboard'; v_requester_view := 'dashboard';
  END CASE;

  CASE NEW.request_type
    WHEN 'Purchase Requisition' THEN SELECT requester_id INTO v_requester_id FROM purchase_requisitions WHERE id = NEW.request_id;
    WHEN 'Canvass' THEN SELECT requester_id INTO v_requester_id FROM canvass_requests WHERE id = NEW.request_id;
    WHEN 'Petty Cash' THEN SELECT requester_id INTO v_requester_id FROM petty_cash_requests WHERE id = NEW.request_id;
    WHEN 'Cash Advance' THEN SELECT requester_id INTO v_requester_id FROM cash_advance_requests WHERE id = NEW.request_id;
    WHEN 'Reimbursement' THEN SELECT requester_id INTO v_requester_id FROM reimbursement_requests WHERE id = NEW.request_id;
    WHEN 'Purchase Order' THEN SELECT prepared_by INTO v_requester_id FROM purchase_orders WHERE id = NEW.request_id;
    ELSE v_requester_id := NULL;
  END CASE;

  IF NEW.action = 'Submitted' THEN
    v_notif_type := 'submission';
    v_title := 'Request Submitted';
    v_message := NEW.request_number || ' (' || NEW.request_type || ') has been submitted for approval';
    IF v_requester_id IS NOT NULL THEN
      INSERT INTO user_notifications (user_id, title, message, notification_type, request_type, request_number, request_id, target_view)
      VALUES (v_requester_id, v_title, v_message, v_notif_type, NEW.request_type, NEW.request_number, NEW.request_id, v_requester_view);
    END IF;
    FOR v_next_approver IN
      SELECT af.user_id FROM approval_flows af
      WHERE af.workflow_type = NEW.request_type AND af.sequence_number = 1
      AND af.user_id IS NOT NULL AND af.user_id IS DISTINCT FROM v_requester_id
      LIMIT 3
    LOOP
      INSERT INTO user_notifications (user_id, title, message, notification_type, request_type, request_number, request_id, target_view)
      VALUES (v_next_approver.user_id, 'Pending Your Approval', NEW.request_number || ' (' || NEW.request_type || ') is waiting for your approval', 'system', NEW.request_type, NEW.request_number, NEW.request_id, v_target_view);
    END LOOP;

  ELSIF NEW.action = 'Approved' THEN
    v_notif_type := 'approval';
    v_title := 'Request Approved';
    v_message := NEW.request_number || ' (' || NEW.request_type || ') was approved by ' || NEW.approver_name;
    IF v_requester_id IS NOT NULL AND v_requester_id IS DISTINCT FROM NEW.approver_id THEN
      INSERT INTO user_notifications (user_id, title, message, notification_type, request_type, request_number, request_id, target_view)
      VALUES (v_requester_id, v_title, v_message, v_notif_type, NEW.request_type, NEW.request_number, NEW.request_id, v_requester_view);
    END IF;
    -- Use the "sequence" column (not "sequence_number") from approval_ledger
    v_current_sequence := NEW.sequence;
    IF v_current_sequence IS NOT NULL THEN
      FOR v_next_approver IN
        SELECT af.user_id FROM approval_flows af
        WHERE af.workflow_type = NEW.request_type AND af.sequence_number = v_current_sequence + 1
        AND af.user_id IS NOT NULL AND af.user_id IS DISTINCT FROM v_requester_id
        LIMIT 3
      LOOP
        INSERT INTO user_notifications (user_id, title, message, notification_type, request_type, request_number, request_id, target_view)
        VALUES (v_next_approver.user_id, 'Pending Your Approval', NEW.request_number || ' (' || NEW.request_type || ') is waiting for your approval', 'system', NEW.request_type, NEW.request_number, NEW.request_id, v_target_view);
      END LOOP;
    END IF;

  ELSIF NEW.action = 'Rejected' THEN
    v_notif_type := 'rejection';
    v_title := 'Request Rejected';
    v_message := NEW.request_number || ' (' || NEW.request_type || ') was rejected by ' || NEW.approver_name;
    IF NEW.comments IS NOT NULL AND NEW.comments != '' THEN
      v_message := v_message || '. Reason: ' || LEFT(NEW.comments, 100);
    END IF;
    IF v_requester_id IS NOT NULL THEN
      INSERT INTO user_notifications (user_id, title, message, notification_type, request_type, request_number, request_id, target_view)
      VALUES (v_requester_id, v_title, v_message, v_notif_type, NEW.request_type, NEW.request_number, NEW.request_id, v_requester_view);
    END IF;

  ELSIF NEW.action = 'Returned to Maker' THEN
    v_notif_type := 'return';
    v_title := 'Request Returned';
    v_message := NEW.request_number || ' (' || NEW.request_type || ') was returned by ' || NEW.approver_name;
    IF NEW.comments IS NOT NULL AND NEW.comments != '' THEN
      v_message := v_message || '. Reason: ' || LEFT(NEW.comments, 100);
    END IF;
    IF v_requester_id IS NOT NULL THEN
      INSERT INTO user_notifications (user_id, title, message, notification_type, request_type, request_number, request_id, target_view)
      VALUES (v_requester_id, v_title, v_message, v_notif_type, NEW.request_type, NEW.request_number, NEW.request_id, v_requester_view);
    END IF;

  ELSIF NEW.action = 'Cancelled' THEN
    v_notif_type := 'cancellation';
    v_title := 'Request Cancelled';
    v_message := NEW.request_number || ' (' || NEW.request_type || ') has been cancelled';
    IF v_requester_id IS NOT NULL THEN
      INSERT INTO user_notifications (user_id, title, message, notification_type, request_type, request_number, request_id, target_view)
      VALUES (v_requester_id, v_title, v_message, v_notif_type, NEW.request_type, NEW.request_number, NEW.request_id, v_requester_view);
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
CREATE OR REPLACE FUNCTION generate_notification_on_audit_trail()
RETURNS TRIGGER AS $$
DECLARE
  v_target_user_id uuid;
  v_title text;
  v_message text;
BEGIN
  IF NEW.table_name = 'user_profiles' AND NEW.action = 'UPDATE' THEN
    BEGIN
      v_target_user_id := NEW.record_id::uuid;
    EXCEPTION WHEN OTHERS THEN
      RETURN NEW;
    END;

    IF v_target_user_id = NEW.performed_by THEN
      RETURN NEW;
    END IF;

    IF NEW.old_values IS NOT NULL AND NEW.new_values IS NOT NULL THEN
      IF (NEW.old_values->>'is_active') IS DISTINCT FROM (NEW.new_values->>'is_active') THEN
        IF (NEW.new_values->>'is_active') = 'true' THEN
          v_title := 'Account Activated';
          v_message := 'Your account has been activated by ' || NEW.performed_by_name;
        ELSE
          v_title := 'Account Deactivated';
          v_message := 'Your account has been deactivated by ' || NEW.performed_by_name;
        END IF;
        INSERT INTO user_notifications (user_id, title, message, notification_type, target_view)
        VALUES (v_target_user_id, v_title, v_message, 'account', 'dashboard');
      END IF;

      IF (NEW.old_values->>'role') IS DISTINCT FROM (NEW.new_values->>'role') AND (NEW.new_values->>'role') IS NOT NULL THEN
        v_title := 'Role Updated';
        v_message := 'Your role has been changed to ' || (NEW.new_values->>'role') || ' by ' || NEW.performed_by_name;
        INSERT INTO user_notifications (user_id, title, message, notification_type, target_view)
        VALUES (v_target_user_id, v_title, v_message, 'account', 'dashboard');
      END IF;

      IF (NEW.old_values->>'department') IS DISTINCT FROM (NEW.new_values->>'department') AND (NEW.new_values->>'department') IS NOT NULL THEN
        v_title := 'Department Updated';
        v_message := 'Your department has been changed to ' || (NEW.new_values->>'department') || ' by ' || NEW.performed_by_name;
        INSERT INTO user_notifications (user_id, title, message, notification_type, target_view)
        VALUES (v_target_user_id, v_title, v_message, 'account', 'dashboard');
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_generate_notification_on_audit_trail
  AFTER INSERT ON audit_trail
  FOR EACH ROW
  EXECUTE FUNCTION generate_notification_on_audit_trail();

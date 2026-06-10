-- Create user_notifications table for in-app notification system
CREATE TABLE user_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  message text NOT NULL,
  notification_type text NOT NULL DEFAULT 'system',
  request_type text,
  request_number text,
  request_id uuid,
  target_view text,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT valid_notification_type CHECK (notification_type IN ('approval', 'rejection', 'return', 'submission', 'cancellation', 'system', 'account'))
);

-- Index for fast unread count queries and list fetching
CREATE INDEX idx_user_notifications_user_unread ON user_notifications (user_id, is_read, created_at DESC);
CREATE INDEX idx_user_notifications_user_created ON user_notifications (user_id, created_at DESC);

-- Enable RLS
ALTER TABLE user_notifications ENABLE ROW LEVEL SECURITY;

-- Users can only read their own notifications
CREATE POLICY "select_own_notifications" ON user_notifications FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

-- Users can only update (mark as read) their own notifications
CREATE POLICY "update_own_notifications" ON user_notifications FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Users can delete their own notifications
CREATE POLICY "delete_own_notifications" ON user_notifications FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- System (triggers) can insert notifications for any user
CREATE POLICY "system_insert_notifications" ON user_notifications FOR INSERT
  TO authenticated WITH CHECK (true);

-- Enable realtime for this table
ALTER PUBLICATION supabase_realtime ADD TABLE user_notifications;

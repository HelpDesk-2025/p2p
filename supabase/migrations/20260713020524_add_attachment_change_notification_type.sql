/*
# Add attachment_change to notification types

## Changes
- Drops and recreates the `valid_notification_type` CHECK constraint on `user_notifications`
  to add 'attachment_change' as a valid notification type.

## Important Notes
1. This allows the system to send notifications when an approver requests
   an attachment change and when a requestor completes the replacement.
*/

ALTER TABLE user_notifications DROP CONSTRAINT IF EXISTS valid_notification_type;
ALTER TABLE user_notifications ADD CONSTRAINT valid_notification_type
  CHECK (notification_type IN ('approval', 'rejection', 'return', 'submission', 'cancellation', 'system', 'account', 'attachment_change'));

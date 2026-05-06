/*
  # Add Default Organization Settings

  Inserts new default settings for organization profile, notifications, security,
  and library configuration. Uses ON CONFLICT DO NOTHING to preserve existing values.

  1. New Settings Added
    - org_name: Organization display name
    - org_email: Contact email
    - org_phone: Contact phone
    - timezone: System timezone
    - date_format: Date display format
    - notifications_push: Push notification toggle
    - notifications_enrollment: Enrollment alert toggle
    - notifications_book_due: Book due date alert toggle
    - notifications_overdue: Overdue book alert toggle
    - notifications_low_attendance: Low attendance alert toggle
    - session_timeout_minutes: Auto-logout timeout
*/

INSERT INTO organization_settings (setting_key, setting_value, setting_type, description)
VALUES
  ('org_name', 'My Organization', 'string', 'Organization display name'),
  ('org_email', '', 'string', 'Organization contact email'),
  ('org_phone', '', 'string', 'Organization contact phone'),
  ('timezone', 'Europe/Madrid', 'string', 'System timezone'),
  ('date_format', 'DD/MM/YYYY', 'string', 'Date display format'),
  ('notifications_push', 'true', 'boolean', 'Enable push notifications'),
  ('notifications_enrollment', 'true', 'boolean', 'Notify on new student enrollment'),
  ('notifications_book_due', 'true', 'boolean', 'Notify about upcoming book due dates'),
  ('notifications_overdue', 'true', 'boolean', 'Notify about overdue books'),
  ('notifications_low_attendance', 'true', 'boolean', 'Notify about low attendance'),
  ('session_timeout_minutes', '60', 'integer', 'Auto-logout after inactivity in minutes')
ON CONFLICT (setting_key) DO NOTHING;

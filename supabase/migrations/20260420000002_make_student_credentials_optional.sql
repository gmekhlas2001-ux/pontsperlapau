/*
  Students do not need login access to the site.
  - Make email nullable (not required for students)
  - Make password_hash nullable (no password = no login possible)
  - Update the email format constraint to allow NULL
  - Clear all credentials from existing student records
*/

-- Allow nullable email
ALTER TABLE users ALTER COLUMN email DROP NOT NULL;

-- Update email format constraint to allow NULL values
ALTER TABLE users DROP CONSTRAINT IF EXISTS email_format;
ALTER TABLE users ADD CONSTRAINT email_format
  CHECK (email IS NULL OR email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$');

-- Allow nullable password (no password hash = cannot log in)
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;

-- Clear existing student credentials
UPDATE users SET password_hash = NULL, email = NULL WHERE role = 'student';

/*
  # Create Password Verification Function

  1. Function
    - `verify_password` - Securely verifies user password using bcrypt
      - Takes user_email and user_password as parameters
      - Returns boolean indicating if password is valid
      - Uses pgcrypto extension's crypt function for bcrypt comparison

  2. Security
    - Function runs with SECURITY DEFINER to access password_hash
    - Only returns boolean, never exposes password hash
    - Requires pgcrypto extension for bcrypt support
*/

-- Ensure pgcrypto extension is enabled
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Drop function if exists to allow recreation
DROP FUNCTION IF EXISTS verify_password(text, text);

-- Create password verification function
CREATE OR REPLACE FUNCTION verify_password(
  user_email text,
  user_password text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  stored_password_hash text;
BEGIN
  -- Get the stored password hash for the user
  SELECT password_hash INTO stored_password_hash
  FROM users
  WHERE email = user_email
    AND status = 'active';
  
  -- If user not found, return false
  IF stored_password_hash IS NULL THEN
    RETURN false;
  END IF;
  
  -- Verify password using bcrypt
  RETURN stored_password_hash = crypt(user_password, stored_password_hash);
END;
$$;

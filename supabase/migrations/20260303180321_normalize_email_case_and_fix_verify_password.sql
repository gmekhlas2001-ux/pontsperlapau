/*
  # Normalize email case and fix verify_password

  1. Changes
    - Normalize all existing user emails to lowercase
    - Update verify_password function to use case-insensitive email lookup
    - Ensures login works regardless of how email was entered during user creation
*/

UPDATE users SET email = LOWER(email) WHERE email != LOWER(email);

CREATE OR REPLACE FUNCTION verify_password(user_email text, user_password text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  stored_password_hash text;
BEGIN
  SELECT password_hash INTO stored_password_hash
  FROM users
  WHERE LOWER(email) = LOWER(user_email)
  AND status = 'active';

  IF stored_password_hash IS NULL THEN
    RETURN false;
  END IF;

  RETURN stored_password_hash = crypt(user_password, stored_password_hash);
END;
$$;

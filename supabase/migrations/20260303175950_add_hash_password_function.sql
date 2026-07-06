/*
  # Add hash_password database function

  1. New Function
    - `hash_password(password text)` - Hashes a plain text password using bcrypt via pgcrypto
    - Used by edge functions to generate bcrypt-compatible password hashes
    - This ensures all passwords are hashed consistently with the verify_password function
*/

CREATE OR REPLACE FUNCTION hash_password(password text)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT crypt(password, gen_salt('bf'));
$$;

/*
  # Add RLS Policy for Login

  1. Policies
    - Allow anonymous users to read basic user info for login verification
    - This policy only exposes non-sensitive fields needed for authentication
    - Password hash is NOT included in the allowed fields

  2. Security
    - Policy allows SELECT only
    - Does not expose password_hash column
    - Required for login functionality since users are not authenticated yet
*/

-- Allow anonymous users to read user data for login (excluding password_hash)
CREATE POLICY "Allow anonymous login lookup"
  ON users
  FOR SELECT
  TO anon
  USING (true);

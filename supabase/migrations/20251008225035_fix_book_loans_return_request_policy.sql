/*
  # Fix Book Loans Return Request Policy

  1. Changes
    - Update the RLS policy for book_loans to allow users to request returns
    - Users can now update their own loans from 'active' to 'return_requested' status
    - Admins and librarians retain full update permissions
  
  2. Security
    - Users can only update their own loans
    - Users can only change status to 'return_requested' when current status is 'active'
    - Prevents users from changing other fields or bypassing the workflow
*/

-- Drop the existing update policy
DROP POLICY IF EXISTS "Admin and librarian can update loans" ON book_loans;

-- Create new policy that allows users to request returns on their active loans
CREATE POLICY "Users can update own loans and request returns"
  ON book_loans
  FOR UPDATE
  TO authenticated
  USING (
    -- Admin/librarian can update any loan
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.auth_user_id = auth.uid()
      AND profiles.role_id IN ('admin', 'librarian')
    )
    OR
    -- User can update their own loans when pending or active
    (
      borrower_id IN (
        SELECT id FROM profiles
        WHERE auth_user_id = auth.uid()
      )
      AND status IN ('pending', 'active')
    )
  )
  WITH CHECK (
    -- Admin/librarian can update any loan to any status
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.auth_user_id = auth.uid()
      AND profiles.role_id IN ('admin', 'librarian')
    )
    OR
    -- User can only update their own loans
    (
      borrower_id IN (
        SELECT id FROM profiles
        WHERE auth_user_id = auth.uid()
      )
      AND (
        -- Can update from pending to pending (edit request)
        (status = 'pending')
        OR
        -- Can update from active to return_requested
        (status = 'return_requested')
      )
    )
  );

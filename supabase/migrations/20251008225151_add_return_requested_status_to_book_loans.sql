/*
  # Add return_requested Status to Book Loans

  1. Changes
    - Drop the existing status check constraint
    - Add new constraint that includes 'return_requested' as a valid status
  
  2. Valid Statuses
    - pending: Initial loan request
    - approved: Loan approved by admin
    - active: Book currently borrowed
    - return_requested: User wants to return, awaiting admin confirmation
    - returned: Book returned and confirmed by admin
    - overdue: Loan past due date
    - rejected: Loan request rejected
*/

-- Drop the existing check constraint
ALTER TABLE book_loans DROP CONSTRAINT IF EXISTS book_loans_status_check;

-- Add new constraint with return_requested included
ALTER TABLE book_loans ADD CONSTRAINT book_loans_status_check 
  CHECK (status IN ('pending', 'approved', 'active', 'return_requested', 'returned', 'overdue', 'rejected'));

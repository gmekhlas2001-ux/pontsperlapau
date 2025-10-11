/*
  # Add Main Branch Flag to Branches Table

  1. Changes
    - Add `is_main_branch` boolean column to branches table
    - Default value is false
    - This flag identifies which branches act as main budget holders
  
  2. Notes
    - Main branches will have their budgets deducted when sending money to other branches
    - Non-main branches will have their budgets deducted when receiving money from main branches
*/

-- Add is_main_branch column to branches table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'branches' AND column_name = 'is_main_branch'
  ) THEN
    ALTER TABLE branches ADD COLUMN is_main_branch BOOLEAN DEFAULT false;
  END IF;
END $$;

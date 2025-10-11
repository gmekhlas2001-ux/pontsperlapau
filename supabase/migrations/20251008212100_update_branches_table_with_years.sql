/*
  # Update branches table with year fields

  1. Changes
    - Add year_built column to track when branch was established
    - Add year_closed column to track when branch was closed (optional)
  
  2. Security
    - Maintains existing RLS policies
*/

-- Add year_built column
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'branches' AND column_name = 'year_built'
  ) THEN
    ALTER TABLE branches ADD COLUMN year_built integer;
  END IF;
END $$;

-- Add year_closed column
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'branches' AND column_name = 'year_closed'
  ) THEN
    ALTER TABLE branches ADD COLUMN year_closed integer;
  END IF;
END $$;

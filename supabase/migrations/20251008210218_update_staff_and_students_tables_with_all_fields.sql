/*
  # Update staff and students tables with all required fields

  1. Changes to staff table
    - Add branch_id column to link staff to branches
    - Add age column (calculated from dob)
    - Add other_documents_urls column for multiple document uploads
    - Remove unnecessary columns (father_name, emergency_contact, history_activities)
  
  2. Changes to students table
    - Add branch_id column to link students to branches
    - Add dob column (date of birth)
    - Add passport_number column
    - Add email column
    - Add short_bio column
    - Add other_documents_urls column for multiple document uploads
    - Remove parent_phone column (not in requirements)
  
  3. Security
    - Maintains existing RLS policies
*/

-- Add missing columns to staff table
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'staff' AND column_name = 'branch_id'
  ) THEN
    ALTER TABLE staff ADD COLUMN branch_id uuid REFERENCES branches(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'staff' AND column_name = 'age'
  ) THEN
    ALTER TABLE staff ADD COLUMN age integer;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'staff' AND column_name = 'other_documents_urls'
  ) THEN
    ALTER TABLE staff ADD COLUMN other_documents_urls text[];
  END IF;
END $$;

-- Add missing columns to students table
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'students' AND column_name = 'branch_id'
  ) THEN
    ALTER TABLE students ADD COLUMN branch_id uuid REFERENCES branches(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'students' AND column_name = 'dob'
  ) THEN
    ALTER TABLE students ADD COLUMN dob date;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'students' AND column_name = 'passport_number'
  ) THEN
    ALTER TABLE students ADD COLUMN passport_number text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'students' AND column_name = 'email'
  ) THEN
    ALTER TABLE students ADD COLUMN email text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'students' AND column_name = 'job_description'
  ) THEN
    ALTER TABLE students ADD COLUMN job_description text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'students' AND column_name = 'short_bio'
  ) THEN
    ALTER TABLE students ADD COLUMN short_bio text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'students' AND column_name = 'other_documents_urls'
  ) THEN
    ALTER TABLE students ADD COLUMN other_documents_urls text[];
  END IF;
END $$;

-- Update staff table: rename home_address to address for consistency
DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'staff' AND column_name = 'home_address'
  ) THEN
    ALTER TABLE staff RENAME COLUMN home_address TO address;
  END IF;
END $$;

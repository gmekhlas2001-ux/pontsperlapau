/*
  # Add Missing User Profile Fields
  
  ## Overview
  This migration adds missing profile fields to the users table to support comprehensive user information collection.
  
  ## Changes
  
  ### Modified Tables
  - `users` table
    - Added `father_name` (varchar) - Father's name for identification purposes
    - Added `passport_number` (varchar, unique) - Passport/ID number for official identification
  
  ## Notes
  - Passport numbers are optional but must be unique when provided
  - Age is calculated dynamically from date_of_birth, not stored
  - All existing data remains unchanged
*/

-- Add father_name field to users table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'father_name'
  ) THEN
    ALTER TABLE users ADD COLUMN father_name varchar(100);
  END IF;
END $$;

-- Add passport_number field to users table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'passport_number'
  ) THEN
    ALTER TABLE users ADD COLUMN passport_number varchar(50) UNIQUE;
  END IF;
END $$;

-- Create index on passport_number for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_passport_number ON users(passport_number) WHERE passport_number IS NOT NULL;
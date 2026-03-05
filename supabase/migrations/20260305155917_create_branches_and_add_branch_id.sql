/*
  # Create Branches System

  ## Summary
  Adds a full branch management system so the organization can track members by province/branch.

  ## New Tables
  - `branches`
    - `id` (uuid, primary key)
    - `name` (text) - Branch name, e.g. "Kabul"
    - `province` (text) - Province name
    - `city` (text, optional)
    - `address` (text, optional)
    - `phone` (text, optional)
    - `email` (text, optional)
    - `established_date` (date, optional)
    - `status` (text) - active/inactive
    - `created_at`, `updated_at` timestamps

  ## Modified Tables
  - `students` - adds `branch_id` (uuid, FK to branches)
  - `staff` - adds `branch_id` (uuid, FK to branches)
  - `books` - adds `branch_id` (uuid, FK to branches)

  ## Security
  - RLS enabled on branches
  - Anon can read, insert, update, delete branches (custom auth pattern)
*/

CREATE TABLE IF NOT EXISTS branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  province text NOT NULL,
  city text,
  address text,
  phone text,
  email text,
  established_date date,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE branches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anon to read branches"
  ON branches FOR SELECT TO anon USING (true);

CREATE POLICY "Allow anon to insert branches"
  ON branches FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "Allow anon to update branches"
  ON branches FOR UPDATE TO anon USING (true) WITH CHECK (true);

CREATE POLICY "Allow anon to delete branches"
  ON branches FOR DELETE TO anon USING (true);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'students' AND column_name = 'branch_id'
  ) THEN
    ALTER TABLE students ADD COLUMN branch_id uuid REFERENCES branches(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'staff' AND column_name = 'branch_id'
  ) THEN
    ALTER TABLE staff ADD COLUMN branch_id uuid REFERENCES branches(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'books' AND column_name = 'branch_id'
  ) THEN
    ALTER TABLE books ADD COLUMN branch_id uuid REFERENCES branches(id) ON DELETE SET NULL;
  END IF;
END $$;

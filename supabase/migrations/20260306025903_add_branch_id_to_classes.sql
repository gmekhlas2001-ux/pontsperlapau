/*
  # Add branch_id to classes table

  Allows classes to be associated with a specific branch.
  Foreign key to branches table, nullable so existing classes are unaffected.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'classes' AND column_name = 'branch_id'
  ) THEN
    ALTER TABLE classes ADD COLUMN branch_id uuid REFERENCES branches(id) ON DELETE SET NULL;
  END IF;
END $$;

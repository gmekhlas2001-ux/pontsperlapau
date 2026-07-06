/*
  # Enforce NOT NULL on branch_id for inherently branch-scoped tables

  Some core records are MEANT to belong to exactly one branch. Allowing
  branch_id to be NULL has caused real bugs where a row was created without
  a branch and then became invisible to its owner (because the list query
  filters by branch_id, and `branch_id = X` does not match NULL).

  This migration locks down the columns at the schema level so the bug
  cannot repeat — even if a future caller forgets to pass branch_id,
  the database will reject the insert.

  Tables changed:
    - books
    - classes
    - staff
    - students

  Tables INTENTIONALLY left nullable:
    - users          (superadmin has no branch by design)
    - staff (was already nullable, but real data already has branch — locking)
    - messages       (NULL = global broadcast from a superadmin)

  All existing rows are confirmed to have branch_id set before this runs.
*/

-- Defensive: any row still missing branch_id should fail loudly here so
-- the migration aborts rather than silently leaving the constraint missing.
DO $$
DECLARE
  bad_count integer;
BEGIN
  SELECT COUNT(*) INTO bad_count FROM books    WHERE branch_id IS NULL;
  IF bad_count > 0 THEN RAISE EXCEPTION 'books has % rows with NULL branch_id', bad_count; END IF;

  SELECT COUNT(*) INTO bad_count FROM classes  WHERE branch_id IS NULL;
  IF bad_count > 0 THEN RAISE EXCEPTION 'classes has % rows with NULL branch_id', bad_count; END IF;

  SELECT COUNT(*) INTO bad_count FROM staff    WHERE branch_id IS NULL;
  IF bad_count > 0 THEN RAISE EXCEPTION 'staff has % rows with NULL branch_id', bad_count; END IF;

  SELECT COUNT(*) INTO bad_count FROM students WHERE branch_id IS NULL;
  IF bad_count > 0 THEN RAISE EXCEPTION 'students has % rows with NULL branch_id', bad_count; END IF;
END $$;

ALTER TABLE books    ALTER COLUMN branch_id SET NOT NULL;
ALTER TABLE classes  ALTER COLUMN branch_id SET NOT NULL;
ALTER TABLE staff    ALTER COLUMN branch_id SET NOT NULL;
ALTER TABLE students ALTER COLUMN branch_id SET NOT NULL;

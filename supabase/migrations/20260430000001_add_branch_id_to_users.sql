/*
  # Add branch_id to users (branch-scoped access control)

  ## Summary
  Denormalizes the user's assigned branch directly onto the `users` row so that
  service-layer queries and edge functions can scope every list/mutation by branch
  without joining staff/students each time.

  Backfills existing users from their linked staff or student profile.

  ## Modified Tables
  - `users` - adds `branch_id` (uuid, FK -> branches.id, nullable)
              nullable on purpose: superadmins are not bound to any branch.

  ## Backfill rules
  - If a user has a row in `staff`, copy `staff.branch_id`.
  - Else if a user has a row in `students`, copy `students.branch_id`.
  - Else leave NULL (typical for superadmins).

  ## Security
  RLS already permits anon read on users; no policy change needed.
  Service-layer + edge functions enforce role/branch scoping.
*/

-- 1. Column
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES branches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_users_branch_id ON users(branch_id);

-- 2. Backfill from staff
UPDATE users u
SET branch_id = s.branch_id
FROM staff s
WHERE s.user_id = u.id
  AND s.branch_id IS NOT NULL
  AND u.branch_id IS NULL;

-- 3. Backfill from students for any user not already filled
UPDATE users u
SET branch_id = st.branch_id
FROM students st
WHERE st.user_id = u.id
  AND st.branch_id IS NOT NULL
  AND u.branch_id IS NULL;

-- 4. Keep users.branch_id in sync when staff/students rows change.
CREATE OR REPLACE FUNCTION sync_user_branch_from_staff()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.user_id IS NOT NULL AND NEW.branch_id IS DISTINCT FROM OLD.branch_id THEN
    UPDATE users SET branch_id = NEW.branch_id WHERE id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION sync_user_branch_from_student()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.user_id IS NOT NULL AND NEW.branch_id IS DISTINCT FROM OLD.branch_id THEN
    UPDATE users SET branch_id = NEW.branch_id WHERE id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_staff_branch_sync ON staff;
CREATE TRIGGER trg_staff_branch_sync
AFTER INSERT OR UPDATE OF branch_id ON staff
FOR EACH ROW EXECUTE FUNCTION sync_user_branch_from_staff();

DROP TRIGGER IF EXISTS trg_student_branch_sync ON students;
CREATE TRIGGER trg_student_branch_sync
AFTER INSERT OR UPDATE OF branch_id ON students
FOR EACH ROW EXECUTE FUNCTION sync_user_branch_from_student();

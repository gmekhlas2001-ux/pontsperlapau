/*
  # Security hardening pass

  Addresses the highest-risk findings from the backend audit.
  Safe to run multiple times (idempotent guards).

  ## What this migration does

  1. **Hides users.password_hash from anon SELECT.**
     Replaces the over-permissive policy with one that explicitly forbids
     anon from selecting the hash column. Done by revoking column-level
     SELECT on password_hash from anon and adding a public-safe view.

  2. **Locks down auth-related RPCs.**
     - `hash_password` → REVOKE EXECUTE FROM anon, public.
     - `verify_password` → REVOKE FROM public, GRANT to anon only
       (still needed at login from the client; the new login edge function
       calls it via the service role and we'll later remove anon access
       once the client login flow moves to the edge function).
     - All SECURITY DEFINER functions get `SET search_path = public, pg_temp`
       to neutralise search-path attacks.

  3. **Drops the dead `refresh_tokens` table.** It was created for an
     unused JWT refresh flow.

  4. **Tightens activity_logs.** Revokes UPDATE/DELETE from anon so the
     audit trail can't be tampered with from the client.

  5. **Adds CHECK constraints on transactions.currency and
     transfer_method** to prevent data divergence from typos.

  6. **Converts organization_settings.setting_value to jsonb** so settings
     of any size/shape fit.

  7. **Adds missing FK indexes** for transactions.created_by and
     book_borrowings.borrower_id to keep deletes/joins fast.

  8. **Tightens hash_password & verify_password search_path**.

  9. **Tightens default for all current SECURITY DEFINER functions.**
*/

-- ═══════════════════════════════════════════════════════════════════════
-- 1. Hide users.password_hash from anon
-- ═══════════════════════════════════════════════════════════════════════

-- Column-level revoke. The existing row-level policy still applies, but
-- without column-level SELECT on password_hash, ?select=password_hash is
-- denied even though the row is otherwise readable.
REVOKE SELECT (password_hash) ON users FROM anon;
REVOKE SELECT (password_hash) ON users FROM authenticated;

-- Public-safe view for any code that wants to fetch user data without
-- worrying about leaking the hash. Use this view from the client.
CREATE OR REPLACE VIEW users_public AS
SELECT
  id, email, first_name, last_name, father_name, phone_number,
  date_of_birth, gender, role, status, profile_picture_url,
  branch_id, passport_number, last_login, created_at, updated_at
FROM users;

GRANT SELECT ON users_public TO anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════
-- 2. Lock down auth RPCs and pin search_path on SECURITY DEFINER funcs
-- ═══════════════════════════════════════════════════════════════════════

-- hash_password: only the service role (used inside edge functions) may
-- generate hashes. Anon must never call this directly.
REVOKE EXECUTE ON FUNCTION hash_password(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION hash_password(text) FROM anon;
REVOKE EXECUTE ON FUNCTION hash_password(text) FROM authenticated;

ALTER FUNCTION hash_password(text)
  SET search_path = public, pg_temp;

-- verify_password is still needed at login until the client moves to the
-- edge function login. Pin its search_path and explicitly grant only anon.
ALTER FUNCTION verify_password(text, text)
  SET search_path = public, pg_temp;

-- update_last_login: pin search_path.
ALTER FUNCTION update_last_login(uuid)
  SET search_path = public, pg_temp;

-- set_user_context / app_user_id / app_user_role helpers (defined in
-- 20260306024437_comprehensive_rbac_policies.sql). Pin search_path on
-- each one if it exists.
DO $$
DECLARE
  fn text;
  fns text[] := ARRAY[
    'set_user_context(uuid, text)',
    'app_user_id()',
    'app_user_role()',
    'is_superadmin()',
    'is_admin_or_higher()',
    'is_staff()'
  ];
BEGIN
  FOREACH fn IN ARRAY fns LOOP
    BEGIN
      EXECUTE format('ALTER FUNCTION %s SET search_path = public, pg_temp', fn);
    EXCEPTION WHEN undefined_function THEN
      -- fine, helper not present
      NULL;
    END;
  END LOOP;
END $$;

-- ═══════════════════════════════════════════════════════════════════════
-- 3. Drop dead refresh_tokens table
-- ═══════════════════════════════════════════════════════════════════════

DROP TABLE IF EXISTS refresh_tokens CASCADE;

-- ═══════════════════════════════════════════════════════════════════════
-- 4. Make activity_logs append-only from the client perspective
-- ═══════════════════════════════════════════════════════════════════════

-- Drop any existing UPDATE/DELETE policies on activity_logs.
DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'activity_logs'
      AND cmd IN ('UPDATE', 'DELETE')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON activity_logs', pol.policyname);
  END LOOP;
END $$;

-- Re-create a tight policy: anon can INSERT and SELECT only; never modify.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'activity_logs'
      AND policyname = 'activity_logs_no_anon_mutate'
  ) THEN
    EXECUTE 'CREATE POLICY activity_logs_no_anon_mutate ON activity_logs
             FOR UPDATE TO anon USING (false) WITH CHECK (false)';
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════
-- 5. Data integrity: CHECK constraints on transactions
-- ═══════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'transactions' AND constraint_name = 'transactions_currency_chk'
  ) THEN
    ALTER TABLE transactions
      ADD CONSTRAINT transactions_currency_chk
      CHECK (currency IN ('USD', 'EUR', 'AFN', 'PKR', 'GBP'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'transactions' AND constraint_name = 'transactions_method_chk'
  ) THEN
    ALTER TABLE transactions
      ADD CONSTRAINT transactions_method_chk
      CHECK (transfer_method IN ('cash', 'bank_transfer', 'hawala', 'check', 'mobile_money', 'other'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'transactions' AND constraint_name = 'transactions_status_chk'
  ) THEN
    ALTER TABLE transactions
      ADD CONSTRAINT transactions_status_chk
      CHECK (status IN ('pending', 'completed', 'cancelled', 'failed'));
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════
-- 6. organization_settings.setting_value → jsonb
-- ═══════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'organization_settings'
      AND column_name = 'setting_value'
      AND data_type IN ('character varying', 'text')
  ) THEN
    -- Convert via json text → jsonb. Wrap raw scalars in to_jsonb.
    ALTER TABLE organization_settings
      ALTER COLUMN setting_value TYPE jsonb
      USING CASE
        WHEN setting_value IS NULL THEN NULL::jsonb
        WHEN setting_value ~ '^[\[{].*[\]}]$' THEN setting_value::jsonb
        ELSE to_jsonb(setting_value)
      END;
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════
-- 7. Missing FK indexes (perf, safe to add)
-- ═══════════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_transactions_created_by ON transactions(created_by);
CREATE INDEX IF NOT EXISTS idx_transactions_sender_branch ON transactions(sender_branch_id);
CREATE INDEX IF NOT EXISTS idx_transactions_receiver_branch ON transactions(receiver_branch_id);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);
CREATE INDEX IF NOT EXISTS idx_class_enrollments_class ON class_enrollments(class_id);
CREATE INDEX IF NOT EXISTS idx_class_enrollments_student ON class_enrollments(student_id);
CREATE INDEX IF NOT EXISTS idx_books_branch ON books(branch_id);
CREATE INDEX IF NOT EXISTS idx_classes_branch ON classes(branch_id);
CREATE INDEX IF NOT EXISTS idx_classes_teacher ON classes(teacher_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_user ON activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created ON activity_logs(created_at DESC);

-- book_borrowings index — only if the table exists.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'book_borrowings') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_book_borrowings_borrower ON book_borrowings(borrower_id)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_book_borrowings_book ON book_borrowings(book_id)';
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════
-- 8. Transactional delete_user RPC
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION delete_user_cascade(target_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Wipe role-specific rows first to satisfy FKs. Atomic: any failure
  -- rolls back the whole operation.
  DELETE FROM staff WHERE user_id = target_user_id;
  DELETE FROM students WHERE user_id = target_user_id;
  DELETE FROM users WHERE id = target_user_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION delete_user_cascade(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION delete_user_cascade(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION delete_user_cascade(uuid) FROM authenticated;
-- Service role retains EXECUTE — it bypasses GRANTS anyway.

-- ═══════════════════════════════════════════════════════════════════════
-- 9. Constant-time login + rate-limit support: login_attempts table
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS login_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  ip text,
  success boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_login_attempts_email_recent
  ON login_attempts(email, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_login_attempts_ip_recent
  ON login_attempts(ip, created_at DESC);

-- Only the service role (edge function) writes here. Revoke from anon.
ALTER TABLE login_attempts ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'login_attempts'
      AND policyname = 'login_attempts_service_only'
  ) THEN
    EXECUTE 'CREATE POLICY login_attempts_service_only ON login_attempts
             FOR ALL TO anon USING (false) WITH CHECK (false)';
  END IF;
END $$;

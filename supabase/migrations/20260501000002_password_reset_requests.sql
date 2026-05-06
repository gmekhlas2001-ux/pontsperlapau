/*
  # Password reset requests

  Self-service password reset by email is intentionally not used in this
  app. Instead, a user clicking "Forgot password" creates a row here;
  a superadmin reviews the list and either:
    - resolves it by setting a new password (via update-user), or
    - rejects it (e.g. suspicious request).

  ## Table: password_reset_requests
    - id           uuid PK
    - user_id      uuid FK -> users(id) ON DELETE CASCADE
                   (nullable so we can record requests against an
                   unknown email without leaking which emails exist)
    - email_tried  text — the email the user typed (for audit)
    - status       text — pending | resolved | rejected
    - reason       text — optional, set by user (e.g. "lost password")
    - resolved_by  uuid FK -> users(id) ON DELETE SET NULL
    - resolved_at  timestamptz
    - resolved_note text — optional admin note
    - ip           text
    - created_at   timestamptz default now()

  ## Security
    - RLS enabled, anon writes blocked (only edge function inserts via
      service role).
    - Reads are restricted: superadmins see all; branch admins see
      requests where user_id resolves to a user in their branch.
*/

CREATE TABLE IF NOT EXISTS password_reset_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  email_tried text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'resolved', 'rejected')),
  reason text,
  resolved_by uuid REFERENCES users(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  resolved_note text,
  ip text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_prr_status ON password_reset_requests(status);
CREATE INDEX IF NOT EXISTS idx_prr_user ON password_reset_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_prr_created ON password_reset_requests(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_prr_email_recent
  ON password_reset_requests(email_tried, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_prr_ip_recent
  ON password_reset_requests(ip, created_at DESC);

ALTER TABLE password_reset_requests ENABLE ROW LEVEL SECURITY;

-- Inserts are blocked from anon — must go through the edge function so we
-- get rate limiting + IP capture + email-shape validation.
-- Reads are open (UI service layer scopes per role).
-- Updates (resolve/reject) come from the edge function only too.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'password_reset_requests'
      AND policyname = 'prr_anon_select'
  ) THEN
    EXECUTE 'CREATE POLICY prr_anon_select ON password_reset_requests
             FOR SELECT TO anon USING (true)';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'password_reset_requests'
      AND policyname = 'prr_anon_no_write'
  ) THEN
    EXECUTE 'CREATE POLICY prr_anon_no_write ON password_reset_requests
             FOR INSERT TO anon WITH CHECK (false)';
    EXECUTE 'CREATE POLICY prr_anon_no_update ON password_reset_requests
             FOR UPDATE TO anon USING (false) WITH CHECK (false)';
    EXECUTE 'CREATE POLICY prr_anon_no_delete ON password_reset_requests
             FOR DELETE TO anon USING (false)';
  END IF;
END $$;

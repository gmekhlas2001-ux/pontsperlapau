/*
  The SPA uses a custom HMAC session rather than Supabase Auth. PostgREST sees
  every browser as `anon`, so permissive SELECT policies cannot distinguish a
  signed-in user, their role, or their branch. All browser reads now pass
  through the data-read Edge Function, which validates the app session and
  applies server-side role and branch scope before reading with service_role.
*/

REVOKE SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;

-- Keep future public-schema tables private unless a migration opts them in.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;

-- RPC endpoints are private by default as well. Edge Functions explicitly use
-- the four helpers below with service_role; trigger functions do not require a
-- caller EXECUTE grant when their already-created triggers fire.
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hash_password(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.verify_password(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.update_last_login(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_user_cascade(uuid) TO service_role;

-- The safe user view is also served only by the authenticated read gateway.
REVOKE SELECT ON public.users_public FROM anon, authenticated;

-- A legacy storage policy used `bucket_id <> 'user-documents'`. Because RLS
-- policies are permissive, that expression accidentally granted anon access
-- to every other bucket. Removing it restores deny-by-default; the public
-- image bucket is served through its public object URLs and Edge-only writes.
DROP POLICY IF EXISTS user_documents_block_anon ON storage.objects;

-- Password changes can revoke every previously issued stateless app token.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS session_invalid_before timestamptz
  NOT NULL DEFAULT '1970-01-01 00:00:00+00';

-- Donors created by branch administrators must have an owner branch. Legacy
-- donors used by exactly one branch are backfilled; genuinely shared legacy
-- donors remain global and are mutation-protected by the Edge Function.
ALTER TABLE public.donors
  ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.branches(id) ON DELETE RESTRICT;

UPDATE public.donors AS donor
SET branch_id = scoped.branch_id
FROM (
  SELECT donor_id, min(branch_id::text)::uuid AS branch_id
  FROM public.grants
  GROUP BY donor_id
  HAVING count(DISTINCT branch_id) = 1
) AS scoped
WHERE donor.id = scoped.donor_id
  AND donor.branch_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_donors_branch ON public.donors(branch_id);

-- Always perform bcrypt work, even for an unknown email, so login timing does
-- not reveal whether an account exists.
CREATE OR REPLACE FUNCTION public.verify_password(user_email text, user_password text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  stored_password_hash text;
BEGIN
  SELECT password_hash
  INTO stored_password_hash
  FROM public.users
  WHERE lower(email) = lower(user_email)
    AND status = 'active';

  stored_password_hash := coalesce(
    stored_password_hash,
    '$2a$12$R9h/cIPz0gi.URNNX3kh2OPST9/PgBkqquzi.Ss7KIUgO2t0jWMUW'
  );
  RETURN extensions.crypt(user_password, stored_password_hash) = stored_password_hash;
END;
$$;

CREATE TABLE IF NOT EXISTS public.app_sessions (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_app_sessions_user_active
  ON public.app_sessions(user_id, expires_at DESC)
  WHERE revoked_at IS NULL;

ALTER TABLE public.app_sessions ENABLE ROW LEVEL SECURITY;

-- Ensure server-side Edge Functions retain the privileges they need after the
-- default changes. Existing tables normally already have this grant, but the
-- explicit grant makes the intended boundary auditable.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;

NOTIFY pgrst, 'reload schema';

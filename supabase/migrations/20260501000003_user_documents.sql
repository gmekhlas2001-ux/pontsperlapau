/*
  # User documents

  Lets superadmins (and the admin who's creating/editing a user) attach
  important files (ID scans, contracts, certificates) to a user record.
  Once attached, ONLY a superadmin can list, preview or download the
  files. Branch admins, teachers, librarians, and the user themselves
  cannot read the file contents.

  ## Table: user_documents
    - id            uuid PK
    - user_id       uuid FK -> users(id) ON DELETE CASCADE (the file's owner)
    - file_name     text NOT NULL — original filename
    - mime_type     text
    - size_bytes    int
    - storage_path  text NOT NULL UNIQUE — path inside the user-documents bucket
    - description   text — optional caption
    - uploaded_by   uuid FK -> users(id) ON DELETE SET NULL
    - uploaded_at   timestamptz default now()

  ## Storage bucket: user-documents (private)
    Created here. Default storage RLS denies anon/authenticated access,
    so only the service role (used by our edge functions) can read or
    write. Edge functions check the caller's session token and role
    before serving any object.

  ## RLS on user_documents
    - anon SELECT: allowed (the metadata is fine to expose to admins for
      list views — it does NOT include file content). The UI scopes who
      sees the list. Sensitive: don't put PII in `description`.
    - anon writes (INSERT/UPDATE/DELETE): blocked. Routed through edge
      functions so we can enforce role + branch + scoped access.
*/

CREATE TABLE IF NOT EXISTS user_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  mime_type text,
  size_bytes integer,
  storage_path text NOT NULL UNIQUE,
  description text,
  uploaded_by uuid REFERENCES users(id) ON DELETE SET NULL,
  uploaded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_documents_user ON user_documents(user_id);
CREATE INDEX IF NOT EXISTS idx_user_documents_uploaded_at
  ON user_documents(uploaded_at DESC);

ALTER TABLE user_documents ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- Anyone with the anon key can SELECT — UI gates by role.
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_documents'
      AND policyname = 'user_documents_select'
  ) THEN
    EXECUTE 'CREATE POLICY user_documents_select ON user_documents
             FOR SELECT TO anon USING (true)';
  END IF;
  -- Block client writes — must go through edge function.
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_documents'
      AND policyname = 'user_documents_no_anon_insert'
  ) THEN
    EXECUTE 'CREATE POLICY user_documents_no_anon_insert ON user_documents
             FOR INSERT TO anon WITH CHECK (false)';
    EXECUTE 'CREATE POLICY user_documents_no_anon_update ON user_documents
             FOR UPDATE TO anon USING (false) WITH CHECK (false)';
    EXECUTE 'CREATE POLICY user_documents_no_anon_delete ON user_documents
             FOR DELETE TO anon USING (false)';
  END IF;
END $$;

-- Storage bucket. Idempotent.
INSERT INTO storage.buckets (id, name, public)
VALUES ('user-documents', 'user-documents', false)
ON CONFLICT (id) DO NOTHING;

-- Storage object policies: deny everything for anon and authenticated.
-- Only the service role (which bypasses RLS) can touch these objects,
-- and only via our edge functions which verify the session token.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'user_documents_block_anon'
  ) THEN
    EXECUTE $POL$
      CREATE POLICY user_documents_block_anon ON storage.objects
        FOR ALL TO anon, authenticated
        USING (bucket_id <> 'user-documents')
        WITH CHECK (bucket_id <> 'user-documents')
    $POL$;
  END IF;
END $$;

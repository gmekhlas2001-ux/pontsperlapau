/*
  # Public images storage bucket

  Creates a public storage bucket for profile pictures and book covers.
  Public read so img tags can render the URL directly.
  Anon write/update/delete so the SPA can upload from the browser using
  the anon key (RLS at the policy level keeps it scoped to this bucket).
*/

INSERT INTO storage.buckets (id, name, public)
VALUES ('public-images', 'public-images', true)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'public_images_select'
  ) THEN
    EXECUTE $POLICY$
      CREATE POLICY public_images_select ON storage.objects
        FOR SELECT TO anon, authenticated
        USING (bucket_id = 'public-images')
    $POLICY$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'public_images_insert'
  ) THEN
    EXECUTE $POLICY$
      CREATE POLICY public_images_insert ON storage.objects
        FOR INSERT TO anon, authenticated
        WITH CHECK (bucket_id = 'public-images')
    $POLICY$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'public_images_update'
  ) THEN
    EXECUTE $POLICY$
      CREATE POLICY public_images_update ON storage.objects
        FOR UPDATE TO anon, authenticated
        USING (bucket_id = 'public-images')
    $POLICY$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'public_images_delete'
  ) THEN
    EXECUTE $POLICY$
      CREATE POLICY public_images_delete ON storage.objects
        FOR DELETE TO anon, authenticated
        USING (bucket_id = 'public-images')
    $POLICY$;
  END IF;
END $$;

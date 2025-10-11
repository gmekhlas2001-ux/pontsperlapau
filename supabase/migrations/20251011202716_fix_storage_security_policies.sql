/*
  # Fix Storage Security Policies for Profile Photos and Documents
  
  1. Changes
    - Drop all existing overly permissive storage policies
    - Create strict role-based policies for documents bucket
    - Create strict role-based policies for avatars bucket
    - Ensure files are only accessible to authenticated users with proper roles
  
  2. Security
    - Staff and students can only view their own profile photos
    - Admins can view all profile photos
    - Staff and students can only view their own documents
    - Admins can view all documents
    - Only authenticated users can upload files
    - Public access is completely blocked
*/

-- Drop all existing policies on storage.objects
DROP POLICY IF EXISTS "Authenticated users can upload documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can view documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload own documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can view own documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own documents" ON storage.objects;
DROP POLICY IF EXISTS "Admins can manage all documents" ON storage.objects;

-- Documents bucket policies

-- Allow authenticated users to upload their own documents
CREATE POLICY "Users can upload own documents to documents bucket"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'documents' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow users to view their own documents, admins can view all
CREATE POLICY "Users can view own documents, admins can view all"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'documents' AND
  (
    -- User can view their own documents
    (storage.foldername(name))[1] = auth.uid()::text
    OR
    -- Admins can view all documents
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.auth_user_id = auth.uid()
      AND profiles.role_id IN ('admin', 'super_admin')
      AND profiles.status = 'approved'
    )
    OR
    -- Super admins can view all documents
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.auth_user_id = auth.uid()
      AND profiles.is_super_admin = true
      AND profiles.status = 'approved'
    )
  )
);

-- Allow users to update their own documents, admins can update all
CREATE POLICY "Users can update own documents, admins can update all"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'documents' AND
  (
    (storage.foldername(name))[1] = auth.uid()::text
    OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.auth_user_id = auth.uid()
      AND (profiles.role_id IN ('admin', 'super_admin') OR profiles.is_super_admin = true)
      AND profiles.status = 'approved'
    )
  )
)
WITH CHECK (
  bucket_id = 'documents' AND
  (
    (storage.foldername(name))[1] = auth.uid()::text
    OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.auth_user_id = auth.uid()
      AND (profiles.role_id IN ('admin', 'super_admin') OR profiles.is_super_admin = true)
      AND profiles.status = 'approved'
    )
  )
);

-- Allow users to delete their own documents, admins can delete all
CREATE POLICY "Users can delete own documents, admins can delete all"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'documents' AND
  (
    (storage.foldername(name))[1] = auth.uid()::text
    OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.auth_user_id = auth.uid()
      AND (profiles.role_id IN ('admin', 'super_admin') OR profiles.is_super_admin = true)
      AND profiles.status = 'approved'
    )
  )
);

-- Avatars bucket policies (for profile photos)

-- Allow authenticated users to upload their own avatars
CREATE POLICY "Users can upload own avatars"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'avatars' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow users to view their own avatars, admins can view all
CREATE POLICY "Users can view own avatars, admins can view all"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'avatars' AND
  (
    (storage.foldername(name))[1] = auth.uid()::text
    OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.auth_user_id = auth.uid()
      AND (profiles.role_id IN ('admin', 'super_admin') OR profiles.is_super_admin = true)
      AND profiles.status = 'approved'
    )
  )
);

-- Allow users to update their own avatars, admins can update all
CREATE POLICY "Users can update own avatars, admins can update all"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'avatars' AND
  (
    (storage.foldername(name))[1] = auth.uid()::text
    OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.auth_user_id = auth.uid()
      AND (profiles.role_id IN ('admin', 'super_admin') OR profiles.is_super_admin = true)
      AND profiles.status = 'approved'
    )
  )
)
WITH CHECK (
  bucket_id = 'avatars' AND
  (
    (storage.foldername(name))[1] = auth.uid()::text
    OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.auth_user_id = auth.uid()
      AND (profiles.role_id IN ('admin', 'super_admin') OR profiles.is_super_admin = true)
      AND profiles.status = 'approved'
    )
  )
);

-- Allow users to delete their own avatars, admins can delete all
CREATE POLICY "Users can delete own avatars, admins can delete all"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'avatars' AND
  (
    (storage.foldername(name))[1] = auth.uid()::text
    OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.auth_user_id = auth.uid()
      AND (profiles.role_id IN ('admin', 'super_admin') OR profiles.is_super_admin = true)
      AND profiles.status = 'approved'
    )
  )
);

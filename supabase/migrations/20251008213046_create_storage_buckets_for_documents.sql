/*
  # Create Storage Buckets for Documents
  
  1. Buckets Created
    - `documents` - Public bucket for storing user documents (CVs, education docs, photos, etc.)
  
  2. Security Policies
    - Authenticated users can upload their own documents
    - Authenticated users can view their own documents
    - Admins can upload and view all documents
    - Public read access for profile photos
*/

-- Create documents bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'documents',
  'documents',
  false,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
)
ON CONFLICT (id) DO NOTHING;

-- Policy: Users can upload their own documents
CREATE POLICY "Users can upload own documents"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'documents' AND
  (auth.uid()::text = (storage.foldername(name))[1])
);

-- Policy: Users can view their own documents
CREATE POLICY "Users can view own documents"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'documents' AND
  (auth.uid()::text = (storage.foldername(name))[1])
);

-- Policy: Users can update their own documents
CREATE POLICY "Users can update own documents"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'documents' AND
  (auth.uid()::text = (storage.foldername(name))[1])
);

-- Policy: Users can delete their own documents
CREATE POLICY "Users can delete own documents"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'documents' AND
  (auth.uid()::text = (storage.foldername(name))[1])
);

-- Policy: Admins can do everything with documents
CREATE POLICY "Admins can manage all documents"
ON storage.objects
FOR ALL
TO authenticated
USING (
  bucket_id = 'documents' AND
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.auth_user_id = auth.uid()
    AND profiles.role_id = 'admin'
    AND profiles.status IN ('active', 'approved')
  )
);

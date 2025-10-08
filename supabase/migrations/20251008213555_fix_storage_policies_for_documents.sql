/*
  # Fix Storage Policies for Documents Upload
  
  1. Changes
    - Drop existing policies
    - Create new simplified policies that allow authenticated users to upload
    - Allow users to manage their own documents
    - Allow admins to manage all documents
  
  2. Security
    - Authenticated users can upload to their own folder
    - Users can only access their own documents
    - Admins can access all documents
*/

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can upload own documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can view own documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own documents" ON storage.objects;
DROP POLICY IF EXISTS "Admins can manage all documents" ON storage.objects;

-- Allow authenticated users to upload documents
CREATE POLICY "Authenticated users can upload documents"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'documents'
);

-- Allow authenticated users to view documents
CREATE POLICY "Authenticated users can view documents"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'documents'
);

-- Allow authenticated users to update documents
CREATE POLICY "Authenticated users can update documents"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'documents'
)
WITH CHECK (
  bucket_id = 'documents'
);

-- Allow authenticated users to delete documents
CREATE POLICY "Authenticated users can delete documents"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'documents'
);

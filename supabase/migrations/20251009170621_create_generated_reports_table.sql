/*
  # Generated Reports Storage System

  1. New Tables
    - `generated_reports`
      - `id` (uuid, primary key) - Unique report identifier
      - `branch_id` (uuid, nullable) - Branch ID (null for combined reports)
      - `report_type` (text) - Type: 'monthly', 'annual', etc.
      - `report_period` (text) - Format: 'YYYY-MM' for monthly
      - `file_name` (text) - PDF filename
      - `file_path` (text) - Storage path in Supabase Storage
      - `file_size` (integer) - File size in bytes
      - `transaction_count` (integer) - Number of transactions in report
      - `total_amount` (numeric) - Total transaction amount
      - `currency` (text) - Currency used
      - `generated_by` (uuid) - User who generated/triggered
      - `generated_at` (timestamp) - When report was generated
      - `status` (text) - Status: 'generating', 'completed', 'failed'
      - `error_message` (text, nullable) - Error if generation failed

  2. Storage
    - Create 'reports' bucket for PDF storage
    - Set up access policies for authenticated users

  3. Security
    - Enable RLS on `generated_reports` table
    - Admins can view all reports
    - Users can view reports for their branch
    - Only system can insert/update reports (via Edge Function)

  4. Indexes
    - Index on branch_id for faster queries
    - Index on report_period for date-based searches
    - Index on generated_at for sorting
*/

-- Create generated_reports table
CREATE TABLE IF NOT EXISTS generated_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid REFERENCES branches(id) ON DELETE CASCADE,
  report_type text NOT NULL DEFAULT 'monthly',
  report_period text NOT NULL,
  file_name text NOT NULL,
  file_path text NOT NULL,
  file_size integer NOT NULL DEFAULT 0,
  transaction_count integer NOT NULL DEFAULT 0,
  total_amount numeric(12, 2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'AFN',
  generated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  generated_at timestamptz DEFAULT now(),
  status text NOT NULL DEFAULT 'generating' CHECK (status IN ('generating', 'completed', 'failed')),
  error_message text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_generated_reports_branch_id ON generated_reports(branch_id);
CREATE INDEX IF NOT EXISTS idx_generated_reports_report_period ON generated_reports(report_period);
CREATE INDEX IF NOT EXISTS idx_generated_reports_generated_at ON generated_reports(generated_at DESC);
CREATE INDEX IF NOT EXISTS idx_generated_reports_status ON generated_reports(status);

-- Enable RLS
ALTER TABLE generated_reports ENABLE ROW LEVEL SECURITY;

-- Admins can view all reports
CREATE POLICY "Admins can view all reports"
  ON generated_reports FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.auth_user_id = auth.uid()
      AND profiles.role_id = 'admin'
      AND profiles.status = 'approved'
    )
  );

-- Users can view reports for their branch
CREATE POLICY "Users can view their branch reports"
  ON generated_reports FOR SELECT
  TO authenticated
  USING (
    branch_id IN (
      SELECT staff.branch_id FROM staff
      JOIN profiles ON profiles.id = staff.profile_id
      WHERE profiles.auth_user_id = auth.uid()
      AND profiles.status = 'approved'
    )
  );

-- Only service role (Edge Functions) can insert reports
CREATE POLICY "Service role can insert reports"
  ON generated_reports FOR INSERT
  TO authenticated
  WITH CHECK (false);

-- Only service role can update reports
CREATE POLICY "Service role can update reports"
  ON generated_reports FOR UPDATE
  TO authenticated
  USING (false)
  WITH CHECK (false);

-- Admins can delete old reports
CREATE POLICY "Admins can delete reports"
  ON generated_reports FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.auth_user_id = auth.uid()
      AND profiles.role_id = 'admin'
      AND profiles.status = 'approved'
    )
  );

-- Create storage bucket for reports
INSERT INTO storage.buckets (id, name, public)
VALUES ('reports', 'reports', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for reports bucket
CREATE POLICY "Admins can upload reports"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'reports'
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.auth_user_id = auth.uid()
      AND profiles.role_id = 'admin'
      AND profiles.status = 'approved'
    )
  );

CREATE POLICY "Authenticated users can download reports"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'reports');

CREATE POLICY "Admins can delete report files"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'reports'
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.auth_user_id = auth.uid()
      AND profiles.role_id = 'admin'
      AND profiles.status = 'approved'
    )
  );

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_generated_reports_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at
DROP TRIGGER IF EXISTS trigger_update_generated_reports_updated_at ON generated_reports;
CREATE TRIGGER trigger_update_generated_reports_updated_at
  BEFORE UPDATE ON generated_reports
  FOR EACH ROW
  EXECUTE FUNCTION update_generated_reports_updated_at();

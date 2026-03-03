/*
  # Create Core Users and Authentication System

  ## Overview
  This migration creates the foundational user authentication system for Ponts per la Pau Management System.

  ## New Tables
  
  ### `users`
  Main user table storing authentication and basic profile information for all system users.
  
  **Columns:**
  - `id` (uuid, primary key) - Unique user identifier
  - `email` (varchar, unique) - User email address for login
  - `password_hash` (varchar) - Bcrypt hashed password
  - `first_name` (varchar) - User's first name
  - `last_name` (varchar) - User's last name
  - `phone_number` (varchar) - Contact phone number
  - `date_of_birth` (date) - Date of birth
  - `gender` (enum) - Gender: male, female, other, prefer_not_to_say
  - `profile_picture_url` (varchar) - URL to profile image in storage
  - `status` (enum) - Account status: active, inactive
  - `role` (enum) - User role: superadmin, admin, teacher, librarian, student
  - `created_at` (timestamp) - Account creation timestamp
  - `updated_at` (timestamp) - Last update timestamp
  - `last_login` (timestamp) - Last successful login
  - `two_factor_enabled` (boolean) - 2FA enabled flag
  - `is_verified` (boolean) - Email verification status
  
  ## Security
  - Enable RLS on `users` table
  - Users can view their own profile
  - Users can update their own non-sensitive fields
  - Only admins can create/delete users
  - Only superadmins can change roles
  
  ## Notes
  - All timestamps use UTC timezone
  - Password must be hashed with bcrypt before storage
  - Soft deletes handled at application level (status = inactive)
*/

-- Create custom types for users table
CREATE TYPE user_gender AS ENUM ('male', 'female', 'other', 'prefer_not_to_say');
CREATE TYPE user_status AS ENUM ('active', 'inactive');
CREATE TYPE user_role AS ENUM ('superadmin', 'admin', 'teacher', 'librarian', 'student');

-- Create users table
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email varchar(255) UNIQUE NOT NULL,
  password_hash varchar(255) NOT NULL,
  first_name varchar(100) NOT NULL,
  last_name varchar(100) NOT NULL,
  phone_number varchar(20),
  date_of_birth date,
  gender user_gender,
  profile_picture_url varchar(500),
  status user_status DEFAULT 'active' NOT NULL,
  role user_role NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  last_login timestamptz,
  two_factor_enabled boolean DEFAULT false NOT NULL,
  is_verified boolean DEFAULT false NOT NULL,
  
  -- Constraints
  CONSTRAINT email_format CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
  CONSTRAINT valid_date_of_birth CHECK (date_of_birth IS NULL OR (date_of_birth < CURRENT_DATE AND date_of_birth > CURRENT_DATE - INTERVAL '150 years'))
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at);

-- Enable Row Level Security
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- RLS Policies for users table

-- Users can view their own profile
CREATE POLICY "Users can view own profile"
  ON users FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

-- Users can update their own non-sensitive fields
CREATE POLICY "Users can update own profile"
  ON users FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id AND
    -- Cannot change these sensitive fields
    email = (SELECT email FROM users WHERE id = auth.uid()) AND
    password_hash = (SELECT password_hash FROM users WHERE id = auth.uid()) AND
    role = (SELECT role FROM users WHERE id = auth.uid()) AND
    status = (SELECT status FROM users WHERE id = auth.uid())
  );

-- Admins and superadmins can view all users
CREATE POLICY "Admins can view all users"
  ON users FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role IN ('admin', 'superadmin')
      AND status = 'active'
    )
  );

-- Admins and superadmins can create users
CREATE POLICY "Admins can create users"
  ON users FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role IN ('admin', 'superadmin')
      AND status = 'active'
    )
  );

-- Admins can update users (except role changes)
CREATE POLICY "Admins can update users"
  ON users FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role IN ('admin', 'superadmin')
      AND status = 'active'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role IN ('admin', 'superadmin')
      AND status = 'active'
    ) AND
    -- Only superadmins can change roles
    (
      role = (SELECT role FROM users WHERE id = users.id) OR
      EXISTS (
        SELECT 1 FROM users
        WHERE id = auth.uid()
        AND role = 'superadmin'
      )
    )
  );

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update updated_at on users table
CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Create refresh_tokens table for JWT refresh token management
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token varchar(500) UNIQUE NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  revoked_at timestamptz,
  replaced_by_token uuid,
  
  CONSTRAINT valid_expiry CHECK (expires_at > created_at)
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token ON refresh_tokens(token);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires_at ON refresh_tokens(expires_at);

-- Enable RLS on refresh_tokens
ALTER TABLE refresh_tokens ENABLE ROW LEVEL SECURITY;

-- Users can only access their own refresh tokens
CREATE POLICY "Users can view own refresh tokens"
  ON refresh_tokens FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own refresh tokens"
  ON refresh_tokens FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own refresh tokens"
  ON refresh_tokens FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
/*
  # Create Staff and Students Extended Profile Tables

  ## Overview
  This migration creates extended profile tables for staff and students that reference the core users table.

  ## New Tables
  
  ### `staff`
  Extended information for staff members (teachers, librarians, administrators).
  
  **Columns:**
  - `id` (uuid, primary key) - Unique staff record identifier
  - `user_id` (uuid, foreign key) - Reference to users table
  - `position` (varchar) - Job position (e.g., "Director", "Teacher", "Librarian")
  - `department` (varchar) - Department name
  - `employee_id` (varchar, unique) - Optional employee identification number
  - `date_joined` (date) - Employment start date
  - `salary_grade` (varchar) - Optional salary grade
  - `employment_type` (enum) - full_time, part_time, contract
  - `supervisor_id` (uuid) - Self-referencing foreign key for organizational hierarchy
  - `bio` (text) - Biography or description
  - `created_at` (timestamp) - Record creation
  - `updated_at` (timestamp) - Last update
  - `deleted_at` (timestamp) - Soft delete timestamp
  
  ### `students`
  Extended information for students including guardian details and emergency contacts.
  
  **Columns:**
  - `id` (uuid, primary key) - Unique student record identifier
  - `user_id` (uuid, foreign key) - Reference to users table
  - `student_id` (varchar, unique) - Student identification number (e.g., "STU-001")
  - `grade_level` (varchar) - Current grade level
  - `enrollment_date` (date) - Date of enrollment
  - `parent_guardian_name` (varchar) - Parent/guardian full name
  - `parent_guardian_email` (varchar) - Parent/guardian email
  - `parent_guardian_phone` (varchar) - Parent/guardian phone
  - `emergency_contact_name` (varchar) - Emergency contact name
  - `emergency_contact_relationship` (varchar) - Relationship to student
  - `emergency_contact_phone` (varchar) - Emergency contact phone
  - `emergency_contact_email` (varchar) - Emergency contact email
  - `medical_notes` (text) - Important medical information
  - `allergies` (text) - Allergy information
  - `address` (text) - Home address
  - `nationality` (varchar) - Student nationality
  - `created_at` (timestamp) - Record creation
  - `updated_at` (timestamp) - Last update
  - `deleted_at` (timestamp) - Soft delete timestamp
  
  ## Security
  - Enable RLS on both tables
  - Staff can view all staff profiles
  - Staff can view student profiles
  - Students can only view their own profile
  - Only admins can modify staff/student records
  
  ## Notes
  - Soft deletes preserve data integrity
  - One-to-one relationship with users table
  - Auto-generate student_id with sequence
*/

-- Create employment type enum
CREATE TYPE employment_type AS ENUM ('full_time', 'part_time', 'contract');

-- Create staff table
CREATE TABLE IF NOT EXISTS staff (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  position varchar(100) NOT NULL,
  department varchar(100),
  employee_id varchar(50) UNIQUE,
  date_joined date NOT NULL,
  salary_grade varchar(20),
  employment_type employment_type DEFAULT 'full_time' NOT NULL,
  supervisor_id uuid REFERENCES staff(id) ON DELETE SET NULL,
  bio text,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  deleted_at timestamptz,
  
  -- Constraints
  CONSTRAINT valid_date_joined CHECK (date_joined <= CURRENT_DATE),
  CONSTRAINT no_self_supervision CHECK (id != supervisor_id)
);

-- Create indexes for staff
CREATE INDEX IF NOT EXISTS idx_staff_user_id ON staff(user_id);
CREATE INDEX IF NOT EXISTS idx_staff_deleted_at ON staff(deleted_at);
CREATE INDEX IF NOT EXISTS idx_staff_supervisor_id ON staff(supervisor_id);
CREATE INDEX IF NOT EXISTS idx_staff_department ON staff(department);
CREATE INDEX IF NOT EXISTS idx_staff_position ON staff(position);

-- Create students table
CREATE TABLE IF NOT EXISTS students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  student_id varchar(50) UNIQUE NOT NULL,
  grade_level varchar(50),
  enrollment_date date NOT NULL,
  parent_guardian_name varchar(200),
  parent_guardian_email varchar(255),
  parent_guardian_phone varchar(20),
  emergency_contact_name varchar(200),
  emergency_contact_relationship varchar(100),
  emergency_contact_phone varchar(20),
  emergency_contact_email varchar(255),
  medical_notes text,
  allergies text,
  address text,
  nationality varchar(100),
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  deleted_at timestamptz,
  
  -- Constraints
  CONSTRAINT valid_enrollment_date CHECK (enrollment_date <= CURRENT_DATE),
  CONSTRAINT parent_email_format CHECK (
    parent_guardian_email IS NULL OR 
    parent_guardian_email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'
  ),
  CONSTRAINT emergency_email_format CHECK (
    emergency_contact_email IS NULL OR 
    emergency_contact_email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'
  )
);

-- Create indexes for students
CREATE INDEX IF NOT EXISTS idx_students_user_id ON students(user_id);
CREATE INDEX IF NOT EXISTS idx_students_student_id ON students(student_id);
CREATE INDEX IF NOT EXISTS idx_students_deleted_at ON students(deleted_at);
CREATE INDEX IF NOT EXISTS idx_students_grade_level ON students(grade_level);
CREATE INDEX IF NOT EXISTS idx_students_enrollment_date ON students(enrollment_date);

-- Create sequence for auto-generating student IDs
CREATE SEQUENCE IF NOT EXISTS student_id_seq START WITH 1;

-- Function to generate student ID
CREATE OR REPLACE FUNCTION generate_student_id()
RETURNS varchar AS $$
DECLARE
  next_id integer;
  new_student_id varchar;
BEGIN
  next_id := nextval('student_id_seq');
  new_student_id := 'STU-' || LPAD(next_id::text, 4, '0');
  RETURN new_student_id;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-generate student_id if not provided
CREATE OR REPLACE FUNCTION set_student_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.student_id IS NULL OR NEW.student_id = '' THEN
    NEW.student_id := generate_student_id();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER generate_student_id_trigger
  BEFORE INSERT ON students
  FOR EACH ROW
  EXECUTE FUNCTION set_student_id();

-- Triggers to update updated_at
CREATE TRIGGER update_staff_updated_at
  BEFORE UPDATE ON staff
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_students_updated_at
  BEFORE UPDATE ON students
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Enable RLS on staff
ALTER TABLE staff ENABLE ROW LEVEL SECURITY;

-- Staff can view all staff profiles
CREATE POLICY "Staff can view all staff"
  ON staff FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role IN ('admin', 'superadmin', 'teacher', 'librarian')
      AND status = 'active'
    )
  );

-- Admins can create staff
CREATE POLICY "Admins can create staff"
  ON staff FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role IN ('admin', 'superadmin')
      AND status = 'active'
    )
  );

-- Admins can update staff
CREATE POLICY "Admins can update staff"
  ON staff FOR UPDATE
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
    )
  );

-- Enable RLS on students
ALTER TABLE students ENABLE ROW LEVEL SECURITY;

-- Students can view their own profile
CREATE POLICY "Students can view own profile"
  ON students FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Staff can view all students
CREATE POLICY "Staff can view all students"
  ON students FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role IN ('admin', 'superadmin', 'teacher', 'librarian')
      AND status = 'active'
    )
  );

-- Admins and teachers can create students
CREATE POLICY "Admins and teachers can create students"
  ON students FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role IN ('admin', 'superadmin', 'teacher')
      AND status = 'active'
    )
  );

-- Admins and teachers can update students
CREATE POLICY "Admins and teachers can update students"
  ON students FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role IN ('admin', 'superadmin', 'teacher')
      AND status = 'active'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role IN ('admin', 'superadmin', 'teacher')
      AND status = 'active'
    )
  );
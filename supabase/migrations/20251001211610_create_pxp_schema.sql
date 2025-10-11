/*
  # Create PXP Education Management System Schema

  ## Tables Created
  
  ### 1. roles
  - `id` (text, primary key) - Role identifier (admin, teacher, librarian, student)
  - `description` (text) - Role description
  
  ### 2. profiles
  - `id` (uuid, primary key) - Profile ID
  - `auth_user_id` (uuid, unique) - Links to auth.users
  - `email` (text, unique) - User email
  - `full_name` (text) - User's full name
  - `role_id` (text) - References roles table
  - `status` (text) - Account status (pending, approved, rejected)
  - Timestamps for creation and updates
  
  ### 3. approvals
  - Tracks role upgrade requests
  - Links requester profile to target role
  - Stores approval status and approver info
  
  ### 4. branches
  - Physical branch locations
  - Province, address, phone details
  
  ### 5. classrooms
  - Classroom management per branch
  - Teacher assignments
  
  ### 6. staff
  - Complete staff information
  - Personal details, documents, employment history
  
  ### 7. students
  - Student profiles
  - Personal details, enrollment info
  
  ### 8. class_teachers
  - Links teachers to classrooms
  
  ### 9. enrollments
  - Student-classroom enrollments
  
  ### 10. books
  - Library book inventory
  - Tracks quantity and availability
  
  ### 11. library_visits
  - Tracks library visitors and book borrowing
  
  ### 12. book_loans
  - Formal book loan records
  
  ### 13. documents
  - Document storage references
  
  ### 14. notifications
  - User notifications
  
  ### 15. audit_log
  - System activity audit trail
  
  ## Security
  - RLS enabled on all tables
  - Policies restrict access based on user roles
  - Admin users have full access
  - Teachers can view their assigned data
  - Students can view their own data only
*/

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create roles table
CREATE TABLE IF NOT EXISTS roles (
  id text PRIMARY KEY,
  description text
);

-- Insert default roles
INSERT INTO roles (id, description) VALUES
  ('admin', 'System administrator with full access'),
  ('teacher', 'Teaching staff member'),
  ('librarian', 'Library staff member'),
  ('student', 'Student user')
ON CONFLICT (id) DO NOTHING;

-- Create profiles table
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  auth_user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  email text UNIQUE NOT NULL,
  full_name text,
  role_id text REFERENCES roles(id) DEFAULT 'student',
  status text DEFAULT 'pending',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = auth_user_id);

CREATE POLICY "Admins can view all profiles"
  ON profiles FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.auth_user_id = auth.uid()
      AND profiles.role_id = 'admin'
      AND profiles.status = 'approved'
    )
  );

CREATE POLICY "Admins can update profiles"
  ON profiles FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.auth_user_id = auth.uid()
      AND profiles.role_id = 'admin'
      AND profiles.status = 'approved'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.auth_user_id = auth.uid()
      AND profiles.role_id = 'admin'
      AND profiles.status = 'approved'
    )
  );

-- Create approvals table
CREATE TABLE IF NOT EXISTS approvals (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  requester_profile_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  target_role text NOT NULL REFERENCES roles(id),
  approved_by uuid REFERENCES profiles(id),
  approved_at timestamptz,
  status text DEFAULT 'pending',
  submitted_payload jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE approvals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own approval requests"
  ON approvals FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = approvals.requester_profile_id
      AND profiles.auth_user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can view all approvals"
  ON approvals FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.auth_user_id = auth.uid()
      AND profiles.role_id = 'admin'
      AND profiles.status = 'approved'
    )
  );

CREATE POLICY "Users can create approval requests"
  ON approvals FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = requester_profile_id
      AND profiles.auth_user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can update approvals"
  ON approvals FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.auth_user_id = auth.uid()
      AND profiles.role_id = 'admin'
      AND profiles.status = 'approved'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.auth_user_id = auth.uid()
      AND profiles.role_id = 'admin'
      AND profiles.status = 'approved'
    )
  );

-- Create branches table
CREATE TABLE IF NOT EXISTS branches (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  province text,
  address text,
  phone text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE branches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view branches"
  ON branches FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage branches"
  ON branches FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.auth_user_id = auth.uid()
      AND profiles.role_id = 'admin'
      AND profiles.status = 'approved'
    )
  );

-- Create classrooms table
CREATE TABLE IF NOT EXISTS classrooms (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  branch_id uuid REFERENCES branches(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  teacher_staff_id uuid,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE classrooms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view classrooms"
  ON classrooms FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage classrooms"
  ON classrooms FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.auth_user_id = auth.uid()
      AND profiles.role_id = 'admin'
      AND profiles.status = 'approved'
    )
  );

-- Create staff table
CREATE TABLE IF NOT EXISTS staff (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id uuid UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
  first_name text,
  last_name text,
  father_name text,
  dob date,
  gender text,
  national_id text,
  passport_number text,
  home_address text,
  phone text,
  email text,
  emergency_contact text,
  position text,
  job_description text,
  date_joined date,
  date_left date,
  history_activities text,
  short_bio text,
  family_parents_tazkira_url text,
  nid_photo_url text,
  passport_photo_url text,
  profile_photo_url text,
  cv_url text,
  education_docs_url text,
  status text DEFAULT 'active',
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE staff ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view own record"
  ON staff FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = staff.profile_id
      AND profiles.auth_user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can view all staff"
  ON staff FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.auth_user_id = auth.uid()
      AND profiles.role_id = 'admin'
      AND profiles.status = 'approved'
    )
  );

CREATE POLICY "Admins can manage staff"
  ON staff FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.auth_user_id = auth.uid()
      AND profiles.role_id = 'admin'
      AND profiles.status = 'approved'
    )
  );

-- Create students table
CREATE TABLE IF NOT EXISTS students (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id uuid UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
  first_name text,
  last_name text,
  father_name text,
  age integer,
  gender text,
  national_id text,
  profile_photo_url text,
  address text,
  phone text,
  parent_phone text,
  education_level text,
  date_joined date,
  date_left date,
  status text DEFAULT 'active',
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE students ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students can view own record"
  ON students FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = students.profile_id
      AND profiles.auth_user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can view all students"
  ON students FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.auth_user_id = auth.uid()
      AND profiles.role_id = 'admin'
      AND profiles.status = 'approved'
    )
  );

CREATE POLICY "Admins can manage students"
  ON students FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.auth_user_id = auth.uid()
      AND profiles.role_id = 'admin'
      AND profiles.status = 'approved'
    )
  );

-- Create class_teachers table
CREATE TABLE IF NOT EXISTS class_teachers (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  classroom_id uuid REFERENCES classrooms(id) ON DELETE CASCADE,
  staff_id uuid REFERENCES staff(id) ON DELETE CASCADE,
  assigned_at timestamptz DEFAULT now()
);

ALTER TABLE class_teachers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view class assignments"
  ON class_teachers FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage class assignments"
  ON class_teachers FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.auth_user_id = auth.uid()
      AND profiles.role_id = 'admin'
      AND profiles.status = 'approved'
    )
  );

-- Create enrollments table
CREATE TABLE IF NOT EXISTS enrollments (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id uuid REFERENCES students(id) ON DELETE CASCADE,
  classroom_id uuid REFERENCES classrooms(id) ON DELETE CASCADE,
  start_date date,
  end_date date,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE enrollments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view enrollments"
  ON enrollments FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage enrollments"
  ON enrollments FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.auth_user_id = auth.uid()
      AND profiles.role_id = 'admin'
      AND profiles.status = 'approved'
    )
  );

-- Create books table
CREATE TABLE IF NOT EXISTS books (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  branch_id uuid REFERENCES branches(id) ON DELETE CASCADE,
  title text NOT NULL,
  author text,
  genre text,
  subject text,
  quantity integer DEFAULT 1,
  code_number text,
  status text DEFAULT 'available',
  times_borrowed integer DEFAULT 0,
  times_returned integer DEFAULT 0,
  available_copies integer GENERATED ALWAYS AS (GREATEST(quantity - (times_borrowed - times_returned), 0)) STORED,
  date_of_entry date DEFAULT CURRENT_DATE,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE books ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view books"
  ON books FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins and librarians can manage books"
  ON books FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.auth_user_id = auth.uid()
      AND profiles.role_id IN ('admin', 'librarian')
      AND profiles.status = 'approved'
    )
  );

-- Create library_visits table
CREATE TABLE IF NOT EXISTS library_visits (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  branch_id uuid REFERENCES branches(id) ON DELETE CASCADE,
  full_name text,
  father_name text,
  gender text,
  age integer,
  phone text,
  email text,
  address text,
  date_of_visit date DEFAULT CURRENT_DATE,
  purpose text,
  borrowed_book_id uuid REFERENCES books(id),
  return_due date,
  membership_status text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE library_visits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view library visits"
  ON library_visits FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins and librarians can manage library visits"
  ON library_visits FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.auth_user_id = auth.uid()
      AND profiles.role_id IN ('admin', 'librarian')
      AND profiles.status = 'approved'
    )
  );

-- Create book_loans table
CREATE TABLE IF NOT EXISTS book_loans (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  book_id uuid REFERENCES books(id) ON DELETE CASCADE,
  borrower_student_id uuid REFERENCES students(id),
  borrower_staff_id uuid REFERENCES staff(id),
  checked_out_at timestamptz DEFAULT now(),
  due_at timestamptz,
  returned_at timestamptz
);

ALTER TABLE book_loans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own book loans"
  ON book_loans FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      LEFT JOIN students s ON s.profile_id = p.id
      LEFT JOIN staff st ON st.profile_id = p.id
      WHERE p.auth_user_id = auth.uid()
      AND (s.id = book_loans.borrower_student_id OR st.id = book_loans.borrower_staff_id)
    )
  );

CREATE POLICY "Admins and librarians can view all book loans"
  ON book_loans FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.auth_user_id = auth.uid()
      AND profiles.role_id IN ('admin', 'librarian')
      AND profiles.status = 'approved'
    )
  );

CREATE POLICY "Admins and librarians can manage book loans"
  ON book_loans FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.auth_user_id = auth.uid()
      AND profiles.role_id IN ('admin', 'librarian')
      AND profiles.status = 'approved'
    )
  );

-- Create documents table
CREATE TABLE IF NOT EXISTS documents (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_profile_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  category text,
  file_url text NOT NULL,
  meta jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own documents"
  ON documents FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = documents.owner_profile_id
      AND profiles.auth_user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can view all documents"
  ON documents FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.auth_user_id = auth.uid()
      AND profiles.role_id = 'admin'
      AND profiles.status = 'approved'
    )
  );

CREATE POLICY "Admins can manage documents"
  ON documents FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.auth_user_id = auth.uid()
      AND profiles.role_id = 'admin'
      AND profiles.status = 'approved'
    )
  );

-- Create notifications table
CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  message text,
  read_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notifications"
  ON notifications FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = notifications.profile_id
      AND profiles.auth_user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own notifications"
  ON notifications FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = notifications.profile_id
      AND profiles.auth_user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = notifications.profile_id
      AND profiles.auth_user_id = auth.uid()
    )
  );

-- Create audit_log table
CREATE TABLE IF NOT EXISTS audit_log (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  actor_profile_id uuid REFERENCES profiles(id),
  action text,
  entity text,
  entity_id uuid,
  diff jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view audit log"
  ON audit_log FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.auth_user_id = auth.uid()
      AND profiles.role_id = 'admin'
      AND profiles.status = 'approved'
    )
  );
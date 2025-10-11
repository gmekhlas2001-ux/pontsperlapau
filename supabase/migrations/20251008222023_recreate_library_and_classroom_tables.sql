/*
  # Recreate Library and Classroom Tables

  1. Drop existing incomplete tables
  2. Create new complete schema for library and classroom management
*/

-- Drop existing tables if they exist
DROP TABLE IF EXISTS classroom_enrollments CASCADE;
DROP TABLE IF EXISTS classrooms CASCADE;
DROP TABLE IF EXISTS book_loans CASCADE;
DROP TABLE IF EXISTS books CASCADE;

-- Books table
CREATE TABLE books (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  author text,
  isbn text,
  publisher text,
  publication_year integer,
  category text,
  description text,
  total_copies integer DEFAULT 1,
  available_copies integer DEFAULT 1,
  branch_id uuid REFERENCES branches(id) ON DELETE SET NULL,
  cover_image_url text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE books ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view books"
  ON books FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admin can insert books"
  ON books FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE auth_user_id = auth.uid() AND role_id = 'admin')
  );

CREATE POLICY "Admin can update books"
  ON books FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE auth_user_id = auth.uid() AND role_id = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE auth_user_id = auth.uid() AND role_id = 'admin')
  );

CREATE POLICY "Admin can delete books"
  ON books FOR DELETE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE auth_user_id = auth.uid() AND role_id = 'admin')
  );

-- Book loans table
CREATE TABLE book_loans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id uuid REFERENCES books(id) ON DELETE CASCADE NOT NULL,
  borrower_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  borrower_type text NOT NULL CHECK (borrower_type IN ('student', 'staff')),
  loan_date date,
  due_date date,
  return_date date,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'active', 'returned', 'overdue', 'rejected')),
  approved_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  approved_at timestamptz,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE book_loans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own loans and admin can view all"
  ON book_loans FOR SELECT
  TO authenticated
  USING (
    borrower_id IN (SELECT id FROM profiles WHERE auth_user_id = auth.uid())
    OR
    EXISTS (SELECT 1 FROM profiles WHERE auth_user_id = auth.uid() AND role_id IN ('admin', 'librarian'))
  );

CREATE POLICY "Users can request loans"
  ON book_loans FOR INSERT
  TO authenticated
  WITH CHECK (
    borrower_id IN (SELECT id FROM profiles WHERE auth_user_id = auth.uid())
  );

CREATE POLICY "Admin and librarian can update loans"
  ON book_loans FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE auth_user_id = auth.uid() AND role_id IN ('admin', 'librarian'))
    OR
    (borrower_id IN (SELECT id FROM profiles WHERE auth_user_id = auth.uid()) AND status = 'pending')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE auth_user_id = auth.uid() AND role_id IN ('admin', 'librarian'))
    OR
    (borrower_id IN (SELECT id FROM profiles WHERE auth_user_id = auth.uid()) AND status = 'pending')
  );

CREATE POLICY "Admin and librarian can delete loans"
  ON book_loans FOR DELETE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE auth_user_id = auth.uid() AND role_id IN ('admin', 'librarian'))
  );

-- Classrooms table
CREATE TABLE classrooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  code text UNIQUE NOT NULL,
  description text,
  subject text,
  teacher_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  branch_id uuid REFERENCES branches(id) ON DELETE SET NULL,
  schedule text,
  room_number text,
  capacity integer,
  status text DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'completed')),
  start_date date,
  end_date date,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE classrooms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active classrooms"
  ON classrooms FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admin can insert classrooms"
  ON classrooms FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE auth_user_id = auth.uid() AND role_id = 'admin')
  );

CREATE POLICY "Admin can update classrooms"
  ON classrooms FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE auth_user_id = auth.uid() AND role_id = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE auth_user_id = auth.uid() AND role_id = 'admin')
  );

CREATE POLICY "Admin can delete classrooms"
  ON classrooms FOR DELETE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE auth_user_id = auth.uid() AND role_id = 'admin')
  );

-- Classroom enrollments table
CREATE TABLE classroom_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  classroom_id uuid REFERENCES classrooms(id) ON DELETE CASCADE NOT NULL,
  student_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  enrollment_date date DEFAULT CURRENT_DATE,
  status text DEFAULT 'active' CHECK (status IN ('active', 'dropped', 'completed')),
  grade text,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(classroom_id, student_id)
);

ALTER TABLE classroom_enrollments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view relevant enrollments"
  ON classroom_enrollments FOR SELECT
  TO authenticated
  USING (
    student_id IN (SELECT id FROM profiles WHERE auth_user_id = auth.uid())
    OR
    EXISTS (
      SELECT 1 FROM classrooms c
      WHERE c.id = classroom_id
      AND c.teacher_id IN (SELECT id FROM profiles WHERE auth_user_id = auth.uid())
    )
    OR
    EXISTS (SELECT 1 FROM profiles WHERE auth_user_id = auth.uid() AND role_id = 'admin')
  );

CREATE POLICY "Students and admin can enroll"
  ON classroom_enrollments FOR INSERT
  TO authenticated
  WITH CHECK (
    student_id IN (SELECT id FROM profiles WHERE auth_user_id = auth.uid() AND role_id = 'student')
    OR
    EXISTS (SELECT 1 FROM profiles WHERE auth_user_id = auth.uid() AND role_id = 'admin')
  );

CREATE POLICY "Teachers and admin can update enrollments"
  ON classroom_enrollments FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM classrooms c
      WHERE c.id = classroom_id
      AND c.teacher_id IN (SELECT id FROM profiles WHERE auth_user_id = auth.uid())
    )
    OR
    EXISTS (SELECT 1 FROM profiles WHERE auth_user_id = auth.uid() AND role_id = 'admin')
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM classrooms c
      WHERE c.id = classroom_id
      AND c.teacher_id IN (SELECT id FROM profiles WHERE auth_user_id = auth.uid())
    )
    OR
    EXISTS (SELECT 1 FROM profiles WHERE auth_user_id = auth.uid() AND role_id = 'admin')
  );

CREATE POLICY "Admin can delete enrollments"
  ON classroom_enrollments FOR DELETE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE auth_user_id = auth.uid() AND role_id = 'admin')
  );

-- Indexes for better performance
CREATE INDEX idx_books_branch_id ON books(branch_id);
CREATE INDEX idx_books_category ON books(category);
CREATE INDEX idx_book_loans_book_id ON book_loans(book_id);
CREATE INDEX idx_book_loans_borrower_id ON book_loans(borrower_id);
CREATE INDEX idx_book_loans_status ON book_loans(status);
CREATE INDEX idx_classrooms_teacher_id ON classrooms(teacher_id);
CREATE INDEX idx_classrooms_branch_id ON classrooms(branch_id);
CREATE INDEX idx_classroom_enrollments_classroom_id ON classroom_enrollments(classroom_id);
CREATE INDEX idx_classroom_enrollments_student_id ON classroom_enrollments(student_id);

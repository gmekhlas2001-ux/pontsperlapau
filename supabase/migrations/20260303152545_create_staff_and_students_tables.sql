-- Create employment type enum
DO $$ BEGIN
  CREATE TYPE employment_type AS ENUM ('full_time', 'part_time', 'contract');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

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
  
  CONSTRAINT valid_date_joined CHECK (date_joined <= CURRENT_DATE),
  CONSTRAINT no_self_supervision CHECK (id != supervisor_id)
);

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

CREATE INDEX IF NOT EXISTS idx_students_user_id ON students(user_id);
CREATE INDEX IF NOT EXISTS idx_students_student_id ON students(student_id);
CREATE INDEX IF NOT EXISTS idx_students_deleted_at ON students(deleted_at);
CREATE INDEX IF NOT EXISTS idx_students_grade_level ON students(grade_level);
CREATE INDEX IF NOT EXISTS idx_students_enrollment_date ON students(enrollment_date);

CREATE SEQUENCE IF NOT EXISTS student_id_seq START WITH 1;

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

CREATE OR REPLACE FUNCTION set_student_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.student_id IS NULL OR NEW.student_id = '' THEN
    NEW.student_id := generate_student_id();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS generate_student_id_trigger ON students;
CREATE TRIGGER generate_student_id_trigger
  BEFORE INSERT ON students
  FOR EACH ROW
  EXECUTE FUNCTION set_student_id();

DROP TRIGGER IF EXISTS update_staff_updated_at ON staff;
CREATE TRIGGER update_staff_updated_at
  BEFORE UPDATE ON staff
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_students_updated_at ON students;
CREATE TRIGGER update_students_updated_at
  BEFORE UPDATE ON students
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE students ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can view all staff" ON staff;
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

DROP POLICY IF EXISTS "Admins can create staff" ON staff;
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

DROP POLICY IF EXISTS "Admins can update staff" ON staff;
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

DROP POLICY IF EXISTS "Students can view own profile" ON students;
CREATE POLICY "Students can view own profile"
  ON students FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Staff can view all students" ON students;
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

DROP POLICY IF EXISTS "Admins and teachers can create students" ON students;
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

DROP POLICY IF EXISTS "Admins and teachers can update students" ON students;
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
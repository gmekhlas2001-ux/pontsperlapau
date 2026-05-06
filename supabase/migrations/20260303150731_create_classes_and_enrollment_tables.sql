/*
  # Create Classes and Enrollment Management Tables

  ## Overview
  This migration creates tables for managing classes, student enrollments, and attendance tracking.

  ## New Tables
  
  ### `classes`
  Stores information about courses/classes offered in the system.
  
  **Columns:**
  - `id` (uuid, primary key) - Unique class identifier
  - `name` (varchar) - Class name (e.g., "Math 101")
  - `description` (text) - Detailed class description
  - `teacher_id` (uuid) - Reference to staff table (teacher)
  - `schedule_day` (varchar array) - Days of the week class meets
  - `schedule_time` (time) - Start time of class
  - `schedule_end_time` (time) - End time of class
  - `location` (varchar) - Room number or location
  - `max_capacity` (integer) - Maximum number of students
  - `academic_year` (varchar) - Academic year (e.g., "2024-2025")
  - `semester` (enum) - fall, spring, summer
  - `status` (enum) - active, inactive, archived
  - `created_by` (uuid) - User who created the class
  - `created_at` (timestamp) - Creation timestamp
  - `updated_at` (timestamp) - Last update timestamp
  - `deleted_at` (timestamp) - Soft delete timestamp
  
  ### `class_enrollments`
  Junction table linking students to classes with enrollment details.
  
  **Columns:**
  - `id` (uuid, primary key) - Unique enrollment identifier
  - `class_id` (uuid) - Reference to classes table
  - `student_id` (uuid) - Reference to students table
  - `enrollment_date` (date) - Date student enrolled
  - `grade` (varchar) - Final grade (e.g., "A", "B")
  - `status` (enum) - active, dropped, completed
  - `attendance_count` (integer) - Number of sessions attended
  - `attendance_percentage` (decimal) - Calculated attendance rate
  - `created_at` (timestamp) - Record creation
  - `updated_at` (timestamp) - Last update
  
  ### `attendance`
  Tracks daily attendance for students in each class.
  
  **Columns:**
  - `id` (uuid, primary key) - Unique attendance record identifier
  - `class_id` (uuid) - Reference to classes table
  - `student_id` (uuid) - Reference to students table
  - `attendance_date` (date) - Date of class session
  - `status` (enum) - present, absent, late, excused
  - `notes` (text) - Optional notes about attendance
  - `recorded_by` (uuid) - User who recorded attendance (teacher)
  - `created_at` (timestamp) - Record creation
  - `updated_at` (timestamp) - Last update
  
  ## Security
  - Enable RLS on all tables
  - Teachers can manage their own classes
  - Teachers can enroll/remove students from their classes
  - Students can view classes they're enrolled in
  - Admins have full access
  
  ## Notes
  - Prevent duplicate enrollments with unique constraint
  - Prevent duplicate attendance records for same date
  - Calculate attendance percentage automatically
*/

-- Create class semester enum
CREATE TYPE class_semester AS ENUM ('fall', 'spring', 'summer');

-- Create class status enum
CREATE TYPE class_status AS ENUM ('active', 'inactive', 'archived');

-- Create enrollment status enum
CREATE TYPE enrollment_status AS ENUM ('active', 'dropped', 'completed');

-- Create attendance status enum
CREATE TYPE attendance_status AS ENUM ('present', 'absent', 'late', 'excused');

-- Create classes table
CREATE TABLE IF NOT EXISTS classes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(200) NOT NULL,
  description text,
  teacher_id uuid NOT NULL REFERENCES staff(id) ON DELETE RESTRICT,
  schedule_day varchar(20)[] DEFAULT '{}',
  schedule_time time,
  schedule_end_time time,
  location varchar(100),
  max_capacity integer DEFAULT 30,
  academic_year varchar(20),
  semester class_semester,
  status class_status DEFAULT 'active' NOT NULL,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  deleted_at timestamptz,
  
  -- Constraints
  CONSTRAINT valid_capacity CHECK (max_capacity > 0),
  CONSTRAINT valid_schedule_times CHECK (
    schedule_time IS NULL OR schedule_end_time IS NULL OR schedule_end_time > schedule_time
  )
);

-- Create indexes for classes
CREATE INDEX IF NOT EXISTS idx_classes_teacher_id ON classes(teacher_id);
CREATE INDEX IF NOT EXISTS idx_classes_status ON classes(status);
CREATE INDEX IF NOT EXISTS idx_classes_deleted_at ON classes(deleted_at);
CREATE INDEX IF NOT EXISTS idx_classes_academic_year ON classes(academic_year);
CREATE INDEX IF NOT EXISTS idx_classes_semester ON classes(semester);

-- Create class_enrollments table
CREATE TABLE IF NOT EXISTS class_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  enrollment_date date DEFAULT CURRENT_DATE NOT NULL,
  grade varchar(10),
  status enrollment_status DEFAULT 'active' NOT NULL,
  attendance_count integer DEFAULT 0 NOT NULL,
  attendance_percentage decimal(5,2) DEFAULT 0 NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  
  -- Constraints
  CONSTRAINT unique_class_student UNIQUE(class_id, student_id),
  CONSTRAINT valid_enrollment_date CHECK (enrollment_date <= CURRENT_DATE),
  CONSTRAINT valid_attendance_count CHECK (attendance_count >= 0),
  CONSTRAINT valid_attendance_percentage CHECK (attendance_percentage >= 0 AND attendance_percentage <= 100)
);

-- Create indexes for class_enrollments
CREATE INDEX IF NOT EXISTS idx_class_enrollments_class_id ON class_enrollments(class_id);
CREATE INDEX IF NOT EXISTS idx_class_enrollments_student_id ON class_enrollments(student_id);
CREATE INDEX IF NOT EXISTS idx_class_enrollments_status ON class_enrollments(status);

-- Create attendance table
CREATE TABLE IF NOT EXISTS attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  attendance_date date DEFAULT CURRENT_DATE NOT NULL,
  status attendance_status DEFAULT 'absent' NOT NULL,
  notes text,
  recorded_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  
  -- Constraints
  CONSTRAINT unique_attendance_record UNIQUE(class_id, student_id, attendance_date),
  CONSTRAINT valid_attendance_date CHECK (attendance_date <= CURRENT_DATE)
);

-- Create indexes for attendance
CREATE INDEX IF NOT EXISTS idx_attendance_class_id ON attendance(class_id);
CREATE INDEX IF NOT EXISTS idx_attendance_student_id ON attendance(student_id);
CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(attendance_date);
CREATE INDEX IF NOT EXISTS idx_attendance_status ON attendance(status);
CREATE INDEX IF NOT EXISTS idx_attendance_class_date ON attendance(class_id, attendance_date);

-- Function to update attendance statistics
CREATE OR REPLACE FUNCTION update_enrollment_attendance()
RETURNS TRIGGER AS $$
DECLARE
  total_sessions integer;
  present_sessions integer;
  new_percentage decimal(5,2);
BEGIN
  -- Count total attendance records for this enrollment
  SELECT COUNT(*) INTO total_sessions
  FROM attendance
  WHERE class_id = NEW.class_id
    AND student_id = NEW.student_id;
  
  -- Count present and late sessions (both count as attended)
  SELECT COUNT(*) INTO present_sessions
  FROM attendance
  WHERE class_id = NEW.class_id
    AND student_id = NEW.student_id
    AND status IN ('present', 'late');
  
  -- Calculate percentage
  IF total_sessions > 0 THEN
    new_percentage := (present_sessions::decimal / total_sessions::decimal) * 100;
  ELSE
    new_percentage := 0;
  END IF;
  
  -- Update enrollment record
  UPDATE class_enrollments
  SET 
    attendance_count = present_sessions,
    attendance_percentage = ROUND(new_percentage, 2),
    updated_at = now()
  WHERE class_id = NEW.class_id
    AND student_id = NEW.student_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update attendance stats when attendance is recorded
CREATE TRIGGER update_attendance_stats_on_insert
  AFTER INSERT ON attendance
  FOR EACH ROW
  EXECUTE FUNCTION update_enrollment_attendance();

CREATE TRIGGER update_attendance_stats_on_update
  AFTER UPDATE ON attendance
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION update_enrollment_attendance();

-- Triggers to update updated_at
CREATE TRIGGER update_classes_updated_at
  BEFORE UPDATE ON classes
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_class_enrollments_updated_at
  BEFORE UPDATE ON class_enrollments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_attendance_updated_at
  BEFORE UPDATE ON attendance
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Enable RLS on classes
ALTER TABLE classes ENABLE ROW LEVEL SECURITY;

-- Teachers can view all classes
CREATE POLICY "Teachers can view all classes"
  ON classes FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role IN ('admin', 'superadmin', 'teacher')
      AND status = 'active'
    )
  );

-- Students can view classes they're enrolled in
CREATE POLICY "Students can view enrolled classes"
  ON classes FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users u
      JOIN students s ON s.user_id = u.id
      JOIN class_enrollments ce ON ce.student_id = s.id
      WHERE u.id = auth.uid()
        AND ce.class_id = classes.id
        AND u.status = 'active'
    )
  );

-- Teachers and admins can create classes
CREATE POLICY "Teachers can create classes"
  ON classes FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role IN ('admin', 'superadmin', 'teacher')
      AND status = 'active'
    )
  );

-- Teachers can update their own classes, admins can update all
CREATE POLICY "Teachers can update own classes"
  ON classes FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users u
      JOIN staff s ON s.user_id = u.id
      WHERE u.id = auth.uid()
        AND (
          u.role IN ('admin', 'superadmin') OR
          (u.role = 'teacher' AND s.id = classes.teacher_id)
        )
        AND u.status = 'active'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users u
      JOIN staff s ON s.user_id = u.id
      WHERE u.id = auth.uid()
        AND (
          u.role IN ('admin', 'superadmin') OR
          (u.role = 'teacher' AND s.id = classes.teacher_id)
        )
        AND u.status = 'active'
    )
  );

-- Enable RLS on class_enrollments
ALTER TABLE class_enrollments ENABLE ROW LEVEL SECURITY;

-- Teachers and admins can view all enrollments
CREATE POLICY "Staff can view all enrollments"
  ON class_enrollments FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role IN ('admin', 'superadmin', 'teacher')
      AND status = 'active'
    )
  );

-- Students can view their own enrollments
CREATE POLICY "Students can view own enrollments"
  ON class_enrollments FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users u
      JOIN students s ON s.user_id = u.id
      WHERE u.id = auth.uid()
        AND s.id = class_enrollments.student_id
        AND u.status = 'active'
    )
  );

-- Teachers can enroll students in their classes, admins can enroll in any class
CREATE POLICY "Teachers can create enrollments"
  ON class_enrollments FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users u
      LEFT JOIN staff s ON s.user_id = u.id
      LEFT JOIN classes c ON c.id = class_enrollments.class_id
      WHERE u.id = auth.uid()
        AND (
          u.role IN ('admin', 'superadmin') OR
          (u.role = 'teacher' AND s.id = c.teacher_id)
        )
        AND u.status = 'active'
    )
  );

-- Teachers can update enrollments in their classes
CREATE POLICY "Teachers can update enrollments"
  ON class_enrollments FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users u
      LEFT JOIN staff s ON s.user_id = u.id
      LEFT JOIN classes c ON c.id = class_enrollments.class_id
      WHERE u.id = auth.uid()
        AND (
          u.role IN ('admin', 'superadmin') OR
          (u.role = 'teacher' AND s.id = c.teacher_id)
        )
        AND u.status = 'active'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users u
      LEFT JOIN staff s ON s.user_id = u.id
      LEFT JOIN classes c ON c.id = class_enrollments.class_id
      WHERE u.id = auth.uid()
        AND (
          u.role IN ('admin', 'superadmin') OR
          (u.role = 'teacher' AND s.id = c.teacher_id)
        )
        AND u.status = 'active'
    )
  );

-- Teachers can delete enrollments from their classes
CREATE POLICY "Teachers can delete enrollments"
  ON class_enrollments FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users u
      LEFT JOIN staff s ON s.user_id = u.id
      LEFT JOIN classes c ON c.id = class_enrollments.class_id
      WHERE u.id = auth.uid()
        AND (
          u.role IN ('admin', 'superadmin') OR
          (u.role = 'teacher' AND s.id = c.teacher_id)
        )
        AND u.status = 'active'
    )
  );

-- Enable RLS on attendance
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;

-- Staff can view all attendance
CREATE POLICY "Staff can view all attendance"
  ON attendance FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role IN ('admin', 'superadmin', 'teacher')
      AND status = 'active'
    )
  );

-- Students can view their own attendance
CREATE POLICY "Students can view own attendance"
  ON attendance FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users u
      JOIN students s ON s.user_id = u.id
      WHERE u.id = auth.uid()
        AND s.id = attendance.student_id
        AND u.status = 'active'
    )
  );

-- Teachers can record attendance for their classes
CREATE POLICY "Teachers can record attendance"
  ON attendance FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users u
      LEFT JOIN staff s ON s.user_id = u.id
      LEFT JOIN classes c ON c.id = attendance.class_id
      WHERE u.id = auth.uid()
        AND (
          u.role IN ('admin', 'superadmin') OR
          (u.role = 'teacher' AND s.id = c.teacher_id)
        )
        AND u.status = 'active'
    )
  );

-- Teachers can update attendance for their classes
CREATE POLICY "Teachers can update attendance"
  ON attendance FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users u
      LEFT JOIN staff s ON s.user_id = u.id
      LEFT JOIN classes c ON c.id = attendance.class_id
      WHERE u.id = auth.uid()
        AND (
          u.role IN ('admin', 'superadmin') OR
          (u.role = 'teacher' AND s.id = c.teacher_id)
        )
        AND u.status = 'active'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users u
      LEFT JOIN staff s ON s.user_id = u.id
      LEFT JOIN classes c ON c.id = attendance.class_id
      WHERE u.id = auth.uid()
        AND (
          u.role IN ('admin', 'superadmin') OR
          (u.role = 'teacher' AND s.id = c.teacher_id)
        )
        AND u.status = 'active'
    )
  );
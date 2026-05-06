/*
  # Create Roles, Permissions, Activity Logs, and System Tables

  ## Overview
  This migration creates tables for role-based access control, activity logging, notifications, and system settings.

  ## New Tables
  
  ### `roles`
  Defines user roles in the system.
  
  ### `permissions`
  Defines granular permissions for system resources.
  
  ### `role_permissions`
  Junction table linking roles to permissions.
  
  ### `activity_logs`
  Audit trail for all system actions.
  
  ### `notifications`
  User notification system.
  
  ### `organization_settings`
  System-wide configuration settings.
  
  ## Security
  - Enable RLS on all tables
  - Only admins can manage roles and permissions
  - Users can view their own activity logs
  - Users can view and manage their own notifications
  - Only superadmins can modify system settings
*/

-- Create setting type enum
CREATE TYPE setting_type AS ENUM ('integer', 'boolean', 'string', 'json');

-- Create roles table
CREATE TABLE IF NOT EXISTS roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(50) UNIQUE NOT NULL,
  description text,
  is_system_role boolean DEFAULT false NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_roles_name ON roles(name);

-- Create permissions table
CREATE TABLE IF NOT EXISTS permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(100) UNIQUE NOT NULL,
  description text,
  resource varchar(50),
  action varchar(20),
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_permissions_name ON permissions(name);
CREATE INDEX IF NOT EXISTS idx_permissions_resource ON permissions(resource);
CREATE INDEX IF NOT EXISTS idx_permissions_action ON permissions(action);

-- Create role_permissions junction table
CREATE TABLE IF NOT EXISTS role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT unique_role_permission UNIQUE(role_id, permission_id)
);

CREATE INDEX IF NOT EXISTS idx_role_permissions_role_id ON role_permissions(role_id);
CREATE INDEX IF NOT EXISTS idx_role_permissions_permission_id ON role_permissions(permission_id);

-- Create activity_logs table
CREATE TABLE IF NOT EXISTS activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  action_type varchar(50) NOT NULL,
  table_name varchar(100),
  record_id uuid,
  old_values jsonb,
  new_values jsonb,
  description text,
  ip_address varchar(45),
  user_agent varchar(500),
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_activity_logs_user_id ON activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_action_type ON activity_logs(action_type);
CREATE INDEX IF NOT EXISTS idx_activity_logs_table_name ON activity_logs(table_name);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON activity_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_logs_record_id ON activity_logs(record_id);

-- Create notifications table
CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title varchar(200) NOT NULL,
  message text,
  notification_type varchar(50),
  related_resource_type varchar(50),
  related_resource_id uuid,
  is_read boolean DEFAULT false NOT NULL,
  action_url varchar(500),
  created_at timestamptz DEFAULT now() NOT NULL,
  read_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, is_read) WHERE is_read = false;

-- Create organization_settings table
CREATE TABLE IF NOT EXISTS organization_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key varchar(100) UNIQUE NOT NULL,
  setting_value varchar(1000),
  setting_type setting_type DEFAULT 'string' NOT NULL,
  description text,
  updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_organization_settings_key ON organization_settings(setting_key);

-- Insert default system roles
INSERT INTO roles (name, description, is_system_role) VALUES
  ('superadmin', 'Super Administrator with full system access', true),
  ('admin', 'Administrator with management capabilities', true),
  ('teacher', 'Teacher who can manage classes and students', true),
  ('librarian', 'Librarian who manages library resources', true),
  ('student', 'Student with limited access', true)
ON CONFLICT (name) DO NOTHING;

-- Insert default permissions
INSERT INTO permissions (name, description, resource, action) VALUES
  ('manage_users', 'Create, update, and delete users', 'users', 'manage'),
  ('view_users', 'View user information', 'users', 'read'),
  ('manage_staff', 'Create, update, and delete staff', 'staff', 'manage'),
  ('view_staff', 'View staff information', 'staff', 'read'),
  ('manage_students', 'Create, update, and delete students', 'students', 'manage'),
  ('view_students', 'View student information', 'students', 'read'),
  ('manage_classes', 'Create, update, and delete classes', 'classes', 'manage'),
  ('view_classes', 'View class information', 'classes', 'read'),
  ('manage_enrollments', 'Enroll and remove students from classes', 'enrollments', 'manage'),
  ('view_enrollments', 'View enrollment information', 'enrollments', 'read'),
  ('manage_attendance', 'Record and update attendance', 'attendance', 'manage'),
  ('view_attendance', 'View attendance records', 'attendance', 'read'),
  ('manage_books', 'Create, update, and delete books', 'books', 'manage'),
  ('view_books', 'View book catalog', 'books', 'read'),
  ('manage_borrowings', 'Lend and return books', 'borrowings', 'manage'),
  ('view_borrowings', 'View borrowing records', 'borrowings', 'read'),
  ('manage_roles', 'Create and modify roles', 'roles', 'manage'),
  ('view_roles', 'View roles and permissions', 'roles', 'read'),
  ('manage_settings', 'Modify system settings', 'settings', 'manage'),
  ('view_settings', 'View system settings', 'settings', 'read'),
  ('view_activity_logs', 'View system activity logs', 'activity_logs', 'read'),
  ('view_reports', 'View system reports and statistics', 'reports', 'read')
ON CONFLICT (name) DO NOTHING;

-- Assign permissions to roles
DO $$
DECLARE
  superadmin_role_id uuid;
  admin_role_id uuid;
  teacher_role_id uuid;
  librarian_role_id uuid;
  student_role_id uuid;
BEGIN
  SELECT id INTO superadmin_role_id FROM roles WHERE name = 'superadmin';
  SELECT id INTO admin_role_id FROM roles WHERE name = 'admin';
  SELECT id INTO teacher_role_id FROM roles WHERE name = 'teacher';
  SELECT id INTO librarian_role_id FROM roles WHERE name = 'librarian';
  SELECT id INTO student_role_id FROM roles WHERE name = 'student';
  
  INSERT INTO role_permissions (role_id, permission_id)
  SELECT superadmin_role_id, id FROM permissions
  ON CONFLICT DO NOTHING;
  
  INSERT INTO role_permissions (role_id, permission_id)
  SELECT admin_role_id, id FROM permissions 
  WHERE name NOT IN ('manage_roles', 'manage_settings')
  ON CONFLICT DO NOTHING;
  
  INSERT INTO role_permissions (role_id, permission_id)
  SELECT teacher_role_id, id FROM permissions 
  WHERE name IN (
    'view_users', 'view_staff', 
    'manage_students', 'view_students',
    'manage_classes', 'view_classes',
    'manage_enrollments', 'view_enrollments',
    'manage_attendance', 'view_attendance',
    'view_books', 'view_borrowings'
  )
  ON CONFLICT DO NOTHING;
  
  INSERT INTO role_permissions (role_id, permission_id)
  SELECT librarian_role_id, id FROM permissions 
  WHERE name IN (
    'view_users', 'view_staff', 'view_students',
    'view_classes',
    'manage_books', 'view_books',
    'manage_borrowings', 'view_borrowings'
  )
  ON CONFLICT DO NOTHING;
  
  INSERT INTO role_permissions (role_id, permission_id)
  SELECT student_role_id, id FROM permissions 
  WHERE name IN (
    'view_classes', 'view_enrollments',
    'view_attendance', 'view_books'
  )
  ON CONFLICT DO NOTHING;
END $$;

-- Insert default organization settings
INSERT INTO organization_settings (setting_key, setting_value, setting_type, description) VALUES
  ('library_lending_period_days', '14', 'integer', 'Default book lending period in days'),
  ('max_book_renewal_count', '2', 'integer', 'Maximum number of times a book can be renewed'),
  ('attendance_low_threshold', '80', 'integer', 'Attendance percentage threshold for alerts'),
  ('overdue_fine_per_day', '0.50', 'string', 'Fine amount per day for overdue books'),
  ('max_books_per_user', '3', 'integer', 'Maximum number of books a user can borrow simultaneously'),
  ('enable_email_notifications', 'true', 'boolean', 'Enable email notifications'),
  ('academic_year', '2024-2025', 'string', 'Current academic year')
ON CONFLICT (setting_key) DO NOTHING;

-- Function to set notification read_at timestamp
CREATE OR REPLACE FUNCTION set_notification_read_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_read = true AND OLD.is_read = false THEN
    NEW.read_at := now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_read_at_on_notification
  BEFORE UPDATE ON notifications
  FOR EACH ROW
  WHEN (OLD.is_read IS DISTINCT FROM NEW.is_read)
  EXECUTE FUNCTION set_notification_read_at();

-- Triggers to update updated_at
CREATE TRIGGER update_roles_updated_at
  BEFORE UPDATE ON roles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_organization_settings_updated_at
  BEFORE UPDATE ON organization_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Enable RLS
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies for roles
CREATE POLICY "Admins can view roles"
  ON roles FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role IN ('admin', 'superadmin')
      AND status = 'active'
    )
  );

CREATE POLICY "Superadmins can insert roles"
  ON roles FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role = 'superadmin'
      AND status = 'active'
    )
  );

CREATE POLICY "Superadmins can update roles"
  ON roles FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role = 'superadmin'
      AND status = 'active'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role = 'superadmin'
      AND status = 'active'
    )
  );

CREATE POLICY "Superadmins can delete non-system roles"
  ON roles FOR DELETE
  TO authenticated
  USING (
    is_system_role = false AND
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role = 'superadmin'
      AND status = 'active'
    )
  );

-- RLS Policies for permissions
CREATE POLICY "Admins can view permissions"
  ON permissions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role IN ('admin', 'superadmin')
      AND status = 'active'
    )
  );

CREATE POLICY "Superadmins can manage permissions"
  ON permissions FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role = 'superadmin'
      AND status = 'active'
    )
  );

CREATE POLICY "Superadmins can update permissions"
  ON permissions FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role = 'superadmin'
      AND status = 'active'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role = 'superadmin'
      AND status = 'active'
    )
  );

CREATE POLICY "Superadmins can delete permissions"
  ON permissions FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role = 'superadmin'
      AND status = 'active'
    )
  );

-- RLS Policies for role_permissions
CREATE POLICY "Admins can view role permissions"
  ON role_permissions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role IN ('admin', 'superadmin')
      AND status = 'active'
    )
  );

CREATE POLICY "Superadmins can manage role permissions"
  ON role_permissions FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role = 'superadmin'
      AND status = 'active'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role = 'superadmin'
      AND status = 'active'
    )
  );

-- RLS Policies for activity_logs
CREATE POLICY "Users can view own activity logs"
  ON activity_logs FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins can view all activity logs"
  ON activity_logs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role IN ('admin', 'superadmin')
      AND status = 'active'
    )
  );

CREATE POLICY "System can insert activity logs"
  ON activity_logs FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- RLS Policies for notifications
CREATE POLICY "Users can view own notifications"
  ON notifications FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can update own notifications"
  ON notifications FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "System can create notifications"
  ON notifications FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- RLS Policies for organization_settings
CREATE POLICY "Users can view settings"
  ON organization_settings FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND status = 'active'
    )
  );

CREATE POLICY "Superadmins can manage settings"
  ON organization_settings FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role = 'superadmin'
      AND status = 'active'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role = 'superadmin'
      AND status = 'active'
    )
  );
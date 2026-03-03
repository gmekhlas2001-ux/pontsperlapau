# Database Schema - Ponts per la Pau Management System

## Entity Relationship Overview

```
users (Core Authentication)
  ├── staff (1:1) - Extended staff profiles
  │   └── classes (1:N) - Classes taught by staff
  ├── students (1:1) - Extended student profiles
  │   ├── class_enrollments (1:N) - Student class enrollments
  │   ├── attendance (1:N) - Student attendance records
  │   └── book_borrowings (1:N) - Student book loans
  ├── refresh_tokens (1:N) - JWT refresh tokens
  ├── activity_logs (1:N) - User action logs
  └── notifications (1:N) - User notifications

classes
  ├── class_enrollments (1:N) - Enrolled students
  └── attendance (1:N) - Class attendance records

books
  ├── book_copies (1:N) - Physical book copies
  └── book_borrowings (1:N) - Borrowing history

roles
  └── role_permissions (1:N) - Assigned permissions

permissions
  └── role_permissions (N:1) - Roles with this permission
```

---

## Table Schemas

### 1. users
**Purpose**: Core authentication and user profiles for all system users

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | uuid | PK, DEFAULT gen_random_uuid() | Unique user identifier |
| email | varchar(255) | UNIQUE, NOT NULL | User email (login) |
| password_hash | varchar(255) | NOT NULL | Bcrypt hashed password |
| first_name | varchar(100) | NOT NULL | User's first name |
| last_name | varchar(100) | NOT NULL | User's last name |
| phone_number | varchar(20) | NULLABLE | Contact phone |
| date_of_birth | date | NULLABLE | Date of birth |
| gender | user_gender | NULLABLE | Gender enum |
| profile_picture_url | varchar(500) | NULLABLE | Profile image URL |
| status | user_status | DEFAULT 'active' | active, inactive |
| role | user_role | NOT NULL | User role enum |
| created_at | timestamptz | DEFAULT now() | Account creation |
| updated_at | timestamptz | DEFAULT now() | Last update |
| last_login | timestamptz | NULLABLE | Last login time |
| two_factor_enabled | boolean | DEFAULT false | 2FA status |
| is_verified | boolean | DEFAULT false | Email verified |

**Enums**:
- `user_gender`: male, female, other, prefer_not_to_say
- `user_status`: active, inactive
- `user_role`: superadmin, admin, teacher, librarian, student

**Indexes**: email, role, status, created_at

**RLS**: Enabled
- Users can view/update own profile
- Admins can view/create/update all users
- Only superadmins can change roles

---

### 2. staff
**Purpose**: Extended profile information for staff members

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | uuid | PK, DEFAULT gen_random_uuid() | Unique staff identifier |
| user_id | uuid | FK → users, UNIQUE, NOT NULL | Reference to user account |
| position | varchar(100) | NOT NULL | Job position/title |
| department | varchar(100) | NULLABLE | Department name |
| employee_id | varchar(50) | UNIQUE, NULLABLE | Employee number |
| date_joined | date | NOT NULL | Employment start date |
| salary_grade | varchar(20) | NULLABLE | Salary grade/level |
| employment_type | employment_type | DEFAULT 'full_time' | Employment type enum |
| supervisor_id | uuid | FK → staff, NULLABLE | Supervisor reference |
| bio | text | NULLABLE | Biography/description |
| created_at | timestamptz | DEFAULT now() | Record creation |
| updated_at | timestamptz | DEFAULT now() | Last update |
| deleted_at | timestamptz | NULLABLE | Soft delete timestamp |

**Enums**:
- `employment_type`: full_time, part_time, contract

**Indexes**: user_id, deleted_at, supervisor_id, department, position

**RLS**: Enabled
- Staff can view all staff profiles
- Admins can create/update staff

---

### 3. students
**Purpose**: Extended profile information for students

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | uuid | PK, DEFAULT gen_random_uuid() | Unique student identifier |
| user_id | uuid | FK → users, UNIQUE, NOT NULL | Reference to user account |
| student_id | varchar(50) | UNIQUE, NOT NULL | Student ID (auto-generated) |
| grade_level | varchar(50) | NULLABLE | Current grade level |
| enrollment_date | date | NOT NULL | Enrollment date |
| parent_guardian_name | varchar(200) | NULLABLE | Parent/guardian name |
| parent_guardian_email | varchar(255) | NULLABLE | Parent email |
| parent_guardian_phone | varchar(20) | NULLABLE | Parent phone |
| emergency_contact_name | varchar(200) | NULLABLE | Emergency contact name |
| emergency_contact_relationship | varchar(100) | NULLABLE | Relationship to student |
| emergency_contact_phone | varchar(20) | NULLABLE | Emergency phone |
| emergency_contact_email | varchar(255) | NULLABLE | Emergency email |
| medical_notes | text | NULLABLE | Medical information |
| allergies | text | NULLABLE | Allergy information |
| address | text | NULLABLE | Home address |
| nationality | varchar(100) | NULLABLE | Student nationality |
| created_at | timestamptz | DEFAULT now() | Record creation |
| updated_at | timestamptz | DEFAULT now() | Last update |
| deleted_at | timestamptz | NULLABLE | Soft delete timestamp |

**Indexes**: user_id, student_id, deleted_at, grade_level, enrollment_date

**Special Features**:
- Student IDs auto-generated as STU-0001, STU-0002, etc.
- Trigger automatically generates student_id on insert

**RLS**: Enabled
- Students can view own profile
- Staff can view all students
- Admins/teachers can create/update students

---

### 4. classes
**Purpose**: Course/class management and scheduling

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | uuid | PK, DEFAULT gen_random_uuid() | Unique class identifier |
| name | varchar(200) | NOT NULL | Class name |
| description | text | NULLABLE | Class description |
| teacher_id | uuid | FK → staff, NOT NULL | Assigned teacher |
| schedule_day | varchar[] | DEFAULT '{}' | Days of week (array) |
| schedule_time | time | NULLABLE | Start time |
| schedule_end_time | time | NULLABLE | End time |
| location | varchar(100) | NULLABLE | Room/location |
| max_capacity | integer | DEFAULT 30 | Maximum students |
| academic_year | varchar(20) | NULLABLE | Academic year |
| semester | class_semester | NULLABLE | Semester enum |
| status | class_status | DEFAULT 'active' | Status enum |
| created_by | uuid | FK → users, NULLABLE | Creator user |
| created_at | timestamptz | DEFAULT now() | Creation time |
| updated_at | timestamptz | DEFAULT now() | Last update |
| deleted_at | timestamptz | NULLABLE | Soft delete |

**Enums**:
- `class_semester`: fall, spring, summer
- `class_status`: active, inactive, archived

**Indexes**: teacher_id, status, deleted_at, academic_year, semester

**RLS**: Enabled
- Teachers can view all classes
- Students can view enrolled classes
- Teachers/admins can create classes
- Teachers can update own classes, admins can update all

---

### 5. class_enrollments
**Purpose**: Junction table linking students to classes

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | uuid | PK, DEFAULT gen_random_uuid() | Unique enrollment identifier |
| class_id | uuid | FK → classes, NOT NULL | Class reference |
| student_id | uuid | FK → students, NOT NULL | Student reference |
| enrollment_date | date | DEFAULT CURRENT_DATE | Enrollment date |
| grade | varchar(10) | NULLABLE | Final grade |
| status | enrollment_status | DEFAULT 'active' | Status enum |
| attendance_count | integer | DEFAULT 0 | Sessions attended |
| attendance_percentage | decimal(5,2) | DEFAULT 0 | Attendance rate |
| created_at | timestamptz | DEFAULT now() | Record creation |
| updated_at | timestamptz | DEFAULT now() | Last update |

**Enums**:
- `enrollment_status`: active, dropped, completed

**Constraints**:
- UNIQUE(class_id, student_id) - Prevents duplicate enrollments

**Indexes**: class_id, student_id, status

**Special Features**:
- Attendance percentage automatically calculated by trigger
- Updates when attendance records are created/modified

**RLS**: Enabled
- Staff can view all enrollments
- Students can view own enrollments
- Teachers can create/update enrollments for their classes

---

### 6. attendance
**Purpose**: Daily attendance tracking for students in classes

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | uuid | PK, DEFAULT gen_random_uuid() | Unique attendance identifier |
| class_id | uuid | FK → classes, NOT NULL | Class reference |
| student_id | uuid | FK → students, NOT NULL | Student reference |
| attendance_date | date | DEFAULT CURRENT_DATE | Date of class |
| status | attendance_status | DEFAULT 'absent' | Status enum |
| notes | text | NULLABLE | Additional notes |
| recorded_by | uuid | FK → users, NULLABLE | Recording user |
| created_at | timestamptz | DEFAULT now() | Record creation |
| updated_at | timestamptz | DEFAULT now() | Last update |

**Enums**:
- `attendance_status`: present, absent, late, excused

**Constraints**:
- UNIQUE(class_id, student_id, attendance_date) - One record per student per day

**Indexes**: class_id, student_id, attendance_date, status, (class_id, attendance_date)

**Special Features**:
- Triggers automatically update enrollment attendance statistics
- Updates both attendance_count and attendance_percentage

**RLS**: Enabled
- Staff can view all attendance
- Students can view own attendance
- Teachers can record/update attendance for their classes

---

### 7. books
**Purpose**: Library book catalog and inventory

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | uuid | PK, DEFAULT gen_random_uuid() | Unique book identifier |
| title | varchar(500) | NOT NULL | Book title |
| author | varchar(300) | NOT NULL | Author name(s) |
| isbn | varchar(20) | UNIQUE, NULLABLE | ISBN number |
| publisher | varchar(200) | NULLABLE | Publisher name |
| publication_year | integer | NULLABLE | Year published |
| category | varchar(100) | NULLABLE | Book category/genre |
| description | text | NULLABLE | Book description |
| language | varchar(50) | DEFAULT 'English' | Book language |
| total_copies | integer | DEFAULT 1, NOT NULL | Total physical copies |
| available_copies | integer | DEFAULT 1, NOT NULL | Available copies |
| physical_condition | book_condition | DEFAULT 'good' | Condition enum |
| cover_image_url | varchar(500) | NULLABLE | Cover image URL |
| location_shelf | varchar(50) | NULLABLE | Shelf location |
| acquisition_date | date | NULLABLE | Date acquired |
| acquisition_cost | decimal(10,2) | NULLABLE | Purchase cost |
| added_by | uuid | FK → users, NULLABLE | User who added |
| created_at | timestamptz | DEFAULT now() | Record creation |
| updated_at | timestamptz | DEFAULT now() | Last update |
| deleted_at | timestamptz | NULLABLE | Soft delete |

**Enums**:
- `book_condition`: excellent, good, fair, poor

**Indexes**: title, author, isbn, category, language, deleted_at, available_copies

**Special Features**:
- Automatically creates book_copies records when book is inserted
- Creates one copy record for each total_copies value

**RLS**: Enabled
- All authenticated users can view books
- Librarians/admins can create/update books

---

### 8. book_copies
**Purpose**: Track individual physical copies of each book

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | uuid | PK, DEFAULT gen_random_uuid() | Unique copy identifier |
| book_id | uuid | FK → books, NOT NULL | Book reference |
| copy_number | integer | NOT NULL | Copy number (1, 2, 3...) |
| barcode | varchar(50) | UNIQUE, NULLABLE | Physical barcode |
| status | book_copy_status | DEFAULT 'available' | Status enum |
| condition | book_condition | DEFAULT 'good' | Condition enum |
| location_shelf | varchar(50) | NULLABLE | Specific shelf |
| notes | text | NULLABLE | Copy-specific notes |
| created_at | timestamptz | DEFAULT now() | Record creation |
| updated_at | timestamptz | DEFAULT now() | Last update |

**Enums**:
- `book_copy_status`: available, borrowed, damaged, lost, maintenance
- `book_condition`: excellent, good, fair, poor

**Constraints**:
- UNIQUE(book_id, copy_number) - Each copy has unique number per book

**Indexes**: book_id, status, barcode

**RLS**: Enabled
- All authenticated users can view copies
- Librarians can create/update copies

---

### 9. book_borrowings
**Purpose**: Track book lending transactions and returns

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | uuid | PK, DEFAULT gen_random_uuid() | Unique borrowing identifier |
| book_id | uuid | FK → books, NOT NULL | Book reference |
| book_copy_id | uuid | FK → book_copies, NOT NULL | Specific copy borrowed |
| borrower_id | uuid | FK → users, NOT NULL | Borrowing user |
| borrowed_date | date | DEFAULT CURRENT_DATE | Borrow date |
| due_date | date | NOT NULL | Expected return date |
| returned_date | date | NULLABLE | Actual return date |
| expected_return_date | date | NULLABLE | Extended due date |
| is_overdue | boolean | DEFAULT false | Overdue status |
| fine_amount | decimal(10,2) | DEFAULT 0 | Late fee |
| condition_on_return | book_condition | NULLABLE | Condition when returned |
| return_notes | text | NULLABLE | Return notes |
| lent_by | uuid | FK → users, NULLABLE | Lending librarian |
| returned_by | uuid | FK → users, NULLABLE | Return librarian |
| can_renew | boolean | DEFAULT true | Renewal allowed |
| renewal_count | integer | DEFAULT 0 | Times renewed |
| created_at | timestamptz | DEFAULT now() | Record creation |
| updated_at | timestamptz | DEFAULT now() | Last update |

**Indexes**: book_id, book_copy_id, borrower_id, returned_date, due_date, is_overdue, (borrower_id, returned_date) WHERE returned_date IS NULL

**Special Features**:
- Triggers automatically update book.available_copies
- Updates book_copy.status to 'borrowed' or 'available'
- Validates copy is available before allowing borrow
- Calculates overdue status automatically

**RLS**: Enabled
- Users can view own borrowing history
- Librarians/staff can view all borrowings
- Librarians can create/update borrowing records

---

### 10. roles
**Purpose**: Define system roles

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | uuid | PK, DEFAULT gen_random_uuid() | Unique role identifier |
| name | varchar(50) | UNIQUE, NOT NULL | Role name |
| description | text | NULLABLE | Role description |
| is_system_role | boolean | DEFAULT false | System role flag |
| created_at | timestamptz | DEFAULT now() | Record creation |
| updated_at | timestamptz | DEFAULT now() | Last update |

**Indexes**: name

**Default Roles**:
- superadmin (system role)
- admin (system role)
- teacher (system role)
- librarian (system role)
- student (system role)

**RLS**: Enabled
- Admins can view roles
- Only superadmins can create/update/delete roles
- System roles cannot be deleted

---

### 11. permissions
**Purpose**: Define granular system permissions

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | uuid | PK, DEFAULT gen_random_uuid() | Unique permission identifier |
| name | varchar(100) | UNIQUE, NOT NULL | Permission name |
| description | text | NULLABLE | Permission description |
| resource | varchar(50) | NULLABLE | Resource type |
| action | varchar(20) | NULLABLE | Action type |
| created_at | timestamptz | DEFAULT now() | Record creation |

**Indexes**: name, resource, action

**Default Permissions** (22 total):
- manage_users, view_users
- manage_staff, view_staff
- manage_students, view_students
- manage_classes, view_classes
- manage_enrollments, view_enrollments
- manage_attendance, view_attendance
- manage_books, view_books
- manage_borrowings, view_borrowings
- manage_roles, view_roles
- manage_settings, view_settings
- view_activity_logs
- view_reports

**RLS**: Enabled
- Admins can view permissions
- Only superadmins can manage permissions

---

### 12. role_permissions
**Purpose**: Junction table linking roles to permissions

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | uuid | PK, DEFAULT gen_random_uuid() | Unique record identifier |
| role_id | uuid | FK → roles, NOT NULL | Role reference |
| permission_id | uuid | FK → permissions, NOT NULL | Permission reference |
| created_at | timestamptz | DEFAULT now() | Record creation |

**Constraints**:
- UNIQUE(role_id, permission_id) - Prevents duplicate assignments

**Indexes**: role_id, permission_id

**Default Assignments**: 66 role-permission mappings created

**RLS**: Enabled
- Admins can view role permissions
- Only superadmins can manage role permissions

---

### 13. activity_logs
**Purpose**: Audit trail for all system actions

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | uuid | PK, DEFAULT gen_random_uuid() | Unique log identifier |
| user_id | uuid | FK → users, NULLABLE | Acting user |
| action_type | varchar(50) | NOT NULL | Action type |
| table_name | varchar(100) | NULLABLE | Affected table |
| record_id | uuid | NULLABLE | Affected record ID |
| old_values | jsonb | NULLABLE | Before state |
| new_values | jsonb | NULLABLE | After state |
| description | text | NULLABLE | Human-readable description |
| ip_address | varchar(45) | NULLABLE | Request IP |
| user_agent | varchar(500) | NULLABLE | Browser/device info |
| created_at | timestamptz | DEFAULT now() | Action timestamp |

**Indexes**: user_id, action_type, table_name, created_at DESC, record_id

**RLS**: Enabled
- Users can view own logs
- Admins can view all logs
- System can insert logs (no restriction)

---

### 14. notifications
**Purpose**: User notification system

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | uuid | PK, DEFAULT gen_random_uuid() | Unique notification identifier |
| user_id | uuid | FK → users, NOT NULL | Recipient user |
| title | varchar(200) | NOT NULL | Notification title |
| message | text | NULLABLE | Notification content |
| notification_type | varchar(50) | NULLABLE | Type/category |
| related_resource_type | varchar(50) | NULLABLE | Related resource |
| related_resource_id | uuid | NULLABLE | Resource ID |
| is_read | boolean | DEFAULT false | Read status |
| action_url | varchar(500) | NULLABLE | Link to resource |
| created_at | timestamptz | DEFAULT now() | Creation time |
| read_at | timestamptz | NULLABLE | When read |

**Indexes**: user_id, is_read, created_at DESC, (user_id, is_read) WHERE is_read = false

**Special Features**:
- Trigger automatically sets read_at when is_read changes to true

**RLS**: Enabled
- Users can view/update own notifications
- System can create notifications

---

### 15. organization_settings
**Purpose**: System-wide configuration settings

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | uuid | PK, DEFAULT gen_random_uuid() | Unique setting identifier |
| setting_key | varchar(100) | UNIQUE, NOT NULL | Setting key |
| setting_value | varchar(1000) | NULLABLE | Setting value |
| setting_type | setting_type | DEFAULT 'string' | Type enum |
| description | text | NULLABLE | Setting description |
| updated_at | timestamptz | DEFAULT now() | Last update |

**Enums**:
- `setting_type`: integer, boolean, string, json

**Indexes**: setting_key

**Default Settings**:
- library_lending_period_days: 14
- max_book_renewal_count: 2
- attendance_low_threshold: 80
- overdue_fine_per_day: 0.50
- max_books_per_user: 3
- enable_email_notifications: true
- academic_year: 2024-2025

**RLS**: Enabled
- All users can view settings
- Only superadmins can modify settings

---

### 16. refresh_tokens
**Purpose**: JWT refresh token management

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | uuid | PK, DEFAULT gen_random_uuid() | Unique token identifier |
| user_id | uuid | FK → users, NOT NULL | User reference |
| token | varchar(500) | UNIQUE, NOT NULL | Refresh token |
| expires_at | timestamptz | NOT NULL | Expiry time |
| created_at | timestamptz | DEFAULT now() | Creation time |
| revoked_at | timestamptz | NULLABLE | Revocation time |
| replaced_by_token | uuid | NULLABLE | Replacement token |

**Indexes**: user_id, token, expires_at

**RLS**: Enabled
- Users can access own tokens
- Users can insert own tokens
- Users can update own tokens

---

## Database Statistics

- **Total Tables**: 16
- **Total Indexes**: 50+
- **Total Triggers**: 10+
- **Total RLS Policies**: 60+
- **Total Foreign Keys**: 25+
- **Custom Types (Enums)**: 10

## Automatic Behaviors

### Triggers
1. **updated_at** - Auto-updates on all tables with updated_at column
2. **student_id generation** - Auto-generates STU-XXXX IDs for students
3. **book_copies creation** - Creates individual copy records when book is added
4. **book availability** - Updates available_copies when books borrowed/returned
5. **book_copy status** - Updates copy status on borrow/return
6. **attendance statistics** - Updates enrollment attendance_count and percentage
7. **overdue status** - Updates is_overdue flag on borrowings
8. **notification read_at** - Sets timestamp when notification marked as read

### Validations
- Email format validation on users, parents, emergency contacts
- Date validations (no future dates, reasonable ranges)
- Positive number checks on counts, prices, copies
- Schedule time validation (end > start)
- Capacity checks (max_capacity > 0)
- ISBN format ready (not enforced yet)

---

**Document Version**: 1.0.0
**Last Updated**: March 3, 2026
**Total Database Size**: Empty (ready for data)

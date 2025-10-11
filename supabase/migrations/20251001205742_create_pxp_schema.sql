/*
  # Create Ponts per la Pau (PXP) Database Schema
  
  Complete schema for managing students, staff, classrooms, branches, and libraries.
  
  ## New Tables
  
  ### Core Authentication & Roles
  - `roles` - User role definitions (admin, staff, student, viewer)
  - `profiles` - User profiles linked to auth.users
  - `approvals` - Signup approval workflow
  
  ### Organization Structure
  - `branches` - Physical locations/branches
  - `classrooms` - Classes within branches
  - `class_teachers` - Teacher assignments to classrooms
  
  ### People Management
  - `staff` - Staff members (teachers, coordinators, etc.)
    - Includes: personal info, documents, job details, history
  - `students` - Students/beneficiaries
    - Includes: personal info, contact, education level
  - `enrollments` - Student enrollment history in classrooms
  
  ### Library System
  - `books` - Book inventory with circulation tracking
  - `library_visits` - Visitor logs and library usage
  - `book_loans` - Book checkout/return tracking
  
  ### Supporting Systems
  - `documents` - Centralized document storage references
  - `notifications` - In-app notifications
  - `audit_log` - Activity tracking for compliance
  
  ## Security
  - RLS enabled on all tables
  - Admin has full access
  - Users can read/update own profiles
  - Staff can manage data within their scope
  - Students have read-only access to own data
*/

-- 0) Extensions
create extension if not exists "uuid-ossp";

-- 1) Auth-backed profiles & roles
create table if not exists public.roles (
  id text primary key,
  description text
);

insert into public.roles (id, description) values
('admin','Full access'),
('staff','Staff member'),
('student','Student/Beneficiary'),
('viewer','Read-only')
on conflict (id) do nothing;

create table if not exists public.profiles (
  id uuid primary key default uuid_generate_v4(),
  auth_user_id uuid unique references auth.users(id) on delete cascade,
  email text unique not null,
  full_name text,
  role_id text references public.roles(id) default 'student',
  status text default 'pending',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 2) Approvals
create table if not exists public.approvals (
  id uuid primary key default uuid_generate_v4(),
  requester_profile_id uuid references public.profiles(id) on delete cascade,
  target_role text references public.roles(id) not null,
  approved_by uuid references public.profiles(id),
  approved_at timestamptz,
  status text default 'pending',
  submitted_payload jsonb,
  created_at timestamptz default now()
);

-- 3) Branches & Classrooms
create table if not exists public.branches (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  province text,
  address text,
  phone text,
  created_at timestamptz default now()
);

create table if not exists public.classrooms (
  id uuid primary key default uuid_generate_v4(),
  branch_id uuid references public.branches(id) on delete cascade,
  name text not null,
  description text,
  teacher_staff_id uuid,
  created_at timestamptz default now()
);

-- 4) Staff
create table if not exists public.staff (
  id uuid primary key default uuid_generate_v4(),
  profile_id uuid unique references public.profiles(id) on delete cascade,
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
  status text default 'active',
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 5) Students / Beneficiaries
create table if not exists public.students (
  id uuid primary key default uuid_generate_v4(),
  profile_id uuid unique references public.profiles(id) on delete cascade,
  first_name text,
  last_name text,
  father_name text,
  age int,
  gender text,
  national_id text,
  profile_photo_url text,
  address text,
  phone text,
  parent_phone text,
  education_level text,
  date_joined date,
  date_left date,
  status text default 'active',
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 6) Teacher/Class links & Enrollments
create table if not exists public.class_teachers (
  id uuid primary key default uuid_generate_v4(),
  classroom_id uuid references public.classrooms(id) on delete cascade,
  staff_id uuid references public.staff(id) on delete set null,
  assigned_at timestamptz default now(),
  unique (classroom_id, staff_id)
);

create table if not exists public.enrollments (
  id uuid primary key default uuid_generate_v4(),
  student_id uuid references public.students(id) on delete cascade,
  classroom_id uuid references public.classrooms(id) on delete cascade,
  start_date date,
  end_date date,
  created_at timestamptz default now()
);

-- 7) Library: Books, Visits, Loans
create table if not exists public.books (
  id uuid primary key default uuid_generate_v4(),
  branch_id uuid references public.branches(id) on delete cascade,
  title text not null,
  author text,
  genre text,
  subject text,
  quantity int default 1,
  code_number text,
  status text default 'available',
  times_borrowed int default 0,
  times_returned int default 0,
  available_copies int generated always as (greatest(quantity - (times_borrowed - times_returned),0)) stored,
  date_of_entry date default current_date,
  created_at timestamptz default now()
);

create table if not exists public.library_visits (
  id uuid primary key default uuid_generate_v4(),
  branch_id uuid references public.branches(id) on delete cascade,
  full_name text,
  father_name text,
  gender text,
  age int,
  phone text,
  email text,
  address text,
  date_of_visit date default current_date,
  purpose text,
  borrowed_book_id uuid references public.books(id),
  return_due date,
  membership_status text,
  created_at timestamptz default now()
);

create table if not exists public.book_loans (
  id uuid primary key default uuid_generate_v4(),
  book_id uuid references public.books(id) on delete cascade,
  borrower_student_id uuid references public.students(id) on delete set null,
  borrower_staff_id uuid references public.staff(id) on delete set null,
  checked_out_at timestamptz default now(),
  due_at timestamptz,
  returned_at timestamptz
);

-- 8) Documents (centralized uploads)
create table if not exists public.documents (
  id uuid primary key default uuid_generate_v4(),
  owner_profile_id uuid references public.profiles(id) on delete cascade,
  category text,
  file_url text not null,
  meta jsonb,
  created_at timestamptz default now()
);

-- 9) Notifications / Activity log
create table if not exists public.notifications (
  id uuid primary key default uuid_generate_v4(),
  profile_id uuid references public.profiles(id) on delete cascade,
  message text,
  read_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists public.audit_log (
  id uuid primary key default uuid_generate_v4(),
  actor_profile_id uuid references public.profiles(id) on delete set null,
  action text,
  entity text,
  entity_id uuid,
  diff jsonb,
  created_at timestamptz default now()
);

-- 10) Triggers to touch updated_at
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end; $$;

drop trigger if exists trg_touch_staff on public.staff;
create trigger trg_touch_staff before update on public.staff for each row execute procedure public.touch_updated_at();

drop trigger if exists trg_touch_student on public.students;
create trigger trg_touch_student before update on public.students for each row execute procedure public.touch_updated_at();

drop trigger if exists trg_touch_profiles on public.profiles;
create trigger trg_touch_profiles before update on public.profiles for each row execute procedure public.touch_updated_at();

-- 11) RLS Policies

-- Profiles
alter table public.profiles enable row level security;

drop policy if exists "admin_all_profiles" on public.profiles;
create policy "admin_all_profiles"
on public.profiles for all
to authenticated
using (
  exists (select 1 from public.profiles p where p.auth_user_id = auth.uid() and p.role_id='admin')
);

drop policy if exists "self_read_profiles" on public.profiles;
create policy "self_read_profiles"
on public.profiles for select
to authenticated
using (auth.uid() = auth_user_id);

drop policy if exists "self_update_profiles" on public.profiles;
create policy "self_update_profiles"
on public.profiles for update
to authenticated
using (auth.uid() = auth_user_id)
with check (auth.uid() = auth_user_id);

-- Approvals
alter table public.approvals enable row level security;

drop policy if exists "admin_all_approvals" on public.approvals;
create policy "admin_all_approvals"
on public.approvals for all
to authenticated
using (
  exists (select 1 from public.profiles p where p.auth_user_id = auth.uid() and p.role_id='admin')
);

drop policy if exists "self_read_approvals" on public.approvals;
create policy "self_read_approvals"
on public.approvals for select
to authenticated
using (
  exists (select 1 from public.profiles p where p.id = approvals.requester_profile_id and p.auth_user_id = auth.uid())
);

-- Staff
alter table public.staff enable row level security;

drop policy if exists "admin_all_staff" on public.staff;
create policy "admin_all_staff"
on public.staff for all
to authenticated
using (
  exists (select 1 from public.profiles p where p.auth_user_id = auth.uid() and p.role_id in ('admin', 'staff'))
);

drop policy if exists "self_read_staff" on public.staff;
create policy "self_read_staff"
on public.staff for select
to authenticated
using (
  exists (select 1 from public.profiles p where p.id = staff.profile_id and p.auth_user_id = auth.uid())
);

-- Students
alter table public.students enable row level security;

drop policy if exists "admin_staff_all_students" on public.students;
create policy "admin_staff_all_students"
on public.students for all
to authenticated
using (
  exists (select 1 from public.profiles p where p.auth_user_id = auth.uid() and p.role_id in ('admin', 'staff'))
);

drop policy if exists "self_read_students" on public.students;
create policy "self_read_students"
on public.students for select
to authenticated
using (
  exists (select 1 from public.profiles p where p.id = students.profile_id and p.auth_user_id = auth.uid())
);

-- Branches
alter table public.branches enable row level security;

drop policy if exists "authenticated_read_branches" on public.branches;
create policy "authenticated_read_branches"
on public.branches for select
to authenticated
using (true);

drop policy if exists "admin_all_branches" on public.branches;
create policy "admin_all_branches"
on public.branches for all
to authenticated
using (
  exists (select 1 from public.profiles p where p.auth_user_id = auth.uid() and p.role_id='admin')
);

-- Classrooms
alter table public.classrooms enable row level security;

drop policy if exists "authenticated_read_classrooms" on public.classrooms;
create policy "authenticated_read_classrooms"
on public.classrooms for select
to authenticated
using (true);

drop policy if exists "admin_staff_manage_classrooms" on public.classrooms;
create policy "admin_staff_manage_classrooms"
on public.classrooms for all
to authenticated
using (
  exists (select 1 from public.profiles p where p.auth_user_id = auth.uid() and p.role_id in ('admin', 'staff'))
);

-- Enrollments
alter table public.enrollments enable row level security;

drop policy if exists "authenticated_read_enrollments" on public.enrollments;
create policy "authenticated_read_enrollments"
on public.enrollments for select
to authenticated
using (true);

drop policy if exists "admin_staff_manage_enrollments" on public.enrollments;
create policy "admin_staff_manage_enrollments"
on public.enrollments for all
to authenticated
using (
  exists (select 1 from public.profiles p where p.auth_user_id = auth.uid() and p.role_id in ('admin', 'staff'))
);

-- Books
alter table public.books enable row level security;

drop policy if exists "authenticated_read_books" on public.books;
create policy "authenticated_read_books"
on public.books for select
to authenticated
using (true);

drop policy if exists "admin_staff_manage_books" on public.books;
create policy "admin_staff_manage_books"
on public.books for all
to authenticated
using (
  exists (select 1 from public.profiles p where p.auth_user_id = auth.uid() and p.role_id in ('admin', 'staff'))
);

-- Library Visits
alter table public.library_visits enable row level security;

drop policy if exists "authenticated_read_library_visits" on public.library_visits;
create policy "authenticated_read_library_visits"
on public.library_visits for select
to authenticated
using (true);

drop policy if exists "admin_staff_manage_library_visits" on public.library_visits;
create policy "admin_staff_manage_library_visits"
on public.library_visits for all
to authenticated
using (
  exists (select 1 from public.profiles p where p.auth_user_id = auth.uid() and p.role_id in ('admin', 'staff'))
);

-- Book Loans
alter table public.book_loans enable row level security;

drop policy if exists "authenticated_read_book_loans" on public.book_loans;
create policy "authenticated_read_book_loans"
on public.book_loans for select
to authenticated
using (true);

drop policy if exists "admin_staff_manage_book_loans" on public.book_loans;
create policy "admin_staff_manage_book_loans"
on public.book_loans for all
to authenticated
using (
  exists (select 1 from public.profiles p where p.auth_user_id = auth.uid() and p.role_id in ('admin', 'staff'))
);

-- Documents
alter table public.documents enable row level security;

drop policy if exists "admin_all_documents" on public.documents;
create policy "admin_all_documents"
on public.documents for all
to authenticated
using (
  exists (select 1 from public.profiles p where p.auth_user_id = auth.uid() and p.role_id='admin')
);

drop policy if exists "owner_manage_documents" on public.documents;
create policy "owner_manage_documents"
on public.documents for all
to authenticated
using (
  exists (select 1 from public.profiles p where p.id = documents.owner_profile_id and p.auth_user_id = auth.uid())
);

-- Notifications
alter table public.notifications enable row level security;

drop policy if exists "self_read_notifications" on public.notifications;
create policy "self_read_notifications"
on public.notifications for select
to authenticated
using (
  exists (select 1 from public.profiles p where p.id = notifications.profile_id and p.auth_user_id = auth.uid())
);

drop policy if exists "self_update_notifications" on public.notifications;
create policy "self_update_notifications"
on public.notifications for update
to authenticated
using (
  exists (select 1 from public.profiles p where p.id = notifications.profile_id and p.auth_user_id = auth.uid())
);

-- Audit Log
alter table public.audit_log enable row level security;

drop policy if exists "admin_read_audit_log" on public.audit_log;
create policy "admin_read_audit_log"
on public.audit_log for select
to authenticated
using (
  exists (select 1 from public.profiles p where p.auth_user_id = auth.uid() and p.role_id='admin')
);

-- Class Teachers
alter table public.class_teachers enable row level security;

drop policy if exists "authenticated_read_class_teachers" on public.class_teachers;
create policy "authenticated_read_class_teachers"
on public.class_teachers for select
to authenticated
using (true);

drop policy if exists "admin_manage_class_teachers" on public.class_teachers;
create policy "admin_manage_class_teachers"
on public.class_teachers for all
to authenticated
using (
  exists (select 1 from public.profiles p where p.auth_user_id = auth.uid() and p.role_id='admin')
);

-- Approved, code-shipped modules. A database row never contains executable code.
CREATE TABLE public.app_modules (
  id text PRIMARY KEY CHECK (id ~ '^[a-z][a-zA-Z0-9]{1,40}$'),
  label text NOT NULL,
  description text NOT NULL DEFAULT '',
  enabled boolean NOT NULL DEFAULT true,
  default_view_roles text[] NOT NULL,
  default_write_roles text[] NOT NULL DEFAULT '{}',
  default_export_roles text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.app_modules ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.app_modules FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_modules TO service_role;

INSERT INTO public.app_modules (id, label, default_view_roles, default_write_roles, default_export_roles) VALUES
('dashboard','Dashboard',ARRAY['superadmin','admin','teacher','librarian','student','parent'],ARRAY['superadmin'],ARRAY['superadmin']),
('staff','Staff',ARRAY['superadmin','admin','teacher','librarian'],ARRAY['superadmin','admin'],ARRAY['superadmin','admin']),
('branches','Branches',ARRAY['superadmin'],ARRAY['superadmin'],ARRAY['superadmin']),
('students','Students',ARRAY['superadmin','admin','teacher','student','parent'],ARRAY['superadmin','admin'],ARRAY['superadmin','admin']),
('classes','Classes',ARRAY['superadmin','admin','teacher','student','parent'],ARRAY['superadmin','admin','teacher'],ARRAY['superadmin','admin','teacher']),
('attendance','Attendance',ARRAY['superadmin','admin','teacher','student','parent'],ARRAY['superadmin','admin','teacher'],ARRAY['superadmin','admin','teacher']),
('grades','Grades',ARRAY['superadmin','admin','teacher','student','parent'],ARRAY['superadmin','admin','teacher'],ARRAY['superadmin','admin','teacher']),
('timetable','Timetable',ARRAY['superadmin','admin','teacher','student'],ARRAY['superadmin','admin','teacher'],ARRAY['superadmin','admin','teacher']),
('calendar','Calendar',ARRAY['superadmin','admin','teacher','student'],ARRAY['superadmin','admin','teacher'],ARRAY['superadmin','admin','teacher']),
('fees','Fees',ARRAY['superadmin','admin','teacher','student','parent'],ARRAY['superadmin','admin','teacher'],ARRAY['superadmin','admin','teacher']),
('parents','Parent portal',ARRAY['superadmin','admin','parent'],ARRAY['superadmin','admin'],ARRAY['superadmin','admin']),
('messages','Messages',ARRAY['superadmin','admin','teacher','librarian'],ARRAY['superadmin','admin','teacher','librarian'],ARRAY['superadmin','admin']),
('donors','Donors',ARRAY['superadmin','admin'],ARRAY['superadmin','admin'],ARRAY['superadmin','admin']),
('library','Library',ARRAY['superadmin','admin','teacher','librarian','student'],ARRAY['superadmin','admin','librarian'],ARRAY['superadmin','admin','librarian']),
('surveys','Surveys',ARRAY['superadmin','admin'],ARRAY['superadmin','admin'],ARRAY['superadmin','admin']),
('reports','Reports',ARRAY['superadmin','admin'],ARRAY['superadmin','admin'],ARRAY['superadmin','admin']),
('passwordResets','Password resets',ARRAY['superadmin','admin'],ARRAY['superadmin','admin'],ARRAY['superadmin','admin']),
('auditLog','Audit history',ARRAY['superadmin','admin'],ARRAY['superadmin','admin'],ARRAY['superadmin','admin']),
('profile','My profile',ARRAY['superadmin','admin','teacher','librarian','student','parent'],ARRAY['superadmin','admin','teacher','librarian','student','parent'],ARRAY['superadmin']),
('settings','Settings',ARRAY['superadmin'],ARRAY['superadmin'],ARRAY['superadmin']);

-- A rule replaces the matching default. A branch rule wins over a global rule;
-- a user rule wins over a role rule. Absence means inherit. Grants never
-- exceed the module's role ceiling or the existing backend data scope.
CREATE TABLE public.module_access_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id text NOT NULL REFERENCES public.app_modules(id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN ('view','create','edit','delete','export','manage')),
  user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
  role text CHECK (role IN ('superadmin','admin','teacher','librarian','student','parent')),
  branch_id uuid REFERENCES public.branches(id) ON DELETE CASCADE,
  allowed boolean NOT NULL,
  changed_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT module_rule_one_subject CHECK ((user_id IS NULL) <> (role IS NULL)),
  CONSTRAINT module_rule_unique UNIQUE NULLS NOT DISTINCT (module_id, action, user_id, role, branch_id)
);
CREATE INDEX module_access_rules_user_idx ON public.module_access_rules(user_id, module_id);
CREATE INDEX module_access_rules_role_idx ON public.module_access_rules(role, module_id);
ALTER TABLE public.module_access_rules ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.module_access_rules FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.module_access_rules TO service_role;

-- Preserve every access edit, including deletion back to inherited defaults.
CREATE TABLE public.module_access_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  module_id text NOT NULL,
  action text NOT NULL,
  user_id uuid,
  role text,
  branch_id uuid,
  previous_allowed boolean,
  new_allowed boolean,
  actor_id uuid,
  changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX module_access_events_changed_idx ON public.module_access_events(changed_at DESC);
ALTER TABLE public.module_access_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.module_access_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.module_access_events TO service_role;
GRANT USAGE ON SEQUENCE public.module_access_events_id_seq TO service_role;

CREATE FUNCTION public.record_module_access_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  actor_header text;
  actor_id uuid;
  row_data public.module_access_rules%ROWTYPE;
BEGIN
  row_data := CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  IF coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb->>'role' = 'service_role' THEN
    actor_header := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb->>'x-app-actor';
    IF actor_header ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      SELECT id INTO actor_id FROM public.users WHERE id = actor_header::uuid;
    END IF;
  END IF;
  IF actor_id IS NULL THEN RAISE EXCEPTION 'Module access edits require a verified service actor'; END IF;
  INSERT INTO public.module_access_events(module_id, action, user_id, role, branch_id, previous_allowed, new_allowed, actor_id)
  VALUES (row_data.module_id, row_data.action, row_data.user_id, row_data.role, row_data.branch_id,
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.allowed END,
    CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE NEW.allowed END, actor_id);
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.record_module_access_change() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER module_access_change AFTER INSERT OR UPDATE OR DELETE ON public.module_access_rules
  FOR EACH ROW EXECUTE FUNCTION public.record_module_access_change();

NOTIFY pgrst, 'reload schema';

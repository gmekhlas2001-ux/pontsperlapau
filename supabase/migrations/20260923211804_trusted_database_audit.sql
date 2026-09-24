-- Preserve legacy history, clearly distinguished from new database events.
ALTER TABLE public.activity_logs
  ADD COLUMN event_source text NOT NULL DEFAULT 'legacy_client'
    CHECK (event_source IN ('legacy_client', 'database', 'edge')),
  ADD COLUMN branch_id uuid,
  ADD COLUMN changed_fields text[];
COMMENT ON COLUMN public.activity_logs.branch_id IS
  'Branch at event time; deliberately retained when a branch is deleted.';
CREATE INDEX idx_activity_logs_branch_created
  ON public.activity_logs(branch_id, created_at DESC);

CREATE FUNCTION public.audit_business_change()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  row_data jsonb;
  previous_data jsonb := '{}'::jsonb;
  changed text[];
  actor_id uuid;
  event_branch uuid;
  actor_header text;
  source text := 'database';
BEGIN
  row_data := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  IF TG_OP = 'UPDATE' THEN
    previous_data := to_jsonb(OLD);
    SELECT array_agg(key ORDER BY key) INTO changed
    FROM jsonb_each(row_data)
    WHERE value IS DISTINCT FROM previous_data->key
      AND key NOT IN ('updated_at', 'last_login');
    IF coalesce(cardinality(changed), 0) = 0 THEN RETURN NEW; END IF;
  END IF;

  -- Only a service-role request can attribute an event to the custom session.
  -- Edge Functions set this header from authenticateRequest(), never req.headers.
  IF coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb->>'role' = 'service_role' THEN
    actor_header := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb->>'x-app-actor';
    IF actor_header ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      SELECT id INTO actor_id FROM public.users WHERE id = actor_header::uuid;
      IF actor_id IS NOT NULL THEN source := 'edge'; END IF;
    END IF;
  END IF;

  IF row_data ? 'branch_id' THEN
    event_branch := (row_data->>'branch_id')::uuid;
  ELSIF TG_TABLE_NAME = 'branches' THEN
    event_branch := (row_data->>'id')::uuid;
  ELSIF row_data ? 'class_id' THEN
    SELECT branch_id INTO event_branch FROM public.classes WHERE id = (row_data->>'class_id')::uuid;
  ELSIF row_data ? 'grant_id' THEN
    SELECT branch_id INTO event_branch FROM public.grants WHERE id = (row_data->>'grant_id')::uuid;
  ELSIF row_data ? 'book_id' THEN
    SELECT branch_id INTO event_branch FROM public.books WHERE id = (row_data->>'book_id')::uuid;
  ELSIF row_data ? 'user_id' THEN
    SELECT branch_id INTO event_branch FROM public.users WHERE id = (row_data->>'user_id')::uuid;
  END IF;

  -- Store identifiers and changed field names only. Never duplicate passwords,
  -- documents, medical notes, messages, or survey answers into the audit log.
  INSERT INTO public.activity_logs (
    user_id, action_type, table_name, record_id, description,
    event_source, branch_id, changed_fields
  ) VALUES (
    actor_id, TG_OP, TG_TABLE_NAME, (row_data->>'id')::uuid,
    TG_OP || ' ' || TG_TABLE_NAME, source, event_branch, changed
  );
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.audit_business_change() FROM PUBLIC, anon, authenticated;

-- Audit business records. Answer cells and generated sections/options are
-- intentionally excluded; their enclosing submission/survey is the event.
DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'users', 'staff', 'students', 'branches', 'classes', 'class_enrollments',
    'attendance', 'grade_entries', 'books', 'book_borrowings', 'student_fees',
    'donors', 'grants', 'grant_transactions', 'transactions', 'messages',
    'surveys', 'survey_branch_submissions', 'survey_respondents',
    'organization_settings', 'user_documents', 'parent_student_links'
  ] LOOP
    EXECUTE format(
      'CREATE TRIGGER audit_business_change AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.audit_business_change()',
      table_name
    );
  END LOOP;
END;
$$;
NOTIFY pgrst, 'reload schema';

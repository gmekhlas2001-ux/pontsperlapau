-- One RPC is one transaction: invalid children never leave a partial survey.
CREATE FUNCTION public.create_survey_atomic(
  p_actor_id uuid, p_fields jsonb, p_sections jsonb, p_questions jsonb,
  p_options jsonb, p_respondents jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  actor public.users%ROWTYPE;
  v_survey_id uuid;
  v_branch_id uuid := (p_fields->>'branch_id')::uuid;
  respondent_kind text := p_fields->>'respondent_type';
  respondent record;
  v_respondent_name text;
BEGIN
  SELECT * INTO actor FROM public.users WHERE id = p_actor_id AND status = 'active' FOR SHARE;
  IF NOT FOUND OR actor.role NOT IN ('admin', 'superadmin') THEN
    RAISE EXCEPTION 'Insufficient permissions' USING ERRCODE = '42501';
  END IF;
  IF v_branch_id IS NULL OR (actor.role = 'admin' AND actor.branch_id IS DISTINCT FROM v_branch_id) THEN
    RAISE EXCEPTION 'Survey branch is outside your scope' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(p_fields) IS DISTINCT FROM 'object'
    OR jsonb_typeof(p_sections) IS DISTINCT FROM 'array'
    OR jsonb_typeof(p_questions) IS DISTINCT FROM 'array'
    OR jsonb_typeof(p_options) IS DISTINCT FROM 'array'
    OR jsonb_typeof(p_respondents) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Invalid survey structure';
  END IF;
  IF jsonb_array_length(p_sections) > 100 OR jsonb_array_length(p_questions) NOT BETWEEN 1 AND 500
    OR jsonb_array_length(p_options) > 10000 OR jsonb_array_length(p_respondents) > 5000
    OR coalesce(length(btrim(p_fields->>'title')), 0) NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION 'Invalid survey size';
  END IF;
  -- Cross-survey references are forbidden, even for malformed server payloads.
  IF EXISTS (
    SELECT 1 FROM jsonb_to_recordset(p_questions) q(section_id uuid, question_text text)
    WHERE coalesce(length(btrim(q.question_text)), 0) NOT BETWEEN 1 AND 10000
      OR (q.section_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM jsonb_to_recordset(p_sections) s(id uuid) WHERE s.id = q.section_id
      ))
  ) OR EXISTS (
    SELECT 1 FROM jsonb_to_recordset(p_options) o(question_id uuid, label text)
    WHERE coalesce(length(btrim(o.label)), 0) NOT BETWEEN 1 AND 2000
      OR (o.question_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM jsonb_to_recordset(p_questions) q(id uuid) WHERE q.id = o.question_id
      ))
  ) THEN RAISE EXCEPTION 'Invalid question or option reference'; END IF;

  INSERT INTO public.surveys (
    title, description, period, status, created_by, branch_id, respondent_type,
    language, survey_date, survey_code, reporting_cycle_id
  ) VALUES (
    btrim(p_fields->>'title'), p_fields->>'description', p_fields->>'period',
    p_fields->>'status', p_actor_id, v_branch_id, respondent_kind,
    p_fields->>'language', (p_fields->>'survey_date')::date,
    p_fields->>'survey_code', (p_fields->>'reporting_cycle_id')::uuid
  ) RETURNING id INTO v_survey_id;

  PERFORM public.replace_survey_structure_atomic(v_survey_id, '{}'::jsonb, p_sections, p_questions, p_options);

  FOR respondent IN
    SELECT * FROM jsonb_to_recordset(p_respondents) r(respondent_type text, respondent_id uuid)
  LOOP
    v_respondent_name := NULL;
    IF respondent.respondent_type = 'student' AND respondent_kind IN ('students', 'students_staff') THEN
      SELECT concat_ws(' ', u.first_name, u.last_name) INTO v_respondent_name
      FROM public.students s JOIN public.users u ON u.id = s.user_id
      WHERE s.id = respondent.respondent_id AND s.branch_id = v_branch_id AND s.deleted_at IS NULL
      FOR SHARE OF s;
    ELSIF respondent.respondent_type = 'staff' AND respondent_kind IN ('staff', 'students_staff') THEN
      SELECT concat_ws(' ', u.first_name, u.last_name) INTO v_respondent_name
      FROM public.staff s JOIN public.users u ON u.id = s.user_id
      WHERE s.id = respondent.respondent_id AND s.branch_id = v_branch_id AND s.deleted_at IS NULL
      FOR SHARE OF s;
    END IF;
    IF v_respondent_name IS NULL THEN
      RAISE EXCEPTION 'Respondent is invalid or outside the survey branch' USING ERRCODE = '42501';
    END IF;
    INSERT INTO public.survey_respondents(survey_id, branch_id, respondent_type, respondent_id, respondent_name)
    VALUES (v_survey_id, v_branch_id, respondent.respondent_type, respondent.respondent_id, v_respondent_name);
  END LOOP;
  RETURN v_survey_id;
END;
$$;
REVOKE ALL ON FUNCTION public.create_survey_atomic(uuid, jsonb, jsonb, jsonb, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_survey_atomic(uuid, jsonb, jsonb, jsonb, jsonb, jsonb) TO service_role;
NOTIFY pgrst, 'reload schema';

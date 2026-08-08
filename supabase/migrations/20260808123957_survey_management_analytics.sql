-- Survey management analytics and respondent activity tracking.
--
-- Existing answer rows are preserved. Historical activity timestamps are only
-- an inference from the current rows because legacy saves rewrote answers.

ALTER TABLE public.surveys
  ADD COLUMN IF NOT EXISTS survey_code text,
  ADD COLUMN IF NOT EXISTS reporting_cycle_id uuid;

ALTER TABLE public.surveys
  DROP CONSTRAINT IF EXISTS surveys_survey_code_check;

ALTER TABLE public.surveys
  ADD CONSTRAINT surveys_survey_code_check
  CHECK (survey_code IS NULL OR survey_code IN ('T1', 'T2', 'T3', 'T4', 'T5', 'T6'));

-- Persist the current six-survey classification once. All analytics below use
-- this metadata rather than continuing to infer identity from mutable titles.
UPDATE public.surveys survey
SET survey_code = CASE
  WHEN survey.title ~* '(^|[^[:alnum:]])t1([^0-9]|$)'
    OR survey.title LIKE '%ارزیابی نهایی%' THEN 'T1'
  WHEN survey.title ~* '(^|[^[:alnum:]])t2([^0-9]|$)' THEN 'T2'
  WHEN survey.title ~* '(^|[^[:alnum:]])t3([^0-9]|$)' THEN 'T3'
  WHEN survey.title ~* '(^|[^[:alnum:]])t4([^0-9]|$)' THEN 'T4'
  WHEN survey.title ~* '(^|[^[:alnum:]])t5([^0-9]|$)' THEN 'T5'
  WHEN survey.title ~* '(^|[^[:alnum:]])t6([^0-9]|$)' THEN 'T6'
  ELSE NULL
END
WHERE survey.survey_code IS NULL;

UPDATE public.surveys survey
SET reporting_cycle_id = md5('ponts-per-la-pau:legacy-core-survey-cycle')::uuid
WHERE survey.branch_id IS NOT NULL
  AND survey.survey_code IS NOT NULL
  AND survey.reporting_cycle_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_surveys_branch_cycle_code
  ON public.surveys(branch_id, reporting_cycle_id, survey_code)
  WHERE branch_id IS NOT NULL AND reporting_cycle_id IS NOT NULL AND survey_code IS NOT NULL;

ALTER TABLE public.survey_questions
  ADD COLUMN IF NOT EXISTS required boolean NOT NULL DEFAULT true;

ALTER TABLE public.survey_respondents
  ADD COLUMN IF NOT EXISTS response_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_activity_at timestamptz,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS completion_source text,
  ADD COLUMN IF NOT EXISTS activity_source text;

ALTER TABLE public.survey_respondents
  DROP CONSTRAINT IF EXISTS survey_respondents_completion_source_check;

ALTER TABLE public.survey_respondents
  ADD CONSTRAINT survey_respondents_completion_source_check
  CHECK (completion_source IS NULL OR completion_source IN ('inferred_current_answers', 'saved_complete'));

ALTER TABLE public.survey_respondents
  DROP CONSTRAINT IF EXISTS survey_respondents_activity_source_check;

ALTER TABLE public.survey_respondents
  ADD CONSTRAINT survey_respondents_activity_source_check
  CHECK (activity_source IS NULL OR activity_source IN ('inferred_current_rows', 'tracked'));

WITH question_counts AS (
  SELECT survey_id, COUNT(*)::integer AS question_count
  FROM public.survey_questions
  WHERE required
  GROUP BY survey_id
), response_activity AS (
  SELECT
    response.survey_id,
    response.branch_id,
    response.respondent_type,
    response.respondent_id,
    COUNT(DISTINCT response.question_id) FILTER (WHERE question.required)::integer AS answered_questions,
    MIN(response.updated_at) AS first_activity,
    MAX(response.updated_at) AS last_activity
  FROM public.survey_individual_responses response
  JOIN public.survey_questions question
    ON question.id = response.question_id AND question.survey_id = response.survey_id
  GROUP BY response.survey_id, response.branch_id, response.respondent_type, response.respondent_id
)
UPDATE public.survey_respondents respondent
SET
  response_started_at = COALESCE(respondent.response_started_at, activity.first_activity),
  last_activity_at = GREATEST(respondent.last_activity_at, activity.last_activity),
  activity_source = COALESCE(respondent.activity_source, 'inferred_current_rows'),
  completed_at = CASE
    WHEN activity.answered_questions >= questions.question_count
      AND questions.question_count > 0
      THEN COALESCE(respondent.completed_at, activity.last_activity)
    ELSE respondent.completed_at
  END,
  completion_source = CASE
    WHEN activity.answered_questions >= questions.question_count
      AND questions.question_count > 0
      THEN COALESCE(respondent.completion_source, 'inferred_current_answers')
    ELSE respondent.completion_source
  END
FROM response_activity activity
JOIN question_counts questions ON questions.survey_id = activity.survey_id
WHERE respondent.survey_id = activity.survey_id
  AND respondent.branch_id = activity.branch_id
  AND respondent.respondent_type = activity.respondent_type
  AND respondent.respondent_id = activity.respondent_id;

CREATE INDEX IF NOT EXISTS idx_survey_respondents_branch_activity
  ON public.survey_respondents(branch_id, last_activity_at DESC)
  WHERE last_activity_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sir_survey_branch_respondent_question
  ON public.survey_individual_responses(
    survey_id,
    branch_id,
    respondent_type,
    respondent_id,
    question_id
  );

CREATE INDEX IF NOT EXISTS idx_sir_branch_updated_at
  ON public.survey_individual_responses(branch_id, updated_at DESC);

ALTER TABLE public.survey_individual_responses
  DROP CONSTRAINT IF EXISTS survey_individual_responses_exactly_one_payload;

ALTER TABLE public.survey_individual_responses
  ADD CONSTRAINT survey_individual_responses_exactly_one_payload
  CHECK (num_nonnulls(option_id, NULLIF(btrim(text_answer), '')) = 1) NOT VALID;

ALTER TABLE public.survey_individual_responses
  VALIDATE CONSTRAINT survey_individual_responses_exactly_one_payload;

CREATE UNIQUE INDEX IF NOT EXISTS idx_sir_unique_option_answer
  ON public.survey_individual_responses(
    survey_id, branch_id, respondent_type, respondent_id, question_id, option_id
  )
  WHERE option_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_sir_unique_text_answer
  ON public.survey_individual_responses(
    survey_id, branch_id, respondent_type, respondent_id, question_id
  )
  WHERE option_id IS NULL;

CREATE OR REPLACE FUNCTION public.save_survey_individual_atomic(
  p_survey_id uuid,
  p_branch_id uuid,
  p_respondent_type text,
  p_respondent_id uuid,
  p_respondent_name text,
  p_answered_by uuid,
  p_question_ids uuid[],
  p_answers jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  individual_total integer;
  question_total integer;
  answered_question_total integer;
  activity_time timestamptz := now();
BEGIN
  PERFORM 1
  FROM public.surveys
  WHERE id = p_survey_id AND branch_id = p_branch_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Survey is outside this branch';
  END IF;

  PERFORM 1
  FROM public.survey_respondents
  WHERE survey_id = p_survey_id
    AND branch_id = p_branch_id
    AND respondent_type = p_respondent_type
    AND respondent_id = p_respondent_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Respondent is not assigned to this survey';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.survey_branch_responses aggregate_response
    WHERE aggregate_response.survey_id = p_survey_id
      AND aggregate_response.branch_id = p_branch_id
      AND aggregate_response.count > 0
  ) AND NOT EXISTS (
    SELECT 1
    FROM public.survey_individual_responses named_response
    WHERE named_response.survey_id = p_survey_id
      AND named_response.branch_id = p_branch_id
  ) THEN
    RAISE EXCEPTION 'Named answers cannot be started because aggregate counts already exist';
  END IF;

  IF jsonb_typeof(p_answers) <> 'array' OR jsonb_array_length(p_answers) = 0 THEN
    RAISE EXCEPTION 'At least one valid answer is required';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_answers) AS answer(question_id uuid, option_id uuid, text_answer text)
    LEFT JOIN public.survey_questions question
      ON question.id = answer.question_id AND question.survey_id = p_survey_id
    LEFT JOIN public.survey_response_options option
      ON option.id = answer.option_id
      AND option.survey_id = p_survey_id
      AND (option.question_id IS NULL OR option.question_id = answer.question_id)
    WHERE question.id IS NULL
      OR NOT (answer.question_id = ANY(COALESCE(p_question_ids, ARRAY[]::uuid[])))
      OR (answer.option_id IS NULL) = (NULLIF(btrim(answer.text_answer), '') IS NULL)
      OR (answer.option_id IS NOT NULL AND option.id IS NULL)
  ) THEN
    RAISE EXCEPTION 'Answers contain invalid questions or options';
  END IF;

  IF EXISTS (
    SELECT answer.question_id
    FROM jsonb_to_recordset(p_answers) AS answer(question_id uuid, option_id uuid, text_answer text)
    JOIN public.survey_questions question
      ON question.id = answer.question_id AND question.survey_id = p_survey_id
    WHERE question.question_type NOT IN ('checkboxes', 'checkbox_grid')
    GROUP BY answer.question_id
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'A single-answer question contains multiple answers';
  END IF;

  DELETE FROM public.survey_individual_responses
  WHERE survey_id = p_survey_id
    AND branch_id = p_branch_id
    AND respondent_type = p_respondent_type
    AND respondent_id = p_respondent_id
    AND question_id = ANY(COALESCE(p_question_ids, ARRAY[]::uuid[]));

  INSERT INTO public.survey_individual_responses(
    survey_id,
    branch_id,
    respondent_type,
    respondent_id,
    respondent_name,
    question_id,
    option_id,
    text_answer,
    answered_by,
    updated_at
  )
  SELECT
    p_survey_id,
    p_branch_id,
    p_respondent_type,
    p_respondent_id,
    p_respondent_name,
    answer.question_id,
    answer.option_id,
    NULLIF(btrim(answer.text_answer), ''),
    p_answered_by,
    activity_time
  FROM jsonb_to_recordset(p_answers) AS answer(question_id uuid, option_id uuid, text_answer text);

  SELECT COUNT(*)::integer
  INTO question_total
  FROM public.survey_questions
  WHERE survey_id = p_survey_id AND required;

  SELECT COUNT(DISTINCT response.question_id)::integer
  INTO answered_question_total
  FROM public.survey_individual_responses response
  JOIN public.survey_questions question
    ON question.id = response.question_id
    AND question.survey_id = response.survey_id
    AND question.required
  WHERE response.survey_id = p_survey_id
    AND response.branch_id = p_branch_id
    AND response.respondent_type = p_respondent_type
    AND response.respondent_id = p_respondent_id;

  UPDATE public.survey_respondents
  SET
    respondent_name = p_respondent_name,
    response_started_at = COALESCE(response_started_at, activity_time),
    last_activity_at = activity_time,
    activity_source = 'tracked',
    completed_at = CASE
      WHEN question_total > 0 AND answered_question_total >= question_total
        THEN COALESCE(completed_at, activity_time)
      ELSE NULL
    END,
    completion_source = CASE
      WHEN question_total > 0 AND answered_question_total >= question_total
        THEN 'saved_complete'
      ELSE NULL
    END
  WHERE survey_id = p_survey_id
    AND branch_id = p_branch_id
    AND respondent_type = p_respondent_type
    AND respondent_id = p_respondent_id;

  SELECT COUNT(DISTINCT (respondent_type, respondent_id))::integer
  INTO individual_total
  FROM public.survey_individual_responses
  WHERE survey_id = p_survey_id AND branch_id = p_branch_id;

  INSERT INTO public.survey_branch_submissions(
    survey_id,
    branch_id,
    total_respondents,
    submitted_by
  ) VALUES (
    p_survey_id,
    p_branch_id,
    individual_total,
    p_answered_by
  )
  ON CONFLICT (survey_id, branch_id) DO UPDATE SET
    total_respondents = CASE
      WHEN EXISTS (
        SELECT 1
        FROM public.survey_branch_responses aggregate_response
        WHERE aggregate_response.survey_id = EXCLUDED.survey_id
          AND aggregate_response.branch_id = EXCLUDED.branch_id
          AND aggregate_response.count > 0
      ) THEN public.survey_branch_submissions.total_respondents
      ELSE EXCLUDED.total_respondents
    END,
    submitted_by = EXCLUDED.submitted_by,
    updated_at = activity_time;
END;
$$;

REVOKE ALL ON FUNCTION public.save_survey_individual_atomic(
  uuid, uuid, text, uuid, text, uuid, uuid[], jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_survey_individual_atomic(
  uuid, uuid, text, uuid, text, uuid, uuid[], jsonb
) TO service_role;

-- Aggregate entry is exclusive for future writes. Existing mixed datasets are
-- preserved and surfaced for review, but aggregate edits cannot create a new
-- conflict with named respondent answers. Zero cells are not persisted.
CREATE OR REPLACE FUNCTION public.save_survey_aggregate_atomic(
  p_survey_id uuid,
  p_branch_id uuid,
  p_total_respondents integer,
  p_entered_by uuid,
  p_counts jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM 1
  FROM public.surveys
  WHERE id = p_survey_id AND branch_id = p_branch_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Survey is outside this branch';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.survey_individual_responses response
    WHERE response.survey_id = p_survey_id AND response.branch_id = p_branch_id
  ) THEN
    RAISE EXCEPTION 'Aggregate counts cannot be saved because named respondent answers exist';
  END IF;

  IF p_total_respondents <= 0 OR jsonb_typeof(p_counts) <> 'array' THEN
    RAISE EXCEPTION 'Aggregate entry requires a positive respondent total and valid counts';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_counts) AS count_row(question_id uuid, option_id uuid, count integer)
    WHERE count_row.count > 0
  ) THEN
    RAISE EXCEPTION 'At least one positive aggregate count is required';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_counts) AS count_row(question_id uuid, option_id uuid, count integer)
    LEFT JOIN public.survey_questions question
      ON question.id = count_row.question_id AND question.survey_id = p_survey_id
    LEFT JOIN public.survey_response_options option
      ON option.id = count_row.option_id
      AND option.survey_id = p_survey_id
      AND (option.question_id IS NULL OR option.question_id = count_row.question_id)
    WHERE count_row.count IS NULL OR count_row.count < 0 OR question.id IS NULL OR option.id IS NULL
  ) THEN
    RAISE EXCEPTION 'Survey counts contain invalid questions, options, or values';
  END IF;

  IF EXISTS (
    SELECT count_row.question_id
    FROM jsonb_to_recordset(p_counts) AS count_row(question_id uuid, option_id uuid, count integer)
    JOIN public.survey_questions question
      ON question.id = count_row.question_id AND question.survey_id = p_survey_id
    WHERE question.question_type NOT IN ('checkboxes', 'checkbox_grid', 'multiple_choice_grid')
    GROUP BY count_row.question_id
    HAVING SUM(count_row.count) > p_total_respondents
  ) THEN
    RAISE EXCEPTION 'Question totals cannot exceed the respondent total';
  END IF;

  DELETE FROM public.survey_branch_responses
  WHERE survey_id = p_survey_id AND branch_id = p_branch_id;

  INSERT INTO public.survey_branch_responses(
    survey_id,
    branch_id,
    question_id,
    option_id,
    count,
    entered_by,
    updated_at
  )
  SELECT
    p_survey_id,
    p_branch_id,
    count_row.question_id,
    count_row.option_id,
    count_row.count,
    p_entered_by,
    now()
  FROM jsonb_to_recordset(p_counts) AS count_row(question_id uuid, option_id uuid, count integer)
  WHERE count_row.count > 0;

  INSERT INTO public.survey_branch_submissions(
    survey_id,
    branch_id,
    total_respondents,
    submitted_by
  ) VALUES (
    p_survey_id,
    p_branch_id,
    p_total_respondents,
    p_entered_by
  )
  ON CONFLICT (survey_id, branch_id) DO UPDATE SET
    total_respondents = EXCLUDED.total_respondents,
    submitted_by = EXCLUDED.submitted_by,
    updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.save_survey_aggregate_atomic(
  uuid, uuid, integer, uuid, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_survey_aggregate_atomic(
  uuid, uuid, integer, uuid, jsonb
) TO service_role;

-- Reconcile stale named-only submission counters against the distinct people
-- actually represented in the answer table. Mixed/aggregate datasets are
-- deliberately excluded because their totals require a human source decision.
WITH named_counts AS (
  SELECT
    response.survey_id,
    response.branch_id,
    COUNT(DISTINCT (response.respondent_type, response.respondent_id))::integer AS respondent_total
  FROM public.survey_individual_responses response
  GROUP BY response.survey_id, response.branch_id
)
UPDATE public.survey_branch_submissions submission
SET
  total_respondents = named.respondent_total,
  updated_at = now()
FROM named_counts named
WHERE submission.survey_id = named.survey_id
  AND submission.branch_id = named.branch_id
  AND submission.total_respondents IS DISTINCT FROM named.respondent_total
  AND NOT EXISTS (
    SELECT 1
    FROM public.survey_branch_responses aggregate_response
    WHERE aggregate_response.survey_id = submission.survey_id
      AND aggregate_response.branch_id = submission.branch_id
      AND aggregate_response.count > 0
  );

CREATE OR REPLACE FUNCTION public.get_survey_management_overview(
  p_branch_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
WITH all_surveys AS (
  SELECT survey.*
  FROM public.surveys survey
  WHERE survey.branch_id IS NOT NULL
    AND (p_branch_id IS NULL OR survey.branch_id = p_branch_id)
), cycle_candidates AS (
  SELECT
    survey.branch_id,
    survey.reporting_cycle_id,
    MAX(COALESCE(survey.survey_date, (survey.created_at AT TIME ZONE 'UTC')::date)) AS latest_effective_date,
    MAX(survey.created_at) AS latest_created_at,
    MAX(survey.id::text) AS latest_survey_id
  FROM all_surveys survey
  WHERE survey.survey_code IS NOT NULL
    AND survey.reporting_cycle_id IS NOT NULL
  GROUP BY survey.branch_id, survey.reporting_cycle_id
), active_cycles AS (
  SELECT DISTINCT ON (candidate.branch_id)
    candidate.branch_id,
    candidate.reporting_cycle_id
  FROM cycle_candidates candidate
  ORDER BY
    candidate.branch_id,
    candidate.latest_effective_date DESC,
    candidate.latest_created_at DESC,
    candidate.latest_survey_id DESC
), survey_base AS (
  SELECT survey.*
  FROM all_surveys survey
  JOIN active_cycles cycle
    ON cycle.branch_id = survey.branch_id
    AND cycle.reporting_cycle_id = survey.reporting_cycle_id
  WHERE survey.survey_code IS NOT NULL
), question_counts AS (
  SELECT question.survey_id, COUNT(*)::integer AS question_count
  FROM public.survey_questions question
  JOIN survey_base survey ON survey.id = question.survey_id
  WHERE question.required
  GROUP BY question.survey_id
), answer_counts AS (
  SELECT
    response.survey_id,
    response.branch_id,
    response.respondent_type,
    response.respondent_id,
    COUNT(DISTINCT response.question_id) FILTER (WHERE question.required)::integer AS answered_questions,
    MIN(response.updated_at) AS first_activity,
    MAX(response.updated_at) AS last_activity
  FROM public.survey_individual_responses response
  JOIN survey_base survey ON survey.id = response.survey_id
  JOIN public.survey_questions question
    ON question.id = response.question_id AND question.survey_id = response.survey_id
  GROUP BY response.survey_id, response.branch_id, response.respondent_type, response.respondent_id
), assignment_status AS (
  SELECT
    respondent.id AS assignment_id,
    respondent.survey_id,
    respondent.branch_id,
    respondent.respondent_type,
    respondent.respondent_id,
    respondent.respondent_name,
    COALESCE(answers.answered_questions, 0) AS answered_questions,
    COALESCE(questions.question_count, 0) AS question_count,
    COALESCE(respondent.response_started_at, answers.first_activity) AS first_activity,
    GREATEST(respondent.last_activity_at, answers.last_activity) AS last_activity,
    CASE
      WHEN respondent.completed_at IS NOT NULL
        AND COALESCE(questions.question_count, 0) > 0
        AND COALESCE(answers.answered_questions, 0) >= questions.question_count
        THEN 'completed'
      WHEN respondent.response_started_at IS NOT NULL OR COALESCE(answers.answered_questions, 0) > 0
        THEN 'incomplete'
      ELSE 'not_responded'
    END AS response_status,
    respondent.completed_at,
    respondent.completion_source
  FROM public.survey_respondents respondent
  JOIN survey_base survey ON survey.id = respondent.survey_id
    AND survey.branch_id = respondent.branch_id
  LEFT JOIN question_counts questions ON questions.survey_id = respondent.survey_id
  LEFT JOIN answer_counts answers
    ON answers.survey_id = respondent.survey_id
    AND answers.branch_id = respondent.branch_id
    AND answers.respondent_type = respondent.respondent_type
    AND answers.respondent_id = respondent.respondent_id
), survey_metrics AS (
  SELECT
    survey.id AS survey_id,
    survey.branch_id,
    survey.survey_code,
    survey.reporting_cycle_id,
    survey.title,
    survey.status,
    survey.survey_date,
    survey.created_at,
    COALESCE(questions.question_count, 0) AS question_count,
    COUNT(status.assignment_id)::integer AS expected,
    COUNT(status.assignment_id) FILTER (WHERE status.response_status = 'completed')::integer AS completed,
    COUNT(status.assignment_id) FILTER (WHERE status.response_status = 'incomplete')::integer AS incomplete,
    COUNT(status.assignment_id) FILTER (WHERE status.response_status = 'not_responded')::integer AS not_responded,
    COUNT(status.assignment_id) FILTER (WHERE status.response_status <> 'not_responded')::integer AS started,
    MAX(status.last_activity) AS last_activity
  FROM survey_base survey
  LEFT JOIN question_counts questions ON questions.survey_id = survey.id
  LEFT JOIN assignment_status status ON status.survey_id = survey.id
  GROUP BY
    survey.id,
    survey.branch_id,
    survey.survey_code,
    survey.reporting_cycle_id,
    survey.title,
    survey.status,
    survey.survey_date,
    survey.created_at,
    questions.question_count
), branch_metrics AS (
  SELECT
    branch.id AS branch_id,
    btrim(branch.name) AS branch_name,
    COUNT(DISTINCT metrics.survey_id)::integer AS survey_count,
    COUNT(DISTINCT metrics.survey_code) FILTER (WHERE metrics.survey_code IS NOT NULL)::integer AS canonical_survey_count,
    COALESCE(SUM(metrics.expected) FILTER (WHERE metrics.survey_code IS NOT NULL), 0)::integer AS expected_assignments,
    COALESCE(SUM(metrics.completed) FILTER (WHERE metrics.survey_code IS NOT NULL), 0)::integer AS completed,
    COALESCE(SUM(metrics.incomplete) FILTER (WHERE metrics.survey_code IS NOT NULL), 0)::integer AS incomplete,
    COALESCE(SUM(metrics.not_responded) FILTER (WHERE metrics.survey_code IS NOT NULL), 0)::integer AS not_responded,
    COALESCE(SUM(metrics.started) FILTER (WHERE metrics.survey_code IS NOT NULL), 0)::integer AS total_submissions,
    MAX(metrics.last_activity) FILTER (WHERE metrics.survey_code IS NOT NULL) AS last_activity
  FROM public.branches branch
  JOIN survey_metrics metrics ON metrics.branch_id = branch.id
  GROUP BY branch.id, branch.name
)
SELECT jsonb_build_object(
  'definitions', jsonb_build_object(
    'expected', 'Respondent-survey assignment records in the core T1-T6 set',
    'completed', 'Assigned people with all required questions answered under the current survey definition',
    'incomplete', 'Assigned people with saved activity but not all required questions answered',
    'notResponded', 'Assigned people with no saved activity',
    'totalSubmissions', 'Distinct respondent-survey records with saved activity'
  ),
  'summary', jsonb_build_object(
    'expectedAssignments', COALESCE((SELECT SUM(expected_assignments) FROM branch_metrics), 0),
    'completed', COALESCE((SELECT SUM(completed) FROM branch_metrics), 0),
    'incomplete', COALESCE((SELECT SUM(incomplete) FROM branch_metrics), 0),
    'notResponded', COALESCE((SELECT SUM(not_responded) FROM branch_metrics), 0),
    'totalSubmissions', COALESCE((SELECT SUM(total_submissions) FROM branch_metrics), 0)
  ),
  'branches', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'branchId', branch_id,
      'branchName', branch_name,
      'surveyCount', survey_count,
      'canonicalSurveyCount', canonical_survey_count,
      'expectedAssignments', expected_assignments,
      'completed', completed,
      'incomplete', incomplete,
      'notResponded', not_responded,
      'totalSubmissions', total_submissions,
      'completionRate', CASE WHEN expected_assignments > 0 THEN completed::numeric / expected_assignments ELSE NULL END,
      'lastActivity', last_activity
    ) ORDER BY branch_name, branch_id)
    FROM branch_metrics
  ), '[]'::jsonb),
  'surveys', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'surveyId', metrics.survey_id,
      'branchId', metrics.branch_id,
      'surveyCode', metrics.survey_code,
      'reportingCycleId', metrics.reporting_cycle_id,
      'title', metrics.title,
      'status', metrics.status,
      'surveyDate', metrics.survey_date,
      'questionCount', metrics.question_count,
      'expected', metrics.expected,
      'completed', metrics.completed,
      'incomplete', metrics.incomplete,
      'notResponded', metrics.not_responded,
      'started', metrics.started,
      'completionRate', CASE WHEN metrics.expected > 0 THEN metrics.completed::numeric / metrics.expected ELSE NULL END,
      'participationRate', CASE WHEN metrics.expected > 0 THEN metrics.started::numeric / metrics.expected ELSE NULL END,
      'lastActivity', metrics.last_activity
    ) ORDER BY metrics.branch_id, metrics.survey_code NULLS LAST, metrics.created_at, metrics.survey_id)
    FROM survey_metrics metrics
  ), '[]'::jsonb)
);
$$;

REVOKE ALL ON FUNCTION public.get_survey_management_overview(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_survey_management_overview(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.get_branch_survey_dashboard(
  p_branch_id uuid
) RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
WITH all_surveys AS (
  SELECT survey.*
  FROM public.surveys survey
  WHERE survey.branch_id = p_branch_id
), cycle_candidates AS (
  SELECT
    survey.branch_id,
    survey.reporting_cycle_id,
    MAX(COALESCE(survey.survey_date, (survey.created_at AT TIME ZONE 'UTC')::date)) AS latest_effective_date,
    MAX(survey.created_at) AS latest_created_at,
    MAX(survey.id::text) AS latest_survey_id
  FROM all_surveys survey
  WHERE survey.survey_code IS NOT NULL
    AND survey.reporting_cycle_id IS NOT NULL
  GROUP BY survey.branch_id, survey.reporting_cycle_id
), active_cycles AS (
  SELECT DISTINCT ON (candidate.branch_id)
    candidate.branch_id,
    candidate.reporting_cycle_id
  FROM cycle_candidates candidate
  ORDER BY
    candidate.branch_id,
    candidate.latest_effective_date DESC,
    candidate.latest_created_at DESC,
    candidate.latest_survey_id DESC
), survey_base AS (
  SELECT survey.*
  FROM all_surveys survey
  JOIN active_cycles cycle
    ON cycle.branch_id = survey.branch_id
    AND cycle.reporting_cycle_id = survey.reporting_cycle_id
  WHERE survey.survey_code IS NOT NULL
), question_counts AS (
  SELECT question.survey_id, COUNT(*)::integer AS question_count
  FROM public.survey_questions question
  JOIN survey_base survey ON survey.id = question.survey_id
  WHERE question.required
  GROUP BY question.survey_id
), answer_counts AS (
  SELECT
    response.survey_id,
    response.branch_id,
    response.respondent_type,
    response.respondent_id,
    COUNT(DISTINCT response.question_id) FILTER (WHERE question.required)::integer AS answered_questions,
    MIN(response.updated_at) AS first_activity,
    MAX(response.updated_at) AS last_activity
  FROM public.survey_individual_responses response
  JOIN survey_base survey ON survey.id = response.survey_id
  JOIN public.survey_questions question
    ON question.id = response.question_id AND question.survey_id = response.survey_id
  GROUP BY response.survey_id, response.branch_id, response.respondent_type, response.respondent_id
), assignment_status AS (
  SELECT
    respondent.id AS assignment_id,
    respondent.survey_id,
    survey.survey_code,
    respondent.branch_id,
    respondent.respondent_type,
    respondent.respondent_id,
    respondent.respondent_name,
    respondent.respondent_detail,
    COALESCE(answers.answered_questions, 0) AS answered_questions,
    COALESCE(questions.question_count, 0) AS question_count,
    COALESCE(respondent.response_started_at, answers.first_activity) AS first_activity,
    GREATEST(respondent.last_activity_at, answers.last_activity) AS last_activity,
    respondent.completed_at,
    respondent.completion_source,
    respondent.activity_source,
    CASE
      WHEN respondent.completed_at IS NOT NULL
        AND COALESCE(questions.question_count, 0) > 0
        AND COALESCE(answers.answered_questions, 0) >= questions.question_count
        THEN 'completed'
      WHEN respondent.response_started_at IS NOT NULL OR COALESCE(answers.answered_questions, 0) > 0
        THEN 'incomplete'
      ELSE 'not_responded'
    END AS response_status
  FROM public.survey_respondents respondent
  JOIN survey_base survey ON survey.id = respondent.survey_id
  LEFT JOIN question_counts questions ON questions.survey_id = respondent.survey_id
  LEFT JOIN answer_counts answers
    ON answers.survey_id = respondent.survey_id
    AND answers.branch_id = respondent.branch_id
    AND answers.respondent_type = respondent.respondent_type
    AND answers.respondent_id = respondent.respondent_id
), survey_metrics AS (
  SELECT
    survey.id AS survey_id,
    survey.survey_code,
    survey.reporting_cycle_id,
    survey.title,
    survey.description,
    survey.status,
    survey.survey_date,
    survey.created_at,
    COALESCE(questions.question_count, 0) AS question_count,
    COUNT(status.assignment_id)::integer AS expected,
    COUNT(status.assignment_id) FILTER (WHERE status.response_status = 'completed')::integer AS completed,
    COUNT(status.assignment_id) FILTER (WHERE status.response_status = 'incomplete')::integer AS incomplete,
    COUNT(status.assignment_id) FILTER (WHERE status.response_status = 'not_responded')::integer AS not_responded,
    COUNT(status.assignment_id) FILTER (WHERE status.response_status <> 'not_responded')::integer AS started,
    MAX(status.last_activity) AS last_activity
  FROM survey_base survey
  LEFT JOIN question_counts questions ON questions.survey_id = survey.id
  LEFT JOIN assignment_status status ON status.survey_id = survey.id
  GROUP BY
    survey.id,
    survey.survey_code,
    survey.reporting_cycle_id,
    survey.title,
    survey.description,
    survey.status,
    survey.survey_date,
    survey.created_at,
    questions.question_count
), source_presence AS (
  SELECT
    survey.id AS survey_id,
    EXISTS (
      SELECT 1
      FROM public.survey_individual_responses response
      WHERE response.survey_id = survey.id AND response.branch_id = p_branch_id
    ) AS has_individual,
    EXISTS (
      SELECT 1
      FROM public.survey_branch_responses response
      WHERE response.survey_id = survey.id
        AND response.branch_id = p_branch_id
        AND response.count > 0
    ) AS has_aggregate,
    submission.total_respondents AS aggregate_respondent_total
  FROM survey_base survey
  LEFT JOIN public.survey_branch_submissions submission
    ON submission.survey_id = survey.id AND submission.branch_id = p_branch_id
), question_metrics AS (
  SELECT
    question.id AS question_id,
    question.survey_id,
    survey.survey_code,
    question.section_id,
    section.title AS section_title,
    question.question_text,
    question.question_type,
    question.sentiment_enabled,
    question.order_index,
    question.required,
    COALESCE(questions.question_count, 0) AS survey_question_count,
    COALESCE(survey_status.expected, 0) AS named_expected,
    presence.aggregate_respondent_total,
    COALESCE((
      SELECT COUNT(DISTINCT (response.respondent_type, response.respondent_id))::integer
      FROM public.survey_individual_responses response
      WHERE response.survey_id = question.survey_id
        AND response.branch_id = p_branch_id
        AND response.question_id = question.id
    ), 0) AS named_answer_count,
    COALESCE((
      SELECT SUM(response.count)::integer
      FROM public.survey_branch_responses response
      WHERE response.survey_id = question.survey_id
        AND response.branch_id = p_branch_id
        AND response.question_id = question.id
        AND response.count > 0
    ), 0) AS aggregate_answer_count,
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'optionId', option.id,
        'label', option.label,
        'sentiment', option.sentiment,
        'count', (
          SELECT COUNT(*)::integer
          FROM public.survey_individual_responses response
          WHERE response.survey_id = question.survey_id
            AND response.branch_id = p_branch_id
            AND response.question_id = question.id
            AND response.option_id = option.id
        )
      ) ORDER BY option.order_index, option.id)
      FROM public.survey_response_options option
      WHERE option.survey_id = question.survey_id
        AND (
          option.question_id = question.id
          OR (
            option.question_id IS NULL
            AND NOT EXISTS (
              SELECT 1
              FROM public.survey_response_options scoped_option
              WHERE scoped_option.survey_id = question.survey_id
                AND scoped_option.question_id = question.id
            )
          )
        )
    ), '[]'::jsonb) AS named_options,
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'optionId', option.id,
        'label', option.label,
        'sentiment', option.sentiment,
        'count', COALESCE((
          SELECT SUM(response.count)::integer
          FROM public.survey_branch_responses response
          WHERE response.survey_id = question.survey_id
            AND response.branch_id = p_branch_id
            AND response.question_id = question.id
            AND response.option_id = option.id
            AND response.count > 0
        ), 0)
      ) ORDER BY option.order_index, option.id)
      FROM public.survey_response_options option
      WHERE option.survey_id = question.survey_id
        AND (
          option.question_id = question.id
          OR (
            option.question_id IS NULL
            AND NOT EXISTS (
              SELECT 1
              FROM public.survey_response_options scoped_option
              WHERE scoped_option.survey_id = question.survey_id
                AND scoped_option.question_id = question.id
            )
          )
        )
    ), '[]'::jsonb) AS aggregate_options,
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'respondentType', response.respondent_type,
        'respondentId', response.respondent_id,
        'respondentName', response.respondent_name,
        'answer', response.text_answer,
        'updatedAt', response.updated_at
      ) ORDER BY response.updated_at, response.id)
      FROM public.survey_individual_responses response
      WHERE response.survey_id = question.survey_id
        AND response.branch_id = p_branch_id
        AND response.question_id = question.id
        AND NULLIF(btrim(response.text_answer), '') IS NOT NULL
    ), '[]'::jsonb) AS text_responses,
    CASE
      WHEN presence.has_individual AND presence.has_aggregate THEN 'mixed'
      WHEN presence.has_individual THEN 'named'
      WHEN presence.has_aggregate THEN 'aggregate'
      ELSE 'none'
    END AS response_base
  FROM public.survey_questions question
  JOIN survey_base survey ON survey.id = question.survey_id
  LEFT JOIN public.survey_sections section ON section.id = question.section_id
  LEFT JOIN question_counts questions ON questions.survey_id = question.survey_id
  LEFT JOIN survey_metrics survey_status ON survey_status.survey_id = question.survey_id
  LEFT JOIN source_presence presence ON presence.survey_id = question.survey_id
)
SELECT jsonb_build_object(
  'branch', COALESCE((
    SELECT jsonb_build_object('id', branch.id, 'name', btrim(branch.name))
    FROM public.branches branch
    WHERE branch.id = p_branch_id
  ), '{}'::jsonb),
  'surveys', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'surveyId', metrics.survey_id,
      'surveyCode', metrics.survey_code,
      'reportingCycleId', metrics.reporting_cycle_id,
      'title', metrics.title,
      'description', metrics.description,
      'status', metrics.status,
      'surveyDate', metrics.survey_date,
      'questionCount', metrics.question_count,
      'expected', metrics.expected,
      'completed', metrics.completed,
      'incomplete', metrics.incomplete,
      'notResponded', metrics.not_responded,
      'started', metrics.started,
      'completionRate', CASE WHEN metrics.expected > 0 THEN metrics.completed::numeric / metrics.expected ELSE NULL END,
      'participationRate', CASE WHEN metrics.expected > 0 THEN metrics.started::numeric / metrics.expected ELSE NULL END,
      'lastActivity', metrics.last_activity
    ) ORDER BY metrics.survey_code NULLS LAST, metrics.created_at, metrics.survey_id)
    FROM survey_metrics metrics
  ), '[]'::jsonb),
  'respondents', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'assignmentId', status.assignment_id,
      'surveyId', status.survey_id,
      'surveyCode', status.survey_code,
      'branchId', status.branch_id,
      'respondentType', status.respondent_type,
      'respondentId', status.respondent_id,
      'respondentName', status.respondent_name,
      'respondentDetail', status.respondent_detail,
      'responseStatus', status.response_status,
      'answeredQuestions', status.answered_questions,
      'questionCount', status.question_count,
      'progress', CASE WHEN status.question_count > 0 THEN status.answered_questions::numeric / status.question_count ELSE 0 END,
      'firstActivity', status.first_activity,
      'lastActivity', status.last_activity,
      'completedAt', status.completed_at,
      'completionSource', status.completion_source,
      'activitySource', status.activity_source
    ) ORDER BY lower(status.respondent_name), status.respondent_type, status.respondent_id, status.survey_code NULLS LAST)
    FROM assignment_status status
  ), '[]'::jsonb),
  'questions', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'questionId', metrics.question_id,
      'surveyId', metrics.survey_id,
      'surveyCode', metrics.survey_code,
      'sectionId', metrics.section_id,
      'sectionTitle', metrics.section_title,
      'question', metrics.question_text,
      'questionType', metrics.question_type,
      'sentimentEnabled', metrics.sentiment_enabled,
      'required', metrics.required,
      'orderIndex', metrics.order_index,
      'expected', metrics.named_expected,
      'answerCount', CASE metrics.response_base
        WHEN 'named' THEN metrics.named_answer_count
        WHEN 'aggregate' THEN metrics.aggregate_answer_count
        WHEN 'none' THEN 0
        ELSE NULL
      END,
      'skippedCount', CASE
        WHEN metrics.response_base = 'named' AND metrics.named_expected > 0
          THEN GREATEST(metrics.named_expected - metrics.named_answer_count, 0)
        WHEN metrics.response_base = 'aggregate'
          AND metrics.aggregate_respondent_total IS NOT NULL
          AND metrics.question_type NOT IN ('checkboxes', 'checkbox_grid', 'multiple_choice_grid')
          THEN GREATEST(metrics.aggregate_respondent_total - metrics.aggregate_answer_count, 0)
        WHEN metrics.response_base = 'none' AND metrics.named_expected > 0
          THEN metrics.named_expected
        ELSE NULL
      END,
      'responseBase', metrics.response_base,
      'denominatorKnown', CASE
        WHEN metrics.response_base = 'named' THEN metrics.named_expected > 0
        WHEN metrics.response_base = 'aggregate' THEN metrics.aggregate_respondent_total IS NOT NULL
          AND metrics.question_type NOT IN ('checkboxes', 'checkbox_grid', 'multiple_choice_grid')
        WHEN metrics.response_base = 'none' THEN metrics.named_expected > 0
        ELSE false
      END,
      'namedAnswerCount', metrics.named_answer_count,
      'aggregateAnswerCount', metrics.aggregate_answer_count,
      'aggregateRespondentTotal', metrics.aggregate_respondent_total,
      'options', CASE metrics.response_base
        WHEN 'named' THEN metrics.named_options
        WHEN 'aggregate' THEN metrics.aggregate_options
        ELSE '[]'::jsonb
      END,
      'namedOptions', metrics.named_options,
      'aggregateOptions', metrics.aggregate_options,
      'textResponses', metrics.text_responses
    ) ORDER BY metrics.survey_code NULLS LAST, metrics.survey_id, metrics.order_index, metrics.question_id)
    FROM question_metrics metrics
  ), '[]'::jsonb),
  'dataQuality', jsonb_build_object(
    'additionalSurveys', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'surveyId', survey.id,
        'title', survey.title,
        'surveyCode', survey.survey_code,
        'reportingCycleId', survey.reporting_cycle_id,
        'exclusionReason', CASE
          WHEN survey.survey_code IS NULL THEN 'uncoded'
          WHEN survey.reporting_cycle_id IS NULL THEN 'missing_cycle'
          ELSE 'inactive_cycle'
        END
      ) ORDER BY survey.created_at, survey.id)
      FROM all_surveys survey
      WHERE survey.survey_code IS NULL
        OR survey.reporting_cycle_id IS NULL
        OR NOT EXISTS (
          SELECT 1
          FROM active_cycles cycle
          WHERE cycle.branch_id = survey.branch_id
            AND cycle.reporting_cycle_id = survey.reporting_cycle_id
        )
    ), '[]'::jsonb),
    'duplicateSurveyCodes', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('surveyCode', duplicate.survey_code, 'count', duplicate.survey_count) ORDER BY duplicate.survey_code)
      FROM (
        SELECT survey_code, COUNT(*)::integer AS survey_count
        FROM survey_base
        WHERE survey_code IS NOT NULL
        GROUP BY survey_code
        HAVING COUNT(*) > 1
      ) duplicate
    ), '[]'::jsonb),
    'titleBranchMismatches', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'surveyId', mismatch.survey_id,
        'surveyCode', mismatch.survey_code,
        'title', mismatch.title,
        'referencedBranch', mismatch.referenced_branch
      ) ORDER BY mismatch.survey_code NULLS LAST, mismatch.title, mismatch.referenced_branch)
      FROM (
        SELECT DISTINCT
          survey.id AS survey_id,
          survey.survey_code,
          survey.title,
          btrim(other_branch.name) AS referenced_branch
        FROM survey_base survey
        JOIN public.branches other_branch
          ON other_branch.id <> p_branch_id
          AND length(btrim(other_branch.name)) >= 4
          AND position(lower(btrim(other_branch.name)) IN lower(survey.title)) > 0
      ) mismatch
    ), '[]'::jsonb),
    'orphanedRegisteredAssignments', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'assignmentId', respondent.id,
        'surveyId', respondent.survey_id,
        'surveyCode', survey.survey_code,
        'respondentType', respondent.respondent_type,
        'respondentId', respondent.respondent_id,
        'respondentName', respondent.respondent_name
      ) ORDER BY survey.survey_code NULLS LAST, lower(respondent.respondent_name), respondent.id)
      FROM public.survey_respondents respondent
      JOIN survey_base survey ON survey.id = respondent.survey_id
      WHERE (
        respondent.respondent_type = 'student'
        AND NOT EXISTS (SELECT 1 FROM public.students student WHERE student.id = respondent.respondent_id)
      ) OR (
        respondent.respondent_type = 'staff'
        AND NOT EXISTS (SELECT 1 FROM public.staff staff WHERE staff.id = respondent.respondent_id)
      )
    ), '[]'::jsonb),
    'mixedResponseSources', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'surveyId', survey.id,
        'surveyCode', survey.survey_code,
        'title', survey.title,
        'namedAnswerRows', (
          SELECT COUNT(*)::integer
          FROM public.survey_individual_responses response
          WHERE response.survey_id = survey.id AND response.branch_id = p_branch_id
        ),
        'positiveAggregateCells', (
          SELECT COUNT(*)::integer
          FROM public.survey_branch_responses response
          WHERE response.survey_id = survey.id
            AND response.branch_id = p_branch_id
            AND response.count > 0
        ),
        'aggregateRespondentTotal', (
          SELECT submission.total_respondents
          FROM public.survey_branch_submissions submission
          WHERE submission.survey_id = survey.id AND submission.branch_id = p_branch_id
        )
      ) ORDER BY survey.survey_code NULLS LAST, survey.created_at, survey.id)
      FROM survey_base survey
      WHERE EXISTS (
        SELECT 1
        FROM public.survey_individual_responses response
        WHERE response.survey_id = survey.id AND response.branch_id = p_branch_id
      )
      AND EXISTS (
        SELECT 1
        FROM public.survey_branch_responses response
        WHERE response.survey_id = survey.id
          AND response.branch_id = p_branch_id
          AND response.count > 0
      )
    ), '[]'::jsonb),
    'historicalCompletionRule', 'Historical completion is inferred when every currently required question has a saved answer. Historical first activity is inferred from current rows and may reflect a later rewrite.',
    'manualIdentityRule', 'Manual respondent IDs remain separate; exact and fuzzy name similarities are review candidates only and are never merged automatically.'
  )
);
$$;

REVOKE ALL ON FUNCTION public.get_branch_survey_dashboard(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_branch_survey_dashboard(uuid) TO service_role;

-- Pure-source branches retain the legacy selected-count shape. Mixed branches
-- return both source arrays separately and intentionally have no selected
-- question counts until a human resolves the source conflict.
CREATE OR REPLACE FUNCTION public.get_survey_results_fast(p_survey_id uuid)
RETURNS jsonb
SECURITY INVOKER
SET search_path = ''
LANGUAGE plpgsql
AS $$
DECLARE
  v_branches jsonb;
  v_question_counts jsonb;
  v_individual_question_counts jsonb;
  v_aggregate_question_counts jsonb;
BEGIN
  WITH relevant_branches AS (
    SELECT survey.branch_id
    FROM public.surveys survey
    WHERE survey.id = p_survey_id AND survey.branch_id IS NOT NULL
    UNION
    SELECT respondent.branch_id FROM public.survey_respondents respondent WHERE respondent.survey_id = p_survey_id
    UNION
    SELECT response.branch_id FROM public.survey_individual_responses response WHERE response.survey_id = p_survey_id
    UNION
    SELECT response.branch_id FROM public.survey_branch_responses response WHERE response.survey_id = p_survey_id
    UNION
    SELECT submission.branch_id FROM public.survey_branch_submissions submission WHERE submission.survey_id = p_survey_id
  ), individual_summary AS (
    SELECT
      branch_id,
      COUNT(DISTINCT (respondent_type, respondent_id))::integer AS respondent_count,
      COUNT(*)::integer AS answer_count
    FROM public.survey_individual_responses
    WHERE survey_id = p_survey_id
    GROUP BY branch_id
  ), aggregate_summary AS (
    SELECT
      branch_id,
      COUNT(*) > 0 AS has_rows,
      BOOL_OR(count > 0) AS has_positive_answers
    FROM public.survey_branch_responses
    WHERE survey_id = p_survey_id
    GROUP BY branch_id
  ), source_modes AS (
    SELECT
      relevant.branch_id,
      CASE
        WHEN COALESCE(individual.answer_count, 0) > 0 AND COALESCE(aggregate.has_positive_answers, false) THEN 'mixed'
        WHEN COALESCE(individual.answer_count, 0) > 0 THEN 'individual'
        WHEN COALESCE(aggregate.has_positive_answers, false) THEN 'aggregate'
        WHEN COALESCE(aggregate.has_rows, false) OR submission.survey_id IS NOT NULL THEN 'aggregate_empty'
        ELSE 'none'
      END AS response_mode,
      COALESCE(individual.respondent_count, 0) AS respondent_count,
      COALESCE(individual.answer_count, 0) AS individual_answer_count,
      submission.total_respondents AS aggregate_respondent_total
    FROM relevant_branches relevant
    LEFT JOIN individual_summary individual ON individual.branch_id = relevant.branch_id
    LEFT JOIN aggregate_summary aggregate ON aggregate.branch_id = relevant.branch_id
    LEFT JOIN public.survey_branch_submissions submission
      ON submission.survey_id = p_survey_id AND submission.branch_id = relevant.branch_id
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'branchId', branch.id,
    'branchName', branch.name,
    'totalRespondents', CASE
      WHEN source.response_mode IN ('individual', 'mixed') THEN source.respondent_count
      ELSE COALESCE(source.aggregate_respondent_total, 0)
    END,
    'namedRespondentTotal', source.respondent_count,
    'aggregateRespondentTotal', source.aggregate_respondent_total,
    'individualAnswerCount', source.individual_answer_count,
    'submitted', source.response_mode <> 'none',
    'hasAggregateAnswers', source.response_mode IN ('aggregate', 'mixed'),
    'responseMode', source.response_mode
  ) ORDER BY branch.name, branch.id), '[]'::jsonb)
  INTO v_branches
  FROM source_modes source
  JOIN public.branches branch ON branch.id = source.branch_id;

  WITH individual_counts AS (
    SELECT branch_id, question_id, option_id, COUNT(*)::integer AS count
    FROM public.survey_individual_responses
    WHERE survey_id = p_survey_id AND option_id IS NOT NULL
    GROUP BY branch_id, question_id, option_id
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'branchId', branch_id,
    'questionId', question_id,
    'optionId', option_id,
    'count', count
  ) ORDER BY branch_id, question_id, option_id), '[]'::jsonb)
  INTO v_individual_question_counts
  FROM individual_counts;

  WITH aggregate_counts AS (
    SELECT response.branch_id, response.question_id, response.option_id, response.count
    FROM public.survey_branch_responses response
    WHERE response.survey_id = p_survey_id
      AND response.count > 0
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'branchId', branch_id,
    'questionId', question_id,
    'optionId', option_id,
    'count', count
  ) ORDER BY branch_id, question_id, option_id), '[]'::jsonb)
  INTO v_aggregate_question_counts
  FROM aggregate_counts;

  WITH mode_by_branch AS (
    SELECT
      branch.id AS branch_id,
      CASE
        WHEN EXISTS (
          SELECT 1 FROM public.survey_individual_responses response
          WHERE response.survey_id = p_survey_id AND response.branch_id = branch.id
        ) AND EXISTS (
          SELECT 1 FROM public.survey_branch_responses response
          WHERE response.survey_id = p_survey_id AND response.branch_id = branch.id AND response.count > 0
        ) THEN 'mixed'
        WHEN EXISTS (
          SELECT 1 FROM public.survey_individual_responses response
          WHERE response.survey_id = p_survey_id AND response.branch_id = branch.id
        ) THEN 'individual'
        WHEN EXISTS (
          SELECT 1 FROM public.survey_branch_responses response
          WHERE response.survey_id = p_survey_id AND response.branch_id = branch.id AND response.count > 0
        ) THEN 'aggregate'
        ELSE 'none'
      END AS response_mode
    FROM public.branches branch
  ), selected_counts AS (
    SELECT
      (count_row->>'branchId')::uuid AS branch_id,
      (count_row->>'questionId')::uuid AS question_id,
      (count_row->>'optionId')::uuid AS option_id,
      (count_row->>'count')::integer AS count
    FROM jsonb_array_elements(v_individual_question_counts) count_row
    JOIN mode_by_branch mode ON mode.branch_id = (count_row->>'branchId')::uuid
    WHERE mode.response_mode = 'individual'
    UNION ALL
    SELECT
      (count_row->>'branchId')::uuid,
      (count_row->>'questionId')::uuid,
      (count_row->>'optionId')::uuid,
      (count_row->>'count')::integer
    FROM jsonb_array_elements(v_aggregate_question_counts) count_row
    JOIN mode_by_branch mode ON mode.branch_id = (count_row->>'branchId')::uuid
    WHERE mode.response_mode = 'aggregate'
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'branchId', branch_id,
    'questionId', question_id,
    'optionId', option_id,
    'count', count
  ) ORDER BY branch_id, question_id, option_id), '[]'::jsonb)
  INTO v_question_counts
  FROM selected_counts;

  RETURN jsonb_build_object(
    'branches', v_branches,
    'questionCounts', v_question_counts,
    'individualQuestionCounts', v_individual_question_counts,
    'aggregateQuestionCounts', v_aggregate_question_counts
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_survey_results_fast(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_survey_results_fast(uuid) TO service_role;

-- Keep structure replacement aligned with the analytics metadata introduced by
-- this migration. The signature stays unchanged so existing callers continue to
-- work; omitted metadata retains its current value and omitted required flags
-- default to true.
CREATE OR REPLACE FUNCTION public.replace_survey_structure_atomic(
  p_survey_id uuid,
  p_fields jsonb,
  p_sections jsonb,
  p_questions jsonb,
  p_options jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM 1
  FROM public.surveys
  WHERE id = p_survey_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Survey not found';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.survey_branch_responses WHERE survey_id = p_survey_id
  ) OR EXISTS (
    SELECT 1 FROM public.survey_individual_responses WHERE survey_id = p_survey_id
  ) OR EXISTS (
    SELECT 1 FROM public.survey_branch_submissions WHERE survey_id = p_survey_id
  ) THEN
    RAISE EXCEPTION 'Survey questions cannot change after responses are recorded';
  END IF;

  IF jsonb_typeof(p_fields) IS DISTINCT FROM 'object'
    OR jsonb_typeof(p_sections) IS DISTINCT FROM 'array'
    OR jsonb_typeof(p_questions) IS DISTINCT FROM 'array'
    OR jsonb_typeof(p_options) IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_questions) = 0
  THEN
    RAISE EXCEPTION 'Invalid survey structure';
  END IF;

  DELETE FROM public.survey_response_options WHERE survey_id = p_survey_id;
  DELETE FROM public.survey_questions WHERE survey_id = p_survey_id;
  DELETE FROM public.survey_sections WHERE survey_id = p_survey_id;

  INSERT INTO public.survey_sections(
    id,
    survey_id,
    title,
    description,
    order_index
  )
  SELECT
    section.id,
    p_survey_id,
    section.title,
    section.description,
    section.order_index
  FROM jsonb_to_recordset(p_sections) AS section(
    id uuid,
    title text,
    description text,
    order_index integer
  );

  INSERT INTO public.survey_questions(
    id,
    survey_id,
    section_id,
    question_text,
    question_type,
    sentiment_enabled,
    required,
    order_index
  )
  SELECT
    question.id,
    p_survey_id,
    question.section_id,
    question.question_text,
    question.question_type,
    question.sentiment_enabled,
    COALESCE(question.required, true),
    question.order_index
  FROM jsonb_to_recordset(p_questions) AS question(
    id uuid,
    section_id uuid,
    question_text text,
    question_type text,
    sentiment_enabled boolean,
    required boolean,
    order_index integer
  );

  INSERT INTO public.survey_response_options(
    survey_id,
    question_id,
    label,
    sentiment,
    order_index
  )
  SELECT
    p_survey_id,
    option.question_id,
    option.label,
    option.sentiment,
    option.order_index
  FROM jsonb_to_recordset(p_options) AS option(
    question_id uuid,
    label text,
    sentiment text,
    order_index integer
  );

  UPDATE public.surveys
  SET
    title = CASE WHEN p_fields ? 'title' THEN p_fields->>'title' ELSE title END,
    description = CASE WHEN p_fields ? 'description' THEN NULLIF(p_fields->>'description', '') ELSE description END,
    period = CASE WHEN p_fields ? 'period' THEN NULLIF(p_fields->>'period', '') ELSE period END,
    survey_date = CASE WHEN p_fields ? 'survey_date' THEN NULLIF(p_fields->>'survey_date', '')::date ELSE survey_date END,
    status = CASE WHEN p_fields ? 'status' THEN p_fields->>'status' ELSE status END,
    language = CASE WHEN p_fields ? 'language' THEN p_fields->>'language' ELSE language END,
    survey_code = CASE
      WHEN p_fields ? 'survey_code' THEN NULLIF(upper(btrim(p_fields->>'survey_code')), '')
      ELSE survey_code
    END,
    reporting_cycle_id = CASE
      WHEN p_fields ? 'reporting_cycle_id' THEN NULLIF(p_fields->>'reporting_cycle_id', '')::uuid
      ELSE reporting_cycle_id
    END,
    updated_at = now()
  WHERE id = p_survey_id;
END;
$$;

REVOKE ALL ON FUNCTION public.replace_survey_structure_atomic(
  uuid, jsonb, jsonb, jsonb, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.replace_survey_structure_atomic(
  uuid, jsonb, jsonb, jsonb, jsonb
) TO service_role;

NOTIFY pgrst, 'reload schema';

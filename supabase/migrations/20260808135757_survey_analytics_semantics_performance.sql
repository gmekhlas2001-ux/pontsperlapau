-- Follow-up corrections for survey analytics semantics and hot-path cost.
--
-- This migration preserves all existing response rows. The
-- respondent activity columns were backfilled by the preceding migration and
-- are maintained by atomic saves, so management totals no longer need to scan
-- the individual-answer table.

-- Every aggregate option cell represents at most the reported respondents.
-- Multi-select questions may have several selected options per person, so only
-- single-select question sums are bounded by the respondent total.
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
    SELECT 1
    FROM jsonb_to_recordset(p_counts) AS count_row(question_id uuid, option_id uuid, count integer)
    WHERE count_row.count > p_total_respondents
  ) THEN
    RAISE EXCEPTION 'An option count cannot exceed the respondent total';
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
    RAISE EXCEPTION 'Single-select question totals cannot exceed the respondent total';
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

COMMENT ON FUNCTION public.save_survey_aggregate_atomic(uuid, uuid, integer, uuid, jsonb) IS
  'Atomically saves aggregate survey counts. Each option is bounded by the reported respondent total; only single-select question sums share that bound.';

REVOKE ALL ON FUNCTION public.save_survey_aggregate_atomic(
  uuid, uuid, integer, uuid, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_survey_aggregate_atomic(
  uuid, uuid, integer, uuid, jsonb
) TO service_role;

-- Preserve the existing active-cycle selection and JSON contract while using
-- the backfilled, transactionally maintained assignment activity metadata.
-- This removes the large survey_individual_responses scan from the overview.
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
), assignment_status AS (
  SELECT
    respondent.id AS assignment_id,
    respondent.survey_id,
    CASE
      WHEN respondent.completed_at IS NOT NULL THEN 'completed'
      WHEN respondent.response_started_at IS NOT NULL OR respondent.last_activity_at IS NOT NULL THEN 'incomplete'
      ELSE 'not_responded'
    END AS response_status,
    COALESCE(
      respondent.last_activity_at,
      respondent.completed_at,
      respondent.response_started_at
    ) AS last_activity
  FROM public.survey_respondents respondent
  JOIN survey_base survey ON survey.id = respondent.survey_id
    AND survey.branch_id = respondent.branch_id
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

COMMENT ON FUNCTION public.get_survey_management_overview(uuid) IS
  'Returns active-cycle survey management totals from maintained respondent activity metadata without scanning individual answer rows.';

REVOKE ALL ON FUNCTION public.get_survey_management_overview(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_survey_management_overview(uuid) TO service_role;

-- Branch drill-down keeps named and aggregate sources separate. Named skips
-- are respondents who started the survey but did not answer that question;
-- people who never started are reported independently. Aggregate multi-select
-- totals remain raw selection counts and use the submitted respondent total as
-- the per-option percentage denominator.
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
    COALESCE(survey_status.started, 0) AS named_started,
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
      'started', CASE
        WHEN metrics.response_base = 'aggregate' THEN NULL
        ELSE metrics.named_started
      END,
      'notStartedCount', CASE
        WHEN metrics.response_base = 'aggregate' THEN NULL
        ELSE GREATEST(metrics.named_expected - metrics.named_started, 0)
      END,
      'answerCount', CASE metrics.response_base
        WHEN 'named' THEN metrics.named_answer_count
        WHEN 'aggregate' THEN CASE
          WHEN metrics.question_type IN ('checkboxes', 'checkbox_grid', 'multiple_choice_grid') THEN NULL
          ELSE metrics.aggregate_answer_count
        END
        WHEN 'none' THEN 0
        ELSE NULL
      END,
      'skippedCount', CASE
        WHEN metrics.response_base IN ('named', 'mixed', 'none')
          THEN GREATEST(metrics.named_started - metrics.named_answer_count, 0)
        WHEN metrics.response_base = 'aggregate'
          AND metrics.aggregate_respondent_total IS NOT NULL
          AND metrics.question_type NOT IN ('checkboxes', 'checkbox_grid', 'multiple_choice_grid')
          THEN GREATEST(metrics.aggregate_respondent_total - metrics.aggregate_answer_count, 0)
        ELSE NULL
      END,
      'responseBase', metrics.response_base,
      'denominatorKnown', CASE
        WHEN metrics.response_base = 'named' THEN metrics.named_expected > 0
        WHEN metrics.response_base = 'aggregate' THEN metrics.aggregate_respondent_total IS NOT NULL
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
        'invalidAggregateCellCount', (
          SELECT COUNT(*)::integer
          FROM public.survey_branch_responses response
          JOIN public.survey_branch_submissions submission
            ON submission.survey_id = response.survey_id
            AND submission.branch_id = response.branch_id
          WHERE response.survey_id = survey.id
            AND response.branch_id = p_branch_id
            AND response.count > 0
            AND response.count > submission.total_respondents
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

COMMENT ON FUNCTION public.get_branch_survey_dashboard(uuid) IS
  'Returns active-cycle branch analytics with separate named-started, named-skipped, not-started, and aggregate selection semantics plus mixed-source anomaly counts.';

REVOKE ALL ON FUNCTION public.get_branch_survey_dashboard(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_branch_survey_dashboard(uuid) TO service_role;

NOTIFY pgrst, 'reload schema';

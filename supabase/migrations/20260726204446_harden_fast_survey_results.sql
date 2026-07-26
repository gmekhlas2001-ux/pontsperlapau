CREATE OR REPLACE FUNCTION public.get_survey_results_fast(p_survey_id uuid)
RETURNS jsonb
SECURITY INVOKER
SET search_path = ''
LANGUAGE plpgsql
AS $$
DECLARE
  v_branches jsonb;
  v_question_counts jsonb;
BEGIN
  WITH individual_summary AS (
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
      BOOL_OR(count > 0) AS has_answers
    FROM public.survey_branch_responses
    WHERE survey_id = p_survey_id
    GROUP BY branch_id
  ), active_branches AS (
    SELECT branch_id
    FROM aggregate_summary
    WHERE has_answers

    UNION

    SELECT branch_id
    FROM individual_summary
    WHERE answer_count > 0
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'branchId', b.id,
    'branchName', b.name,
    'totalRespondents', GREATEST(
      CASE WHEN COALESCE(a.has_answers, false) THEN COALESCE(sbs.total_respondents, 0) ELSE 0 END,
      COALESCE(i.respondent_count, 0)
    ),
    'individualAnswerCount', COALESCE(i.answer_count, 0),
    'submitted', COALESCE(a.has_answers, false) OR COALESCE(i.answer_count, 0) > 0,
    'hasAggregateAnswers', COALESCE(a.has_answers, false)
  ) ORDER BY b.name, b.id), '[]'::jsonb)
  INTO v_branches
  FROM active_branches active
  JOIN public.branches b ON b.id = active.branch_id AND b.status = 'active'
  LEFT JOIN public.survey_branch_submissions sbs
    ON sbs.branch_id = b.id AND sbs.survey_id = p_survey_id
  LEFT JOIN individual_summary i ON i.branch_id = b.id
  LEFT JOIN aggregate_summary a ON a.branch_id = b.id;

  WITH aggregate_counts AS (
    SELECT branch_id, question_id, option_id, count
    FROM public.survey_branch_responses
    WHERE survey_id = p_survey_id
  ), individual_counts AS (
    SELECT branch_id, question_id, option_id, COUNT(*)::integer AS count
    FROM public.survey_individual_responses
    WHERE survey_id = p_survey_id AND option_id IS NOT NULL
    GROUP BY branch_id, question_id, option_id
  ), combined_counts AS (
    SELECT branch_id, question_id, option_id, count
    FROM aggregate_counts

    UNION ALL

    SELECT i.branch_id, i.question_id, i.option_id, i.count
    FROM individual_counts i
    WHERE NOT EXISTS (
      SELECT 1
      FROM aggregate_counts a
      WHERE a.branch_id = i.branch_id
        AND a.question_id = i.question_id
        AND a.option_id = i.option_id
    )
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'branchId', branch_id,
    'questionId', question_id,
    'optionId', option_id,
    'count', count
  ) ORDER BY branch_id, question_id, option_id), '[]'::jsonb)
  INTO v_question_counts
  FROM combined_counts;

  RETURN jsonb_build_object(
    'branches', v_branches,
    'questionCounts', v_question_counts
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_branch_submission_fast(p_survey_id uuid, p_branch_id uuid)
RETURNS jsonb
SECURITY INVOKER
SET search_path = ''
LANGUAGE plpgsql
AS $$
DECLARE
  v_submission jsonb;
  v_responses jsonb;
  v_individual_responses jsonb;
  v_total_respondents integer;
  v_distinct_individuals integer;
BEGIN
  SELECT to_jsonb(sbs.*) INTO v_submission
  FROM public.survey_branch_submissions sbs
  WHERE survey_id = p_survey_id AND branch_id = p_branch_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'question_id', question_id,
    'option_id', option_id,
    'count', count
  ) ORDER BY question_id, option_id), '[]'::jsonb)
  INTO v_responses
  FROM public.survey_branch_responses
  WHERE survey_id = p_survey_id AND branch_id = p_branch_id;

  SELECT COALESCE(jsonb_agg(to_jsonb(sir.*) ORDER BY sir.id), '[]'::jsonb)
  INTO v_individual_responses
  FROM public.survey_individual_responses sir
  WHERE survey_id = p_survey_id AND branch_id = p_branch_id;

  SELECT COUNT(DISTINCT (respondent_type, respondent_id))::integer
  INTO v_distinct_individuals
  FROM public.survey_individual_responses
  WHERE survey_id = p_survey_id AND branch_id = p_branch_id;

  v_total_respondents := GREATEST(
    COALESCE((v_submission->>'total_respondents')::integer, 0),
    v_distinct_individuals
  );

  RETURN jsonb_build_object(
    'submission', v_submission,
    'responses', v_responses,
    'individualResponses', v_individual_responses,
    'totalRespondents', v_total_respondents
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_survey_results_fast(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_branch_submission_fast(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_survey_results_fast(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_branch_submission_fast(uuid, uuid) TO service_role;

NOTIFY pgrst, 'reload schema';

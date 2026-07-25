CREATE OR REPLACE FUNCTION public.get_survey_results_fast(p_survey_id uuid)
RETURNS jsonb
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
LANGUAGE plpgsql
AS $$
DECLARE
  v_branches jsonb;
  v_question_counts jsonb;
BEGIN
  -- branches
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'branchId', b.id,
    'branchName', b.name,
    'totalRespondents', GREATEST(
      COALESCE(sbs.total_respondents, 0),
      (SELECT count(DISTINCT respondent_id) FROM survey_individual_responses WHERE survey_id = p_survey_id AND branch_id = b.id)
    ),
    'submitted', (
      EXISTS(SELECT 1 FROM survey_branch_responses WHERE survey_id = p_survey_id AND branch_id = b.id AND count > 0)
      OR EXISTS(SELECT 1 FROM survey_individual_responses WHERE survey_id = p_survey_id AND branch_id = b.id)
    ),
    'hasAggregateAnswers', EXISTS(SELECT 1 FROM survey_branch_responses WHERE survey_id = p_survey_id AND branch_id = b.id AND count > 0)
  )), '[]'::jsonb)
  INTO v_branches
  FROM branches b
  LEFT JOIN survey_branch_submissions sbs ON sbs.branch_id = b.id AND sbs.survey_id = p_survey_id
  WHERE EXISTS (
    SELECT 1 FROM survey_branch_responses WHERE survey_id = p_survey_id AND branch_id = b.id
    UNION ALL
    SELECT 1 FROM survey_individual_responses WHERE survey_id = p_survey_id AND branch_id = b.id
    UNION ALL
    SELECT 1 FROM survey_branch_submissions WHERE survey_id = p_survey_id AND branch_id = b.id
  );

  -- questionCounts
  WITH combined_counts AS (
    SELECT branch_id, question_id, option_id, count
    FROM survey_branch_responses
    WHERE survey_id = p_survey_id AND count > 0

    UNION ALL

    SELECT branch_id, question_id, option_id, count(*) as count
    FROM survey_individual_responses
    WHERE survey_id = p_survey_id AND option_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM survey_branch_responses 
        WHERE survey_branch_responses.survey_id = p_survey_id 
          AND survey_branch_responses.branch_id = survey_individual_responses.branch_id 
          AND survey_branch_responses.question_id = survey_individual_responses.question_id 
          AND survey_branch_responses.option_id = survey_individual_responses.option_id
          AND survey_branch_responses.count > 0
      )
    GROUP BY branch_id, question_id, option_id
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'branchId', branch_id,
    'questionId', question_id,
    'optionId', option_id,
    'count', count
  )), '[]'::jsonb)
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
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
LANGUAGE plpgsql
AS $$
DECLARE
  v_submission jsonb;
  v_responses jsonb;
  v_individual_responses jsonb;
  v_total_respondents integer;
  v_distinct_individuals integer;
BEGIN
  -- submission
  SELECT to_jsonb(sbs.*) INTO v_submission
  FROM survey_branch_submissions sbs
  WHERE survey_id = p_survey_id AND branch_id = p_branch_id;

  -- responses
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'question_id', question_id,
    'option_id', option_id,
    'count', count
  )), '[]'::jsonb)
  INTO v_responses
  FROM survey_branch_responses
  WHERE survey_id = p_survey_id AND branch_id = p_branch_id;

  -- individualResponses
  SELECT COALESCE(jsonb_agg(to_jsonb(sir.*)), '[]'::jsonb)
  INTO v_individual_responses
  FROM survey_individual_responses sir
  WHERE survey_id = p_survey_id AND branch_id = p_branch_id;

  -- distinct individuals
  SELECT count(DISTINCT respondent_id) INTO v_distinct_individuals
  FROM survey_individual_responses
  WHERE survey_id = p_survey_id AND branch_id = p_branch_id;

  -- totalRespondents
  v_total_respondents := GREATEST(
    COALESCE((v_submission->>'total_respondents')::int, 0),
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

GRANT EXECUTE ON FUNCTION public.get_survey_results_fast(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_branch_submission_fast(uuid, uuid) TO service_role;
NOTIFY pgrst, 'reload schema';

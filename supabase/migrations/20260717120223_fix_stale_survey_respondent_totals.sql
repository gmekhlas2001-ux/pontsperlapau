-- Keep respondent deletion and its derived branch total in one transaction.
CREATE OR REPLACE FUNCTION public.delete_survey_respondent_atomic(
  p_respondent_row_id uuid,
  p_survey_id uuid,
  p_branch_id uuid
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_temp AS $$
DECLARE remaining_individual_total integer;
DECLARE has_aggregate_answers boolean;
BEGIN
  DELETE FROM public.survey_respondents
  WHERE id = p_respondent_row_id
    AND survey_id = p_survey_id
    AND branch_id = p_branch_id
    AND respondent_type = 'manual';
  IF NOT FOUND THEN RAISE EXCEPTION 'Manual respondent not found'; END IF;

  SELECT count(DISTINCT (respondent_type, respondent_id))
  INTO remaining_individual_total
  FROM public.survey_individual_responses
  WHERE survey_id = p_survey_id AND branch_id = p_branch_id;

  SELECT EXISTS (
    SELECT 1 FROM public.survey_branch_responses
    WHERE survey_id = p_survey_id AND branch_id = p_branch_id AND count > 0
  ) INTO has_aggregate_answers;

  IF remaining_individual_total = 0 AND NOT has_aggregate_answers THEN
    DELETE FROM public.survey_branch_submissions
    WHERE survey_id = p_survey_id AND branch_id = p_branch_id;
  ELSIF NOT has_aggregate_answers THEN
    UPDATE public.survey_branch_submissions
    SET total_respondents = remaining_individual_total, updated_at = now()
    WHERE survey_id = p_survey_id AND branch_id = p_branch_id;
  ELSE
    UPDATE public.survey_branch_submissions
    SET total_respondents = GREATEST(total_respondents, remaining_individual_total), updated_at = now()
    WHERE survey_id = p_survey_id AND branch_id = p_branch_id;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.delete_survey_respondent_atomic(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_survey_respondent_atomic(uuid, uuid, uuid) TO service_role;

-- A stored total is meaningful only when aggregate answer counts still exist.
CREATE OR REPLACE VIEW public.survey_list_stats
WITH (security_invoker = true)
AS
WITH source_totals AS (
  SELECT
    s.survey_id,
    s.branch_id,
    CASE WHEN EXISTS (
      SELECT 1 FROM public.survey_branch_responses r
      WHERE r.survey_id = s.survey_id AND r.branch_id = s.branch_id AND r.count > 0
    ) THEN s.total_respondents ELSE 0 END::integer AS stored_total_respondents,
    0::integer AS unique_answered_respondents
  FROM public.survey_branch_submissions s

  UNION ALL

  SELECT
    survey_id,
    branch_id,
    0::integer AS stored_total_respondents,
    COUNT(DISTINCT (respondent_type, respondent_id))::integer AS unique_answered_respondents
  FROM public.survey_individual_responses
  GROUP BY survey_id, branch_id
), combined AS (
  SELECT
    survey_id,
    branch_id,
    MAX(stored_total_respondents)::integer AS stored_total_respondents,
    MAX(unique_answered_respondents)::integer AS unique_answered_respondents
  FROM source_totals
  GROUP BY survey_id, branch_id
)
SELECT
  survey_id,
  branch_id,
  stored_total_respondents,
  unique_answered_respondents,
  GREATEST(stored_total_respondents, unique_answered_respondents)::integer AS effective_total_respondents
FROM combined
WHERE GREATEST(stored_total_respondents, unique_answered_respondents) > 0;

COMMENT ON VIEW public.survey_list_stats IS
  'Compact branch totals derived only from response rows that still exist.';
REVOKE ALL ON public.survey_list_stats FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.survey_list_stats TO service_role;

-- Remove summary-only records that have neither aggregate nor individual answers.
DELETE FROM public.survey_branch_submissions s
WHERE NOT EXISTS (
  SELECT 1 FROM public.survey_branch_responses r
  WHERE r.survey_id = s.survey_id AND r.branch_id = s.branch_id AND r.count > 0
)
AND NOT EXISTS (
  SELECT 1 FROM public.survey_individual_responses i
  WHERE i.survey_id = s.survey_id AND i.branch_id = s.branch_id
);

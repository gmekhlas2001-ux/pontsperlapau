/*
  Read-only survey totals used by list cards and save guards.

  Individual answers contain one row per question, so counting rows in the
  browser (or through a default 1,000-row API page) is both expensive and
  inaccurate. Aggregate unique respondents inside Postgres instead.
*/
CREATE VIEW public.survey_list_stats
WITH (security_invoker = true)
AS
WITH individual_counts AS (
  SELECT
    survey_id,
    branch_id,
    COUNT(DISTINCT (respondent_type, respondent_id))::integer AS unique_answered_respondents
  FROM public.survey_individual_responses
  GROUP BY survey_id, branch_id
)
SELECT
  COALESCE(submission.survey_id, individual.survey_id) AS survey_id,
  COALESCE(submission.branch_id, individual.branch_id) AS branch_id,
  COALESCE(submission.total_respondents, 0)::integer AS stored_total_respondents,
  COALESCE(individual.unique_answered_respondents, 0)::integer AS unique_answered_respondents,
  GREATEST(
    COALESCE(submission.total_respondents, 0),
    COALESCE(individual.unique_answered_respondents, 0)
  )::integer AS effective_total_respondents
FROM public.survey_branch_submissions AS submission
FULL OUTER JOIN individual_counts AS individual
  ON individual.survey_id = submission.survey_id
 AND individual.branch_id = submission.branch_id;

COMMENT ON VIEW public.survey_list_stats IS
  'Per-survey, per-branch respondent totals without modifying stored submissions.';

REVOKE ALL ON public.survey_list_stats FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.survey_list_stats TO service_role;

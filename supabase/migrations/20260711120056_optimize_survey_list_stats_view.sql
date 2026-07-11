/*
  Keep survey and branch filters pushable into both source tables. A full
  outer join forces Postgres to aggregate every individual answer before it
  can apply those filters, which is unnecessarily expensive for branch users.
*/
CREATE OR REPLACE VIEW public.survey_list_stats
WITH (security_invoker = true)
AS
WITH source_totals AS (
  SELECT
    survey_id,
    branch_id,
    total_respondents::integer AS stored_total_respondents,
    0::integer AS unique_answered_respondents
  FROM public.survey_branch_submissions

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
FROM combined;

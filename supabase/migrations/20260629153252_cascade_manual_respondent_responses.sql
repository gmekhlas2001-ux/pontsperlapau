/*
  Keep manually managed survey respondents and their answers consistent.
  Deleting a respondent snapshot removes only that respondent's individual
  answers for the same survey; aggregate branch totals are unaffected.
*/

ALTER TABLE public.survey_individual_responses
  DROP CONSTRAINT IF EXISTS survey_individual_responses_respondent_fkey;

ALTER TABLE public.survey_individual_responses
  ADD CONSTRAINT survey_individual_responses_respondent_fkey
  FOREIGN KEY (survey_id, respondent_type, respondent_id)
  REFERENCES public.survey_respondents (survey_id, respondent_type, respondent_id)
  ON DELETE CASCADE;

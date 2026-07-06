-- Allow people to be added to a survey manually (first name, last name,
-- province, details) without being in the students or staff records. These
-- manual entries are scoped to the survey only.

-- 1. Widen the respondent_type check on the snapshot table and add a detail
--    column (used to store province / other free-text details).
ALTER TABLE survey_respondents
  DROP CONSTRAINT IF EXISTS survey_respondents_respondent_type_check;
ALTER TABLE survey_respondents
  ADD CONSTRAINT survey_respondents_respondent_type_check
  CHECK (respondent_type IN ('student', 'staff', 'manual'));

ALTER TABLE survey_respondents
  ADD COLUMN IF NOT EXISTS respondent_detail text;

-- 2. Widen the respondent_type check on the per-answer table so manual answers save.
ALTER TABLE survey_individual_responses
  DROP CONSTRAINT IF EXISTS survey_individual_responses_respondent_type_check;
ALTER TABLE survey_individual_responses
  ADD CONSTRAINT survey_individual_responses_respondent_type_check
  CHECK (respondent_type IN ('student', 'staff', 'manual'));

ALTER TABLE surveys
ADD COLUMN IF NOT EXISTS survey_date date;

CREATE INDEX IF NOT EXISTS idx_surveys_survey_date ON surveys(survey_date);

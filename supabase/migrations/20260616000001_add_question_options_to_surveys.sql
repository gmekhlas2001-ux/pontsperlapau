ALTER TABLE survey_response_options
ADD COLUMN IF NOT EXISTS question_id uuid REFERENCES survey_questions(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_survey_options_question
  ON survey_response_options(question_id);

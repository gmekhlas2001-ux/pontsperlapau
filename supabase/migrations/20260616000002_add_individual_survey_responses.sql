ALTER TABLE survey_questions
ADD COLUMN IF NOT EXISTS question_type text DEFAULT 'multiple_choice' NOT NULL
  CHECK (question_type IN (
    'short_answer',
    'paragraph',
    'multiple_choice',
    'checkboxes',
    'dropdown',
    'linear_scale',
    'rating',
    'multiple_choice_grid',
    'checkbox_grid',
    'date',
    'time'
  )),
ADD COLUMN IF NOT EXISTS sentiment_enabled boolean DEFAULT false NOT NULL;

CREATE TABLE IF NOT EXISTS survey_individual_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id uuid NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  respondent_type text NOT NULL CHECK (respondent_type IN ('student', 'staff')),
  respondent_id uuid NOT NULL,
  respondent_name text NOT NULL,
  question_id uuid NOT NULL REFERENCES survey_questions(id) ON DELETE CASCADE,
  option_id uuid REFERENCES survey_response_options(id) ON DELETE SET NULL,
  text_answer text,
  answered_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sir_survey_branch
  ON survey_individual_responses(survey_id, branch_id);

CREATE INDEX IF NOT EXISTS idx_sir_respondent
  ON survey_individual_responses(survey_id, respondent_type, respondent_id);

CREATE INDEX IF NOT EXISTS idx_sir_question_answer
  ON survey_individual_responses(survey_id, question_id, option_id);

ALTER TABLE survey_individual_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_read_survey_individual_responses"
  ON survey_individual_responses FOR SELECT TO anon USING (true);

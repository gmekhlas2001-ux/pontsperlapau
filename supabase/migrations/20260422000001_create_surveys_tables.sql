-- ─────────────────────────────────────────────
--  Surveys System
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS surveys (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title         text NOT NULL,
  description   text,
  period        text,
  status        text DEFAULT 'draft' NOT NULL CHECK (status IN ('draft', 'active', 'closed')),
  created_by    uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at    timestamptz DEFAULT now() NOT NULL,
  updated_at    timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS survey_sections (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id   uuid NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
  title       text NOT NULL,
  description text,
  order_index integer DEFAULT 0 NOT NULL,
  created_at  timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS survey_questions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id     uuid NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
  section_id    uuid REFERENCES survey_sections(id) ON DELETE SET NULL,
  question_text text NOT NULL,
  order_index   integer DEFAULT 0 NOT NULL,
  created_at    timestamptz DEFAULT now() NOT NULL
);

-- The response scale options (shared across all questions in a survey)
CREATE TABLE IF NOT EXISTS survey_response_options (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id   uuid NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
  label       text NOT NULL,
  order_index integer DEFAULT 0 NOT NULL,
  sentiment   text DEFAULT 'neutral' NOT NULL CHECK (sentiment IN ('positive', 'negative', 'neutral'))
);

-- Per-branch aggregate counts (coordinator enters: how many people chose each option)
CREATE TABLE IF NOT EXISTS survey_branch_responses (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id   uuid NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
  branch_id   uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES survey_questions(id) ON DELETE CASCADE,
  option_id   uuid NOT NULL REFERENCES survey_response_options(id) ON DELETE CASCADE,
  count       integer DEFAULT 0 NOT NULL CHECK (count >= 0),
  entered_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_at  timestamptz DEFAULT now() NOT NULL,
  UNIQUE(survey_id, branch_id, question_id, option_id)
);

-- Tracks overall submission metadata per branch
CREATE TABLE IF NOT EXISTS survey_branch_submissions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id         uuid NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
  branch_id         uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  total_respondents integer DEFAULT 0 NOT NULL CHECK (total_respondents >= 0),
  submitted_by      uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_at        timestamptz DEFAULT now() NOT NULL,
  UNIQUE(survey_id, branch_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_surveys_status        ON surveys(status);
CREATE INDEX IF NOT EXISTS idx_survey_questions_sid  ON survey_questions(survey_id);
CREATE INDEX IF NOT EXISTS idx_survey_options_sid    ON survey_response_options(survey_id);
CREATE INDEX IF NOT EXISTS idx_sbr_survey_branch     ON survey_branch_responses(survey_id, branch_id);
CREATE INDEX IF NOT EXISTS idx_sbs_survey_branch     ON survey_branch_submissions(survey_id, branch_id);

-- Updated_at triggers
CREATE OR REPLACE FUNCTION update_surveys_updated_at()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_surveys_updated_at        BEFORE UPDATE ON surveys                 FOR EACH ROW EXECUTE FUNCTION update_surveys_updated_at();
CREATE TRIGGER trg_sbr_updated_at            BEFORE UPDATE ON survey_branch_responses FOR EACH ROW EXECUTE FUNCTION update_surveys_updated_at();
CREATE TRIGGER trg_sbs_updated_at            BEFORE UPDATE ON survey_branch_submissions FOR EACH ROW EXECUTE FUNCTION update_surveys_updated_at();

-- RLS
ALTER TABLE surveys                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE survey_sections           ENABLE ROW LEVEL SECURITY;
ALTER TABLE survey_questions          ENABLE ROW LEVEL SECURITY;
ALTER TABLE survey_response_options   ENABLE ROW LEVEL SECURITY;
ALTER TABLE survey_branch_responses   ENABLE ROW LEVEL SECURITY;
ALTER TABLE survey_branch_submissions ENABLE ROW LEVEL SECURITY;

-- Everyone authenticated can read
CREATE POLICY "anon_read_surveys"    ON surveys                   FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read_sections"   ON survey_sections           FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read_questions"  ON survey_questions          FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read_options"    ON survey_response_options   FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read_sbr"        ON survey_branch_responses   FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read_sbs"        ON survey_branch_submissions FOR SELECT TO anon USING (true);

-- Anon write (managed via X-User-Id auth in app)
CREATE POLICY "anon_write_surveys"    ON surveys                   FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_write_sections"   ON survey_sections           FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_write_questions"  ON survey_questions          FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_write_options"    ON survey_response_options   FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_write_sbr"        ON survey_branch_responses   FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_write_sbs"        ON survey_branch_submissions FOR ALL TO anon USING (true) WITH CHECK (true);

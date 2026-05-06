/*
  # Student Fees Table

  Tracks per-student fee records: who owes what, when it's due, and whether
  it's been paid. Scoped to branch for multi-tenant isolation.

  Columns
  -------
  student_id      FK → students
  branch_id       FK → branches (for scoping/reporting)
  class_id        optional FK → classes (fee can be class-specific)
  description     what the fee is for (e.g. "Tuition Q1", "Registration")
  amount          numeric amount
  currency        ISO code, default EUR
  due_date        when payment is due
  paid_date       when payment was received (null = not yet paid)
  status          pending | paid | overdue | waived | partial
  payment_method  cash | bank_transfer | card | other
  notes           optional admin note
  recorded_by     FK → users (staff who recorded it)
*/

CREATE TYPE fee_status AS ENUM ('pending', 'paid', 'overdue', 'waived', 'partial');
CREATE TYPE fee_payment_method AS ENUM ('cash', 'bank_transfer', 'card', 'other');

CREATE TABLE IF NOT EXISTS student_fees (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id       uuid NOT NULL REFERENCES students(id)   ON DELETE CASCADE,
  branch_id        uuid NOT NULL REFERENCES branches(id)   ON DELETE CASCADE,
  class_id         uuid          REFERENCES classes(id)    ON DELETE SET NULL,
  description      varchar(200) NOT NULL,
  amount           decimal(10,2) NOT NULL CHECK (amount >= 0),
  currency         varchar(10)  NOT NULL DEFAULT 'EUR',
  due_date         date         NOT NULL,
  paid_date        date,
  status           fee_status   NOT NULL DEFAULT 'pending',
  payment_method   fee_payment_method,
  notes            text,
  recorded_by      uuid          REFERENCES users(id)      ON DELETE SET NULL,
  created_at       timestamptz  NOT NULL DEFAULT now(),
  updated_at       timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX idx_student_fees_student   ON student_fees(student_id);
CREATE INDEX idx_student_fees_branch    ON student_fees(branch_id);
CREATE INDEX idx_student_fees_status    ON student_fees(status);
CREATE INDEX idx_student_fees_due_date  ON student_fees(due_date);

CREATE TRIGGER update_student_fees_updated_at
  BEFORE UPDATE ON student_fees
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE student_fees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon can read student_fees"
  ON student_fees FOR SELECT TO anon USING (true);
CREATE POLICY "anon can insert student_fees"
  ON student_fees FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon can update student_fees"
  ON student_fees FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon can delete student_fees"
  ON student_fees FOR DELETE TO anon USING (true);

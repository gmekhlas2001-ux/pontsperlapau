/*
  # Donor & Grant Tracking

  Lets NGO administrators track donors, individual grants, and spending
  against each grant per branch.

  Tables
  ------
  donors
    name, contact info, type (individual/org/government/foundation)

  grants
    donor_id FK, branch_id FK, title, total amount, currency,
    start/end dates, status (active/closed/pending)

  grant_transactions
    grant_id FK, description, amount, type (income/expense),
    recorded_by FK → users
*/

-- Donors
CREATE TABLE IF NOT EXISTS donors (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         varchar(200) NOT NULL,
  type         varchar(50)  NOT NULL DEFAULT 'individual',
  email        varchar(200),
  phone        varchar(50),
  country      varchar(100),
  notes        text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER update_donors_updated_at
  BEFORE UPDATE ON donors
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE donors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon can read donors"    ON donors FOR SELECT TO anon USING (true);
CREATE POLICY "anon can insert donors"  ON donors FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon can update donors"  ON donors FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon can delete donors"  ON donors FOR DELETE TO anon USING (true);

-- Grants
CREATE TYPE grant_status AS ENUM ('pending', 'active', 'closed', 'cancelled');

CREATE TABLE IF NOT EXISTS grants (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  donor_id     uuid NOT NULL REFERENCES donors(id)   ON DELETE CASCADE,
  branch_id    uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  title        varchar(200) NOT NULL,
  description  text,
  amount       decimal(12,2) NOT NULL CHECK (amount >= 0),
  currency     varchar(10) NOT NULL DEFAULT 'EUR',
  start_date   date,
  end_date     date,
  status       grant_status NOT NULL DEFAULT 'active',
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_grants_donor  ON grants(donor_id);
CREATE INDEX idx_grants_branch ON grants(branch_id);
CREATE INDEX idx_grants_status ON grants(status);

CREATE TRIGGER update_grants_updated_at
  BEFORE UPDATE ON grants
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE grants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon can read grants"    ON grants FOR SELECT TO anon USING (true);
CREATE POLICY "anon can insert grants"  ON grants FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon can update grants"  ON grants FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon can delete grants"  ON grants FOR DELETE TO anon USING (true);

-- Grant Transactions
CREATE TYPE grant_tx_type AS ENUM ('income', 'expense');

CREATE TABLE IF NOT EXISTS grant_transactions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grant_id     uuid NOT NULL REFERENCES grants(id)  ON DELETE CASCADE,
  description  varchar(200) NOT NULL,
  amount       decimal(12,2) NOT NULL CHECK (amount >= 0),
  type         grant_tx_type NOT NULL DEFAULT 'expense',
  tx_date      date NOT NULL DEFAULT CURRENT_DATE,
  recorded_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  notes        text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_grant_tx_grant ON grant_transactions(grant_id);

ALTER TABLE grant_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon can read grant_transactions"   ON grant_transactions FOR SELECT TO anon USING (true);
CREATE POLICY "anon can insert grant_transactions" ON grant_transactions FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon can update grant_transactions" ON grant_transactions FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon can delete grant_transactions" ON grant_transactions FOR DELETE TO anon USING (true);

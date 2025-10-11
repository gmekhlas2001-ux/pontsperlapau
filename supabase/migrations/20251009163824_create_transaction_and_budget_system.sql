/*
  # Create Transaction and Budget Management System

  1. New Tables
    - `transactions`: Track money transfers to Afghanistan
      - `id` (uuid, primary key)
      - `transaction_number` (text, unique) - Auto-generated transaction ID
      - `from_branch_id` (uuid) - Source branch
      - `to_branch_id` (uuid) - Destination branch
      - `from_staff_id` (uuid) - Staff member sending
      - `to_staff_id` (uuid) - Staff member receiving
      - `amount` (numeric) - Transaction amount
      - `currency` (text) - Currency type (AFN, USD, etc)
      - `transfer_method` (text) - MoneyGram, Western Union, Bank, etc
      - `transaction_date` (date) - When transaction was made
      - `received_date` (date) - When transaction was received
      - `status` (text) - pending, confirmed, cancelled
      - `confirmation_code` (text) - Transfer confirmation code
      - `notes` (text) - Additional notes
      - `receipt_url` (text) - Receipt document URL
      - `created_by` (uuid) - Admin who created the record
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

    - `branch_budgets`: Track branch budgets
      - `id` (uuid, primary key)
      - `branch_id` (uuid) - Branch reference
      - `budget_period` (text) - monthly, quarterly, yearly
      - `year` (integer) - Budget year
      - `month` (integer) - Budget month (null for yearly)
      - `allocated_amount` (numeric) - Total budget allocated
      - `spent_amount` (numeric) - Amount spent (calculated)
      - `currency` (text) - Currency type
      - `notes` (text)
      - `created_by` (uuid)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

    - `transaction_reports`: Store generated PDF reports
      - `id` (uuid, primary key)
      - `branch_id` (uuid) - Branch for this report (null for all branches)
      - `report_type` (text) - monthly, yearly, custom
      - `start_date` (date)
      - `end_date` (date)
      - `report_url` (text) - PDF file URL
      - `total_transactions` (integer)
      - `total_amount` (numeric)
      - `generated_by` (uuid)
      - `generated_at` (timestamptz)

  2. Security
    - Enable RLS on all tables
    - Only admins can manage transactions and budgets
    - Only admins can generate reports
*/

-- Create transactions table
CREATE TABLE IF NOT EXISTS transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_number text UNIQUE NOT NULL DEFAULT 'TXN-' || to_char(now(), 'YYYYMMDD') || '-' || substring(gen_random_uuid()::text, 1, 8),
  from_branch_id uuid REFERENCES branches(id) ON DELETE SET NULL,
  to_branch_id uuid REFERENCES branches(id) ON DELETE SET NULL,
  from_staff_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  to_staff_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  amount numeric(15, 2) NOT NULL CHECK (amount > 0),
  currency text DEFAULT 'AFN' CHECK (currency IN ('AFN', 'USD', 'EUR', 'GBP')),
  transfer_method text CHECK (transfer_method IN ('MoneyGram', 'Western Union', 'Bank Transfer', 'Hawala', 'Cash', 'Other')),
  transaction_date date NOT NULL DEFAULT CURRENT_DATE,
  received_date date,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled')),
  confirmation_code text,
  notes text,
  receipt_url text,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create branch_budgets table
CREATE TABLE IF NOT EXISTS branch_budgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  budget_period text NOT NULL CHECK (budget_period IN ('monthly', 'quarterly', 'yearly')),
  year integer NOT NULL CHECK (year >= 2020 AND year <= 2100),
  month integer CHECK (month >= 1 AND month <= 12),
  allocated_amount numeric(15, 2) NOT NULL CHECK (allocated_amount >= 0),
  spent_amount numeric(15, 2) DEFAULT 0 CHECK (spent_amount >= 0),
  currency text DEFAULT 'AFN' CHECK (currency IN ('AFN', 'USD', 'EUR', 'GBP')),
  notes text,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(branch_id, budget_period, year, month)
);

-- Create transaction_reports table
CREATE TABLE IF NOT EXISTS transaction_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid REFERENCES branches(id) ON DELETE CASCADE,
  report_type text NOT NULL CHECK (report_type IN ('monthly', 'yearly', 'custom')),
  start_date date NOT NULL,
  end_date date NOT NULL,
  report_url text,
  total_transactions integer DEFAULT 0,
  total_amount numeric(15, 2) DEFAULT 0,
  generated_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  generated_at timestamptz DEFAULT now()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_transactions_from_branch ON transactions(from_branch_id);
CREATE INDEX IF NOT EXISTS idx_transactions_to_branch ON transactions(to_branch_id);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(transaction_date);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);
CREATE INDEX IF NOT EXISTS idx_branch_budgets_branch ON branch_budgets(branch_id);
CREATE INDEX IF NOT EXISTS idx_branch_budgets_period ON branch_budgets(budget_period, year, month);
CREATE INDEX IF NOT EXISTS idx_transaction_reports_branch ON transaction_reports(branch_id);
CREATE INDEX IF NOT EXISTS idx_transaction_reports_dates ON transaction_reports(start_date, end_date);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at
DROP TRIGGER IF EXISTS update_transactions_updated_at ON transactions;
CREATE TRIGGER update_transactions_updated_at
  BEFORE UPDATE ON transactions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_branch_budgets_updated_at ON branch_budgets;
CREATE TRIGGER update_branch_budgets_updated_at
  BEFORE UPDATE ON branch_budgets
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Enable RLS
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE branch_budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE transaction_reports ENABLE ROW LEVEL SECURITY;

-- RLS Policies for transactions
CREATE POLICY "Admins can view all transactions"
  ON transactions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.auth_user_id = auth.uid()
      AND profiles.role_id = 'admin'
    )
  );

CREATE POLICY "Admins can insert transactions"
  ON transactions FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.auth_user_id = auth.uid()
      AND profiles.role_id = 'admin'
    )
  );

CREATE POLICY "Admins can update transactions"
  ON transactions FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.auth_user_id = auth.uid()
      AND profiles.role_id = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.auth_user_id = auth.uid()
      AND profiles.role_id = 'admin'
    )
  );

CREATE POLICY "Admins can delete transactions"
  ON transactions FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.auth_user_id = auth.uid()
      AND profiles.role_id = 'admin'
    )
  );

-- RLS Policies for branch_budgets
CREATE POLICY "Admins can manage budgets"
  ON branch_budgets FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.auth_user_id = auth.uid()
      AND profiles.role_id = 'admin'
    )
  );

-- RLS Policies for transaction_reports
CREATE POLICY "Admins can manage reports"
  ON transaction_reports FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.auth_user_id = auth.uid()
      AND profiles.role_id = 'admin'
    )
  );

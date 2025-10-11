/*
  # Add Transaction Purpose and Automatic Budget Deduction

  1. Changes
    - Add `purpose` field to transactions table to track the cause/reason for each transaction
    - Create function to automatically update branch_budgets.spent_amount when transactions are created/updated
    - Create trigger to call the function on transaction insert/update

  2. How it Works
    - When a transaction is created with status 'confirmed' to a branch, the spent_amount in branch_budgets is increased
    - The system looks for a budget matching the transaction's:
      * to_branch_id
      * currency
      * year and month (for monthly budgets) or year only (for yearly budgets)
    - If no matching budget exists, the transaction still succeeds but budget is not updated

  3. Important Notes
    - Only 'confirmed' transactions affect the budget
    - Cancelled transactions are removed from the budget calculation
    - The trigger handles both INSERT and UPDATE operations
*/

-- Add purpose column to transactions table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'transactions' AND column_name = 'purpose'
  ) THEN
    ALTER TABLE transactions ADD COLUMN purpose text;
  END IF;
END $$;

-- Create function to update branch budget spent_amount
CREATE OR REPLACE FUNCTION update_branch_budget_on_transaction()
RETURNS TRIGGER AS $$
DECLARE
  trans_year INTEGER;
  trans_month INTEGER;
  old_amount NUMERIC := 0;
  new_amount NUMERIC := 0;
BEGIN
  -- Extract year and month from transaction date
  trans_year := EXTRACT(YEAR FROM COALESCE(NEW.transaction_date, CURRENT_DATE));
  trans_month := EXTRACT(MONTH FROM COALESCE(NEW.transaction_date, CURRENT_DATE));

  -- Determine old amount to subtract (for UPDATE operations)
  IF TG_OP = 'UPDATE' THEN
    IF OLD.status = 'confirmed' THEN
      old_amount := OLD.amount;
    END IF;
  END IF;

  -- Determine new amount to add
  IF NEW.status = 'confirmed' THEN
    new_amount := NEW.amount;
  END IF;

  -- Update monthly budget if exists
  UPDATE branch_budgets
  SET spent_amount = GREATEST(0, spent_amount - old_amount + new_amount)
  WHERE 
    branch_id = NEW.to_branch_id
    AND currency = NEW.currency
    AND budget_period = 'monthly'
    AND year = trans_year
    AND month = trans_month;

  -- Update yearly budget if exists
  UPDATE branch_budgets
  SET spent_amount = GREATEST(0, spent_amount - old_amount + new_amount)
  WHERE 
    branch_id = NEW.to_branch_id
    AND currency = NEW.currency
    AND budget_period = 'yearly'
    AND year = trans_year;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for transaction insert
DROP TRIGGER IF EXISTS trigger_update_budget_on_transaction_insert ON transactions;
CREATE TRIGGER trigger_update_budget_on_transaction_insert
  AFTER INSERT ON transactions
  FOR EACH ROW
  EXECUTE FUNCTION update_branch_budget_on_transaction();

-- Create trigger for transaction update
DROP TRIGGER IF EXISTS trigger_update_budget_on_transaction_update ON transactions;
CREATE TRIGGER trigger_update_budget_on_transaction_update
  AFTER UPDATE ON transactions
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status OR OLD.amount IS DISTINCT FROM NEW.amount)
  EXECUTE FUNCTION update_branch_budget_on_transaction();

-- Create function to handle transaction deletion
CREATE OR REPLACE FUNCTION update_branch_budget_on_transaction_delete()
RETURNS TRIGGER AS $$
DECLARE
  trans_year INTEGER;
  trans_month INTEGER;
BEGIN
  -- Only adjust if the deleted transaction was confirmed
  IF OLD.status = 'confirmed' THEN
    trans_year := EXTRACT(YEAR FROM COALESCE(OLD.transaction_date, CURRENT_DATE));
    trans_month := EXTRACT(MONTH FROM COALESCE(OLD.transaction_date, CURRENT_DATE));

    -- Update monthly budget
    UPDATE branch_budgets
    SET spent_amount = GREATEST(0, spent_amount - OLD.amount)
    WHERE 
      branch_id = OLD.to_branch_id
      AND currency = OLD.currency
      AND budget_period = 'monthly'
      AND year = trans_year
      AND month = trans_month;

    -- Update yearly budget
    UPDATE branch_budgets
    SET spent_amount = GREATEST(0, spent_amount - OLD.amount)
    WHERE 
      branch_id = OLD.to_branch_id
      AND currency = OLD.currency
      AND budget_period = 'yearly'
      AND year = trans_year;
  END IF;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for transaction delete
DROP TRIGGER IF EXISTS trigger_update_budget_on_transaction_delete ON transactions;
CREATE TRIGGER trigger_update_budget_on_transaction_delete
  AFTER DELETE ON transactions
  FOR EACH ROW
  EXECUTE FUNCTION update_branch_budget_on_transaction_delete();

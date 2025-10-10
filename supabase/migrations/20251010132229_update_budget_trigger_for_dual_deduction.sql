/*
  # Update Budget Trigger for Dual Deduction System

  1. Changes
    - Replace the existing budget trigger function to handle both sender and receiver branches
    - When a transaction is made from a main branch to another branch:
      * Deduct from the sender (main) branch budget
      * Deduct from the receiver branch budget
    - Handles INSERT, UPDATE, and DELETE operations
    - Only processes confirmed transactions

  2. Logic
    - For main branches sending money: deduct from their budget
    - For non-main branches receiving money from main branches: deduct from their budget
    - For transactions between non-main branches: only deduct from receiver (original behavior)
*/

-- Drop existing trigger functions
DROP TRIGGER IF EXISTS trigger_update_budget_on_transaction_insert ON transactions;
DROP TRIGGER IF EXISTS trigger_update_budget_on_transaction_update ON transactions;
DROP TRIGGER IF EXISTS trigger_update_budget_on_transaction_delete ON transactions;

DROP FUNCTION IF EXISTS update_branch_budget_on_transaction();
DROP FUNCTION IF EXISTS update_branch_budget_on_transaction_delete();

-- Create new comprehensive function for INSERT and UPDATE
CREATE OR REPLACE FUNCTION update_branch_budget_on_transaction()
RETURNS TRIGGER AS $$
DECLARE
  trans_year INTEGER;
  trans_month INTEGER;
  old_amount NUMERIC := 0;
  new_amount NUMERIC := 0;
  from_is_main BOOLEAN := false;
BEGIN
  -- Extract year and month from transaction date
  trans_year := EXTRACT(YEAR FROM COALESCE(NEW.transaction_date, CURRENT_DATE));
  trans_month := EXTRACT(MONTH FROM COALESCE(NEW.transaction_date, CURRENT_DATE));

  -- Check if the from_branch is a main branch
  IF NEW.from_branch_id IS NOT NULL THEN
    SELECT is_main_branch INTO from_is_main
    FROM branches
    WHERE id = NEW.from_branch_id;
  END IF;

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

  -- Update receiver branch budget (to_branch_id)
  -- Monthly budget
  UPDATE branch_budgets
  SET spent_amount = GREATEST(0, spent_amount - old_amount + new_amount)
  WHERE 
    branch_id = NEW.to_branch_id
    AND currency = NEW.currency
    AND budget_period = 'monthly'
    AND year = trans_year
    AND month = trans_month;

  -- Yearly budget
  UPDATE branch_budgets
  SET spent_amount = GREATEST(0, spent_amount - old_amount + new_amount)
  WHERE 
    branch_id = NEW.to_branch_id
    AND currency = NEW.currency
    AND budget_period = 'yearly'
    AND year = trans_year;

  -- If from_branch is a main branch, also deduct from sender budget
  IF from_is_main AND NEW.from_branch_id IS NOT NULL THEN
    -- Monthly budget
    UPDATE branch_budgets
    SET spent_amount = GREATEST(0, spent_amount - old_amount + new_amount)
    WHERE 
      branch_id = NEW.from_branch_id
      AND currency = NEW.currency
      AND budget_period = 'monthly'
      AND year = trans_year
      AND month = trans_month;

    -- Yearly budget
    UPDATE branch_budgets
    SET spent_amount = GREATEST(0, spent_amount - old_amount + new_amount)
    WHERE 
      branch_id = NEW.from_branch_id
      AND currency = NEW.currency
      AND budget_period = 'yearly'
      AND year = trans_year;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create function for DELETE
CREATE OR REPLACE FUNCTION update_branch_budget_on_transaction_delete()
RETURNS TRIGGER AS $$
DECLARE
  trans_year INTEGER;
  trans_month INTEGER;
  from_is_main BOOLEAN := false;
BEGIN
  -- Only adjust if the deleted transaction was confirmed
  IF OLD.status = 'confirmed' THEN
    trans_year := EXTRACT(YEAR FROM COALESCE(OLD.transaction_date, CURRENT_DATE));
    trans_month := EXTRACT(MONTH FROM COALESCE(OLD.transaction_date, CURRENT_DATE));

    -- Check if the from_branch is a main branch
    IF OLD.from_branch_id IS NOT NULL THEN
      SELECT is_main_branch INTO from_is_main
      FROM branches
      WHERE id = OLD.from_branch_id;
    END IF;

    -- Update receiver branch budget (to_branch_id)
    -- Monthly budget
    UPDATE branch_budgets
    SET spent_amount = GREATEST(0, spent_amount - OLD.amount)
    WHERE 
      branch_id = OLD.to_branch_id
      AND currency = OLD.currency
      AND budget_period = 'monthly'
      AND year = trans_year
      AND month = trans_month;

    -- Yearly budget
    UPDATE branch_budgets
    SET spent_amount = GREATEST(0, spent_amount - OLD.amount)
    WHERE 
      branch_id = OLD.to_branch_id
      AND currency = OLD.currency
      AND budget_period = 'yearly'
      AND year = trans_year;

    -- If from_branch was a main branch, also restore sender budget
    IF from_is_main AND OLD.from_branch_id IS NOT NULL THEN
      -- Monthly budget
      UPDATE branch_budgets
      SET spent_amount = GREATEST(0, spent_amount - OLD.amount)
      WHERE 
        branch_id = OLD.from_branch_id
        AND currency = OLD.currency
        AND budget_period = 'monthly'
        AND year = trans_year
        AND month = trans_month;

      -- Yearly budget
      UPDATE branch_budgets
      SET spent_amount = GREATEST(0, spent_amount - OLD.amount)
      WHERE 
        branch_id = OLD.from_branch_id
        AND currency = OLD.currency
        AND budget_period = 'yearly'
        AND year = trans_year;
    END IF;
  END IF;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- Create triggers
CREATE TRIGGER trigger_update_budget_on_transaction_insert
  AFTER INSERT ON transactions
  FOR EACH ROW
  EXECUTE FUNCTION update_branch_budget_on_transaction();

CREATE TRIGGER trigger_update_budget_on_transaction_update
  AFTER UPDATE ON transactions
  FOR EACH ROW
  EXECUTE FUNCTION update_branch_budget_on_transaction();

CREATE TRIGGER trigger_update_budget_on_transaction_delete
  AFTER DELETE ON transactions
  FOR EACH ROW
  EXECUTE FUNCTION update_branch_budget_on_transaction_delete();

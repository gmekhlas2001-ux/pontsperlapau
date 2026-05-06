/*
  # Create Library Management System Tables

  ## Overview
  This migration creates tables for managing library books, physical copies, and borrowing transactions.

  ## New Tables
  
  ### `books`
  Master table for book information and catalog.
  
  **Columns:**
  - `id` (uuid, primary key) - Unique book identifier
  - `title` (varchar) - Book title
  - `author` (varchar) - Book author(s)
  - `isbn` (varchar, unique) - International Standard Book Number
  - `publisher` (varchar) - Publishing company
  - `publication_year` (integer) - Year of publication
  - `category` (varchar) - Book category/genre
  - `description` (text) - Book description/summary
  - `language` (varchar) - Language of the book
  - `total_copies` (integer) - Total number of physical copies
  - `available_copies` (integer) - Currently available copies
  - `physical_condition` (enum) - Overall condition rating
  - `cover_image_url` (varchar) - URL to book cover image
  - `location_shelf` (varchar) - Physical shelf location
  - `acquisition_date` (date) - Date book was acquired
  - `acquisition_cost` (decimal) - Purchase cost
  - `added_by` (uuid) - User who added the book (librarian)
  - `created_at` (timestamp) - Record creation
  - `updated_at` (timestamp) - Last update
  - `deleted_at` (timestamp) - Soft delete timestamp
  
  ### `book_copies`
  Individual physical copies of each book for detailed tracking.
  
  **Columns:**
  - `id` (uuid, primary key) - Unique copy identifier
  - `book_id` (uuid) - Reference to books table
  - `copy_number` (integer) - Copy number (1, 2, 3, etc.)
  - `barcode` (varchar, unique) - Physical barcode for scanning
  - `status` (enum) - available, borrowed, damaged, lost, maintenance
  - `condition` (enum) - Physical condition rating
  - `location_shelf` (varchar) - Specific shelf location
  - `notes` (text) - Additional notes about this copy
  - `created_at` (timestamp) - Record creation
  - `updated_at` (timestamp) - Last update
  
  ### `book_borrowings`
  Transaction records for book lending and returns.
  
  **Columns:**
  - `id` (uuid, primary key) - Unique borrowing record identifier
  - `book_id` (uuid) - Reference to books table
  - `book_copy_id` (uuid) - Specific copy borrowed
  - `borrower_id` (uuid) - Reference to users table
  - `borrowed_date` (date) - Date book was borrowed
  - `due_date` (date) - Expected return date
  - `returned_date` (date) - Actual return date (NULL if not returned)
  - `expected_return_date` (date) - For tracking extensions
  - `is_overdue` (boolean) - Overdue status (computed at application level)
  - `fine_amount` (decimal) - Late return fine
  - `condition_on_return` (enum) - Condition when returned
  - `return_notes` (text) - Notes about the return
  - `lent_by` (uuid) - Librarian who processed loan
  - `returned_by` (uuid) - Librarian who processed return
  - `can_renew` (boolean) - Whether renewal is allowed
  - `renewal_count` (integer) - Number of times renewed
  - `created_at` (timestamp) - Record creation
  - `updated_at` (timestamp) - Last update
  
  ## Security
  - Enable RLS on all tables
  - Librarians manage all library operations
  - Staff and students can view book catalog
  - Users can view their own borrowing history
  - Admins have full access
  
  ## Notes
  - Track individual copies for detailed inventory management
  - Automatically update available_copies when books are borrowed/returned
  - Calculate overdue status at application level
  - Support book renewals with limits
*/

-- Create book condition enum
CREATE TYPE book_condition AS ENUM ('excellent', 'good', 'fair', 'poor');

-- Create book copy status enum
CREATE TYPE book_copy_status AS ENUM ('available', 'borrowed', 'damaged', 'lost', 'maintenance');

-- Create books table
CREATE TABLE IF NOT EXISTS books (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title varchar(500) NOT NULL,
  author varchar(300) NOT NULL,
  isbn varchar(20) UNIQUE,
  publisher varchar(200),
  publication_year integer,
  category varchar(100),
  description text,
  language varchar(50) DEFAULT 'English',
  total_copies integer DEFAULT 1 NOT NULL,
  available_copies integer DEFAULT 1 NOT NULL,
  physical_condition book_condition DEFAULT 'good',
  cover_image_url varchar(500),
  location_shelf varchar(50),
  acquisition_date date,
  acquisition_cost decimal(10,2),
  added_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  deleted_at timestamptz,
  
  -- Constraints
  CONSTRAINT valid_copies CHECK (total_copies > 0 AND available_copies >= 0),
  CONSTRAINT valid_available_copies CHECK (available_copies <= total_copies),
  CONSTRAINT valid_publication_year CHECK (
    publication_year IS NULL OR 
    (publication_year >= 1000 AND publication_year <= EXTRACT(YEAR FROM CURRENT_DATE))
  ),
  CONSTRAINT valid_acquisition_cost CHECK (acquisition_cost IS NULL OR acquisition_cost >= 0)
);

-- Create indexes for books
CREATE INDEX IF NOT EXISTS idx_books_title ON books(title);
CREATE INDEX IF NOT EXISTS idx_books_author ON books(author);
CREATE INDEX IF NOT EXISTS idx_books_isbn ON books(isbn);
CREATE INDEX IF NOT EXISTS idx_books_category ON books(category);
CREATE INDEX IF NOT EXISTS idx_books_language ON books(language);
CREATE INDEX IF NOT EXISTS idx_books_deleted_at ON books(deleted_at);
CREATE INDEX IF NOT EXISTS idx_books_available_copies ON books(available_copies);

-- Create book_copies table
CREATE TABLE IF NOT EXISTS book_copies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id uuid NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  copy_number integer NOT NULL,
  barcode varchar(50) UNIQUE,
  status book_copy_status DEFAULT 'available' NOT NULL,
  condition book_condition DEFAULT 'good' NOT NULL,
  location_shelf varchar(50),
  notes text,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  
  -- Constraints
  CONSTRAINT valid_copy_number CHECK (copy_number > 0),
  CONSTRAINT unique_book_copy_number UNIQUE(book_id, copy_number)
);

-- Create indexes for book_copies
CREATE INDEX IF NOT EXISTS idx_book_copies_book_id ON book_copies(book_id);
CREATE INDEX IF NOT EXISTS idx_book_copies_status ON book_copies(status);
CREATE INDEX IF NOT EXISTS idx_book_copies_barcode ON book_copies(barcode);

-- Create book_borrowings table
CREATE TABLE IF NOT EXISTS book_borrowings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id uuid NOT NULL REFERENCES books(id) ON DELETE RESTRICT,
  book_copy_id uuid NOT NULL REFERENCES book_copies(id) ON DELETE RESTRICT,
  borrower_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  borrowed_date date DEFAULT CURRENT_DATE NOT NULL,
  due_date date NOT NULL,
  returned_date date,
  expected_return_date date,
  is_overdue boolean DEFAULT false NOT NULL,
  fine_amount decimal(10,2) DEFAULT 0,
  condition_on_return book_condition,
  return_notes text,
  lent_by uuid REFERENCES users(id) ON DELETE SET NULL,
  returned_by uuid REFERENCES users(id) ON DELETE SET NULL,
  can_renew boolean DEFAULT true NOT NULL,
  renewal_count integer DEFAULT 0 NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  
  -- Constraints
  CONSTRAINT valid_due_date CHECK (due_date > borrowed_date),
  CONSTRAINT valid_return_date CHECK (returned_date IS NULL OR returned_date >= borrowed_date),
  CONSTRAINT valid_fine_amount CHECK (fine_amount >= 0),
  CONSTRAINT valid_renewal_count CHECK (renewal_count >= 0)
);

-- Create indexes for book_borrowings
CREATE INDEX IF NOT EXISTS idx_book_borrowings_book_id ON book_borrowings(book_id);
CREATE INDEX IF NOT EXISTS idx_book_borrowings_book_copy_id ON book_borrowings(book_copy_id);
CREATE INDEX IF NOT EXISTS idx_book_borrowings_borrower_id ON book_borrowings(borrower_id);
CREATE INDEX IF NOT EXISTS idx_book_borrowings_returned_date ON book_borrowings(returned_date);
CREATE INDEX IF NOT EXISTS idx_book_borrowings_due_date ON book_borrowings(due_date);
CREATE INDEX IF NOT EXISTS idx_book_borrowings_is_overdue ON book_borrowings(is_overdue);
CREATE INDEX IF NOT EXISTS idx_book_borrowings_active ON book_borrowings(borrower_id, returned_date) 
  WHERE returned_date IS NULL;

-- Function to update overdue status
CREATE OR REPLACE FUNCTION update_overdue_status()
RETURNS TRIGGER AS $$
BEGIN
  NEW.is_overdue := (NEW.returned_date IS NULL AND NEW.due_date < CURRENT_DATE);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update overdue status
CREATE TRIGGER set_overdue_status_on_insert
  BEFORE INSERT ON book_borrowings
  FOR EACH ROW
  EXECUTE FUNCTION update_overdue_status();

CREATE TRIGGER set_overdue_status_on_update
  BEFORE UPDATE ON book_borrowings
  FOR EACH ROW
  EXECUTE FUNCTION update_overdue_status();

-- Function to automatically create book copies when a book is added
CREATE OR REPLACE FUNCTION create_book_copies()
RETURNS TRIGGER AS $$
DECLARE
  i integer;
BEGIN
  -- Create individual copy records for each copy of the book
  FOR i IN 1..NEW.total_copies LOOP
    INSERT INTO book_copies (book_id, copy_number, status, condition, location_shelf)
    VALUES (NEW.id, i, 'available', NEW.physical_condition, NEW.location_shelf);
  END LOOP;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to create copies when book is inserted
CREATE TRIGGER create_copies_on_book_insert
  AFTER INSERT ON books
  FOR EACH ROW
  EXECUTE FUNCTION create_book_copies();

-- Function to update available copies when borrowing
CREATE OR REPLACE FUNCTION update_book_availability_on_borrow()
RETURNS TRIGGER AS $$
BEGIN
  -- When a book is borrowed
  IF TG_OP = 'INSERT' THEN
    -- Decrement available copies
    UPDATE books
    SET available_copies = available_copies - 1,
        updated_at = now()
    WHERE id = NEW.book_id;
    
    -- Update book copy status to borrowed
    UPDATE book_copies
    SET status = 'borrowed',
        updated_at = now()
    WHERE id = NEW.book_copy_id;
  END IF;
  
  -- When a book is returned
  IF TG_OP = 'UPDATE' AND OLD.returned_date IS NULL AND NEW.returned_date IS NOT NULL THEN
    -- Increment available copies
    UPDATE books
    SET available_copies = available_copies + 1,
        updated_at = now()
    WHERE id = NEW.book_id;
    
    -- Update book copy status based on return condition
    UPDATE book_copies
    SET status = CASE
      WHEN NEW.condition_on_return IN ('damaged', 'poor') THEN 'maintenance'
      ELSE 'available'
    END,
    condition = NEW.condition_on_return,
    updated_at = now()
    WHERE id = NEW.book_copy_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update availability on borrow/return
CREATE TRIGGER update_availability_on_borrow
  AFTER INSERT ON book_borrowings
  FOR EACH ROW
  EXECUTE FUNCTION update_book_availability_on_borrow();

CREATE TRIGGER update_availability_on_return
  AFTER UPDATE ON book_borrowings
  FOR EACH ROW
  WHEN (OLD.returned_date IS DISTINCT FROM NEW.returned_date)
  EXECUTE FUNCTION update_book_availability_on_borrow();

-- Function to validate book copy is available before borrowing
CREATE OR REPLACE FUNCTION validate_book_copy_available()
RETURNS TRIGGER AS $$
DECLARE
  copy_status book_copy_status;
BEGIN
  -- Check if the book copy is available
  SELECT status INTO copy_status
  FROM book_copies
  WHERE id = NEW.book_copy_id;
  
  IF copy_status != 'available' THEN
    RAISE EXCEPTION 'Book copy is not available for borrowing (status: %)', copy_status;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to validate availability before borrowing
CREATE TRIGGER validate_copy_before_borrow
  BEFORE INSERT ON book_borrowings
  FOR EACH ROW
  EXECUTE FUNCTION validate_book_copy_available();

-- Triggers to update updated_at
CREATE TRIGGER update_books_updated_at
  BEFORE UPDATE ON books
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_book_copies_updated_at
  BEFORE UPDATE ON book_copies
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_book_borrowings_updated_at
  BEFORE UPDATE ON book_borrowings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Enable RLS on books
ALTER TABLE books ENABLE ROW LEVEL SECURITY;

-- Everyone can view available books
CREATE POLICY "Authenticated users can view books"
  ON books FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND status = 'active'
    )
  );

-- Librarians and admins can create books
CREATE POLICY "Librarians can create books"
  ON books FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role IN ('admin', 'superadmin', 'librarian')
      AND status = 'active'
    )
  );

-- Librarians and admins can update books
CREATE POLICY "Librarians can update books"
  ON books FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role IN ('admin', 'superadmin', 'librarian')
      AND status = 'active'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role IN ('admin', 'superadmin', 'librarian')
      AND status = 'active'
    )
  );

-- Enable RLS on book_copies
ALTER TABLE book_copies ENABLE ROW LEVEL SECURITY;

-- Everyone can view book copies
CREATE POLICY "Authenticated users can view book copies"
  ON book_copies FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND status = 'active'
    )
  );

-- Librarians can manage book copies
CREATE POLICY "Librarians can create book copies"
  ON book_copies FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role IN ('admin', 'superadmin', 'librarian')
      AND status = 'active'
    )
  );

CREATE POLICY "Librarians can update book copies"
  ON book_copies FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role IN ('admin', 'superadmin', 'librarian')
      AND status = 'active'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role IN ('admin', 'superadmin', 'librarian')
      AND status = 'active'
    )
  );

-- Enable RLS on book_borrowings
ALTER TABLE book_borrowings ENABLE ROW LEVEL SECURITY;

-- Users can view their own borrowing history
CREATE POLICY "Users can view own borrowing history"
  ON book_borrowings FOR SELECT
  TO authenticated
  USING (
    borrower_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role IN ('admin', 'superadmin', 'librarian', 'teacher')
      AND status = 'active'
    )
  );

-- Librarians can create borrowing records
CREATE POLICY "Librarians can create borrowings"
  ON book_borrowings FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role IN ('admin', 'superadmin', 'librarian')
      AND status = 'active'
    )
  );

-- Librarians can update borrowing records (for returns, renewals)
CREATE POLICY "Librarians can update borrowings"
  ON book_borrowings FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role IN ('admin', 'superadmin', 'librarian')
      AND status = 'active'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role IN ('admin', 'superadmin', 'librarian')
      AND status = 'active'
    )
  );
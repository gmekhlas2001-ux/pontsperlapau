-- Each survey now carries the language it was written in, so exported PDF/Excel
-- reports can be generated entirely in that language (labels, headings,
-- direction, dates). Existing surveys default to Dari, matching the previous
-- Dari-first report behaviour.

ALTER TABLE surveys
  ADD COLUMN IF NOT EXISTS language text NOT NULL DEFAULT 'fa'
  CHECK (language IN ('en', 'es', 'ca', 'fa'));

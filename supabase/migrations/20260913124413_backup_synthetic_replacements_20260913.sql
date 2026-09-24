-- History marker for the already-applied production-only maintenance job.
-- The original SQL is preserved verbatim in ../operations/20260913124413_backup_synthetic_replacements_20260913.sql.
-- It snapshots a one-time replacement plan and production-specific records.
-- It is deliberately not re-executed when building an empty app database.
-- This version already exists remotely: do not repair it or rerun the archive.
SELECT 1;

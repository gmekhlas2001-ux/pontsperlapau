# Historical operational SQL

This folder archives production-only maintenance SQL for traceability. It is
outside the migration replay path. Do not run these files as application setup.

The 20260913124413 migration was already applied remotely before this repair.
It reads a temporary maintenance plan and production record IDs to create
backup and planning tables. Its exact SQL is archived here; the corresponding
migration is a documented no-op history marker for fresh databases. This keeps
version history aligned without repeating a historical data operation.

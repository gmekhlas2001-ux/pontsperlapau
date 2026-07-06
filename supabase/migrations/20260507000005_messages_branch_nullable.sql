/*
  # Make messages.branch_id nullable for superadmin global broadcasts

  Superadmins are not bound to any branch (their `branch_id` is null), so the
  current NOT NULL constraint blocks them from sending messages at all.

  After this migration:
    branch_id IS NULL  → global broadcast (visible to all branches)
    branch_id = <uuid> → branch-scoped (existing behaviour)
*/

ALTER TABLE messages ALTER COLUMN branch_id DROP NOT NULL;

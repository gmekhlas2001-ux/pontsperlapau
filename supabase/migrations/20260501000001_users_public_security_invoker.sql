/*
  # users_public: enforce caller-side permissions

  Postgres views default to running with the view creator's permissions
  (security definer semantics), which can bypass row-level security and
  column GRANTS of the querying user. Supabase's security advisor flags
  this.

  Setting `security_invoker = true` makes the view honour the caller's
  permissions — same effect as a plain SELECT against `users` would have,
  but without ever exposing `password_hash` because the view doesn't
  include that column.
*/

ALTER VIEW users_public SET (security_invoker = true);

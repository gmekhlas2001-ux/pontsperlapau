/*
  # Fix search_path on auth functions to include extensions schema

  Previous migration `20260430000002_security_hardening` set
  `search_path = public, pg_temp` on `verify_password`, `hash_password`,
  and `update_last_login`. But pgcrypto (which provides `crypt()` and
  `gen_salt()`) lives in the `extensions` schema, so those functions
  started failing with "function crypt does not exist".

  Adding `extensions` to the search_path fixes them while keeping the
  same hardening (non-attacker-controllable schema list, pinned in the
  function definition).
*/

ALTER FUNCTION verify_password(text, text)
  SET search_path = public, extensions, pg_temp;

ALTER FUNCTION hash_password(text)
  SET search_path = public, extensions, pg_temp;

ALTER FUNCTION update_last_login(uuid)
  SET search_path = public, extensions, pg_temp;

-- delete_user_cascade only touches public tables, no extension calls,
-- but keep it consistent.
ALTER FUNCTION delete_user_cascade(uuid)
  SET search_path = public, extensions, pg_temp;

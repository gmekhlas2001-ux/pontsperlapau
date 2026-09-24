// Executes the real migration history in disposable PostgreSQL (WASM).
// Supabase-managed auth/storage scaffolding is provided; no live connection exists.
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { readdir, readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const db = new PGlite({ extensions: { pgcrypto } });
try {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE SCHEMA storage; CREATE SCHEMA extensions;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS 'SELECT NULL::uuid';
    -- Existing Supabase project helper, verified against the live schema.
    -- Older migrations revoke this platform function but do not create it.
    CREATE FUNCTION public.rls_auto_enable() RETURNS event_trigger
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
    DECLARE cmd record;
    BEGIN
      FOR cmd IN SELECT * FROM pg_event_trigger_ddl_commands()
        WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
          AND object_type IN ('table', 'partitioned table')
      LOOP
        IF cmd.schema_name = 'public' THEN
          EXECUTE format('ALTER TABLE IF EXISTS %s ENABLE ROW LEVEL SECURITY', cmd.object_identity);
        END IF;
      END LOOP;
    END; $$;

    CREATE TABLE storage.buckets(id text PRIMARY KEY, name text, public boolean);
    CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text, name text);
    ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
    CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
    SET search_path = public, extensions;
    GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
  `);
  const files = (await readdir(new URL('../supabase/migrations/', import.meta.url))).filter(f => f.endsWith('.sql')).sort();
  assert.equal(new Set(files.map(f => f.split('_')[0])).size, files.length, 'Migration versions must be unique');
  for (const file of files) {
    try { await db.exec(await readFile(new URL(`../supabase/migrations/${file}`, import.meta.url), 'utf8')); }
    catch (error) { throw new Error(`Migration ${file}: ${error.message}`, { cause: error }); }
  }
  console.log(`PASS: ${files.length} migrations replayed`);
  const scalar = async (sql, params = []) => Object.values((await db.query(sql, params)).rows[0])[0];
  const branchA = await scalar("INSERT INTO public.branches(name, province) VALUES ('Fixture A', 'Test') RETURNING id");
  const branchB = await scalar("INSERT INTO public.branches(name, province) VALUES ('Fixture B', 'Test') RETURNING id");
  const actor = await scalar("INSERT INTO public.users(email, password_hash, first_name, last_name, role, branch_id) VALUES ('audit@example.test', 'test-hash', 'Audit', 'Admin', 'admin', $1) RETURNING id", [branchA]);
  const studentUser = await scalar("INSERT INTO public.users(email, password_hash, first_name, last_name, role, branch_id) VALUES ('student@example.test', 'test-hash', 'Actual', 'Student', 'student', $1) RETURNING id", [branchA]);
  const student = await scalar("INSERT INTO public.students(user_id, student_id, enrollment_date, branch_id) VALUES ($1, 'FIXTURE-1', CURRENT_DATE, $2) RETURNING id", [studentUser, branchA]);
  await db.query("SELECT set_config('request.jwt.claims', $1, false)", [JSON.stringify({ role: 'service_role' })]);
  await db.query("SELECT set_config('request.headers', $1, false)", [JSON.stringify({ 'x-app-actor': actor })]);
  await db.exec('SET ROLE service_role');
  assert.equal(await scalar('SELECT count(*)::int FROM public.app_modules'), 20);
  const ruleId = await scalar(`INSERT INTO public.module_access_rules(module_id,action,user_id,allowed,changed_by)
    VALUES ('library','view',$1,false,$2) RETURNING id`, [studentUser, actor]);
  assert.equal(await scalar('SELECT count(*)::int FROM public.module_access_events WHERE actor_id = $1 AND module_id = $2', [actor, 'library']), 1);
  await assert.rejects(db.query(`INSERT INTO public.module_access_rules(module_id,action,user_id,allowed,changed_by)
    VALUES ('library','view',$1,true,$2)`, [studentUser, actor]), /unique|duplicate/i);
  await db.query('UPDATE public.module_access_rules SET allowed = true WHERE id = $1', [ruleId]);
  await db.query('DELETE FROM public.module_access_rules WHERE id = $1', [ruleId]);
  assert.deepEqual((await db.query('SELECT previous_allowed,new_allowed FROM public.module_access_events WHERE module_id = $1 ORDER BY id', ['library'])).rows,
    [{ previous_allowed: null, new_allowed: false }, { previous_allowed: false, new_allowed: true }, { previous_allowed: true, new_allowed: null }]);
  console.log('PASS: module catalog, unique grants, and attributed access history');
  const makePayload = () => {
    const section = crypto.randomUUID();
    const question = crypto.randomUUID();
    return [actor, { title: 'Atomic fixture', status: 'draft', branch_id: branchA, respondent_type: 'students', language: 'en' },
      [{ id: section, title: 'Section', order_index: 0 }],
      [{ id: question, section_id: section, question_text: 'Question', question_type: 'multiple_choice', sentiment_enabled: false, required: false, order_index: 0 }],
      [{ question_id: question, label: 'Yes', sentiment: 'positive', order_index: 0 }],
      [{ respondent_type: 'student', respondent_id: student }]];
  };
  const createSurvey = payload => scalar('SELECT public.create_survey_atomic($1, $2, $3, $4, $5, $6)', payload.map((p, i) => i ? JSON.stringify(p) : p));
  const id = await createSurvey(makePayload());
  assert.equal(await scalar('SELECT count(*)::int FROM public.survey_questions WHERE survey_id = $1 AND required = false', [id]), 1);
  assert.equal(await scalar('SELECT respondent_name FROM public.survey_respondents WHERE survey_id = $1', [id]), 'Actual Student');
  assert.equal(await scalar("SELECT count(*)::int FROM public.activity_logs WHERE record_id = $1 AND user_id = $2 AND event_source = 'edge' AND branch_id = $3", [id, actor, branchA]), 1);
  console.log('PASS: atomic survey relationships, real respondent names, and trusted audit attribution');

  const counts = () => db.query('SELECT (SELECT count(*) FROM public.surveys) AS surveys, (SELECT count(*) FROM public.survey_questions) AS questions, (SELECT count(*) FROM public.survey_response_options) AS options, (SELECT count(*) FROM public.activity_logs) AS audit');
  const before = (await counts()).rows;
  const invalidOption = makePayload(); invalidOption[4][0].sentiment = 'invalid';
  await assert.rejects(createSurvey(invalidOption));
  assert.deepEqual((await counts()).rows, before, 'A child constraint failure must roll back the survey and its audit');
  const invalidRespondent = makePayload(); invalidRespondent[5][0].respondent_id = crypto.randomUUID();
  await assert.rejects(createSurvey(invalidRespondent), /outside the survey branch/);
  assert.deepEqual((await counts()).rows, before, 'A late respondent failure must roll back all children');
  const wrongBranch = makePayload(); wrongBranch[1].branch_id = branchB;
  await assert.rejects(createSurvey(wrongBranch), /outside your scope/);
  const duplicate = makePayload(); duplicate[5].push(duplicate[5][0]);
  await assert.rejects(createSurvey(duplicate));
  assert.deepEqual((await counts()).rows, before);
  console.log('PASS: option failures, invalid respondents, duplicate respondents, and cross-branch creation roll back');

  await db.query('UPDATE public.users SET password_hash = $1 WHERE id = $2', ['do-not-log-this-secret', actor]);
  const audit = (await db.query("SELECT * FROM public.activity_logs WHERE record_id = $1 AND action_type = 'UPDATE' ORDER BY created_at DESC LIMIT 1", [actor])).rows[0];
  assert.ok(audit.changed_fields.includes('password_hash'));
  assert.equal(audit.old_values, null); assert.equal(audit.new_values, null);
  assert.equal(JSON.stringify(audit).includes('do-not-log-this-secret'), false);
  const auditCount = await scalar('SELECT count(*)::int FROM public.activity_logs');
  await db.query('UPDATE public.users SET last_login = now() WHERE id = $1', [actor]);
  assert.equal(await scalar('SELECT count(*)::int FROM public.activity_logs'), auditCount, 'Login timestamps must not flood business history');
  console.log('PASS: audit records exclude secret values and ignore login-only timestamp changes');

  await db.exec('RESET ROLE');
  await db.exec('CREATE TABLE public.future_private_table(id integer)');
  for (const role of ['anon', 'authenticated']) {
    for (const table of ['users', 'surveys', 'activity_logs', 'app_modules', 'module_access_rules', 'module_access_events', 'future_private_table']) {
      for (const privilege of ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) {
        assert.equal(await scalar('SELECT has_table_privilege($1, $2, $3)', [role, `public.${table}`, privilege]), false, `${role} ${privilege} ${table}`);
      }
    }
    assert.equal(await scalar("SELECT has_function_privilege($1, 'public.create_survey_atomic(uuid,jsonb,jsonb,jsonb,jsonb,jsonb)', 'EXECUTE')", [role]), false);
    await db.exec(`SET ROLE ${role}`);
    await assert.rejects(db.exec('TRUNCATE public.surveys CASCADE'), /permission denied/);
    await assert.rejects(createSurvey(makePayload()), /permission denied/);
    await db.exec('RESET ROLE');
  }
  console.log('PASS: browser roles cannot read/write/truncate tables or execute the privileged RPC; future defaults stay private');

} finally {
  await db.close();
}

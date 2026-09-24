# Ponts per la Pau website: architecture audit and development plan

**Reviewed:** 23 September 2026  
**Source:** local branch `codex/fix-survey-analytics-refresh`  
**Live database:** Supabase project `hzpivoubvfnrgqtovxoy` (`ACTIVE_HEALTHY`, PostgreSQL 17)  
**Scope:** frontend source, browser data layer, Edge Functions, SQL migrations, live schema metadata, permissions, advisors, and build checks. This was a read-only review of Supabase. No production data or schema was changed.

> **Implementation update:** The repair work and live Supabase changes are documented in [the repair results](website-repair-results-2026-09-23.md). This audit preserves the original findings.

## Executive assessment

The application has a coherent foundation: 20 feature modules, server-validated sessions, branch-aware data gateways, private document storage, a production build, and passing frontend tests. The strongest risk is the size and importance of the custom authorization boundary. It depends on two large Edge Functions using the service role and needs direct adversarial tests. The most concrete database defect is an unintended `TRUNCATE` privilege on four public backup tables. The most concrete application integrity defect is that any signed-in user can create an audit log entry with their own action, table, record ID, and description. The dashboard can also show default or partial figures when a request fails.

The next release should focus on security and data correctness before expanding dormant modules. The live database has 12 branches, 842 users, 791 students, and 133,309 individual survey answer rows, while fees, grades, and messages contain no rows. These are exact counts at review time, not a statement about future usage.

## Architecture and verified state

| Layer | Current implementation | Assessment |
| --- | --- | --- |
| Frontend | React 19, Vite 7, TypeScript, Tailwind, 20 lazy-loaded modules, four languages, PWA | Broad feature coverage. Some very large pages and export modules increase change cost and download size. |
| Authentication | Custom HMAC token, app session table, 5-minute to 24-hour configured lifetime, browser session or local storage | Server revocation and role refresh are good. The custom system needs dedicated threat tests and maintenance. |
| Read API | `data-read` Edge Function authenticates, applies role/branch filters, forwards allowlisted GET/HEAD queries with service role | Centralized boundary, but a single parsing or scoping mistake can expose data because service role bypasses RLS. |
| Write API | `app-actions` plus specialized Edge Functions | Many checks exist, but one function contains 2,264 lines and many unrelated operations. Some multi-step writes use compensating deletes instead of a transaction. |
| Database | 71 local SQL migrations; 72 live migration entries; RLS enabled on all 41 live public tables | The one extra live migration creates operational backup/planning tables. Live schema contains additional manual backup objects. |
| Deployment checks | CI runs tests, lint, translation coverage, Deno type check, build, and dependency audit | Useful baseline. It does not execute end-to-end authorization or database migration replay tests. |

### Feature-area review

| Area | Frontend and backend path | Main review conclusion |
| --- | --- | --- |
| Login, profiles, staff, students, branches | Login/user functions, data-read, app-actions, parent-links, user/document services | Active core; custom session and branch authorization deserve the first security tests. Student-only routes exist, but login deliberately rejects student accounts, so those routes are presently unreachable by students. |
| Classes, attendance, grades, timetable, calendar | Class/attendance/grade services and atomic enrollment helper | Class and enrollment data exist; grades are empty. Verify permissions and aggregates before treating the student academic screens as mature. |
| Library and documents | Book actions, public image bucket, private document function | Substantial book data exist; borrowing and document tables are empty. Test upload/download authorization and file-size limits with realistic files. |
| Surveys, analytics, reports, exports | Survey services, analytics RPCs, management dashboard, PDF/Excel export | Most data-heavy workflow. Prioritize atomic creation, count accuracy, export checks, and load tests. |
| Fees, donors, transactions, messages, parent portal | Finance/comms services and Edge operations | Schema and UI exist, but multiple corresponding live tables are empty. Stage rollout after representative end-to-end tests. |
| Settings, notifications, audit log | Settings and notification services, client-authored activity events | Settings contain data; audit event trust and hidden read failures need improvement. |

### Migration and function comparison

- All **71 local migration versions** appear in the live migration history in order. The live project has one additional migration: `20260913124413_backup_synthetic_replacements_20260913`. Its recorded SQL creates several `maintenance` backup and answer-planning tables from existing survey data. Its file is absent locally. It is data-operation-specific, so it should be archived as a historical record, not blindly replayed in a fresh environment.
- All **nine deployed Edge Functions** are represented locally. I retrieved each deployed source bundle and compared every included TypeScript file with the checkout. The entry files and shared files match exactly at review time. This verifies source parity, though not the frontend deployment version or environment secret values.
- `supabase/config.toml` is absent. Migration and function deployment procedures are in the README, but the repository cannot currently express the entire Supabase project configuration. A local migration replay and schema diff are still required before claiming a fully reproducible environment.
- The live project has four old backup tables in `public` (`_backup_negative_*`, `survey_cleanup_backup_*`) and many operational backups in `maintenance`, `ops_backups`, and `survey_synthetic_20260730`. Several were created outside the tracked application migrations. Treat their retention and access as a separate inventory task; do not delete them without a restore audit.

## Findings, ordered by urgency

### P0 — remove unintended whole-table privileges on public backups

**Confirmed live:** `anon` and `authenticated` both have `TRUNCATE`, `REFERENCES`, and `TRIGGER` on four public backup tables. The roles have schema usage. The tables have RLS but no policies. PostgreSQL explicitly states that `TRUNCATE` and `REFERENCES` are outside row-level security. This is a dangerous grant even though the current Data API does not provide a normal `TRUNCATE` endpoint, so I have not demonstrated exploitation from the website.

**Fix:** create a reviewed migration that revokes `TRUNCATE`, `REFERENCES`, and `TRIGGER` from `anon`, `authenticated`, and `PUBLIC` on those four tables; check default privileges so new backup tables cannot inherit them; move operational backups out of the exposed `public` schema after verifying dependencies and restore requirements. Run `has_table_privilege` checks for all public relations afterward. See [PostgreSQL RLS documentation](https://www.postgresql.org/docs/17/ddl-rowsecurity.html) and [Supabase grants and RLS guidance](https://supabase.com/docs/guides/database/postgres/row-level-security).

**Acceptance:** zero `anon`/`authenticated` whole-table privileges on backup tables; a restore test still succeeds for the authorized operations role.

### P1 — make privileged reads and writes demonstrably safe

**Confirmed architecture:** `data-read` forwards allowlisted PostgREST queries with the service role after changing query parameters. `app-actions` similarly writes with the service role. This is intentional because the app does not use Supabase Auth identities, but ordinary RLS cannot independently enforce each user's branch or ownership. The read function accepts arbitrary query filters, projections for most tables, and forwards `Accept-Profile` from the caller. The intended row filters and relation projection validator need adversarial verification; I did not find a proven cross-branch leak in this review.

**Fix:** pin the upstream schema to `public` and reject client-selected profiles; replace ad hoc query rewriting with typed per-resource read operations where practical; create a role-by-resource authorization matrix covering direct rows, embedded relations, counts, `or`/`not`, pagination, and every write operation. Add tests using real sessions for superadmin, branch admin, teacher, librarian, student, parent, inactive user, and a user moved between branches. Test both allowed and denied cross-branch access. Keep the service key only inside Edge Functions. [Supabase API security guidance](https://supabase.com/docs/guides/api/securing-your-api).

**Acceptance:** all denied cases return no data or 403, including crafted query strings and embedded relations; every sensitive operation has a documented owner and automated authorization test.

### P1 — replace client-authored audit events for sensitive actions

**Confirmed source:** any valid session may call `app-actions` operation `log-activity` with a chosen action type, table name, record ID, and description. The server supplies `user_id`, but the event text and claimed action are client-controlled. The service itself labels these records operational history rather than tamper-evident evidence.

**Fix:** record create, update, delete, password, document, and financial events inside the corresponding trusted server operation or database transaction. Include actor, target, before/after summary, timestamp, and outcome. Restrict the generic endpoint to clearly labeled user notes or remove it. Preserve existing logs as historical operational records without relabeling them as verified events.

**Acceptance:** a client cannot create a false “DELETE” or password-change event; each successful sensitive mutation creates one authoritative event and a failed mutation does not claim success.

### P1 — prevent incomplete operations and misleading dashboard figures

**Confirmed source:** survey creation makes separate inserts for survey, sections, questions, options, and respondents, with best-effort cleanup on error. A failed cleanup could leave a partial survey. Existing atomic RPCs already show a safer pattern for other survey operations. The dashboard fires several independent reads and often uses `data ?? []` and `count ?? 0`; its page starts with all-zero values and does not show a load failure. Several lists are unpaginated even though the live dataset is already substantial.

**Fix:** move survey creation into one validated database transaction/RPC. Require successful responses before computing dashboard numbers. Return a clear loading/error state rather than zeros for unavailable metrics. Replace large browser-side aggregations with scoped database aggregates, and paginate every potentially growing list. Run query plans for the survey, dashboard, and activity views at representative data sizes.

**Acceptance:** forced failure at each survey-create step leaves no partial records; a failed dashboard request displays an error, not a plausible zero; totals match exact SQL counts across branches and beyond 1,000 rows.

### P2 — simplify the frontend and reduce download cost

**Confirmed source:** `Surveys.tsx` is 3,893 lines, `exportService.ts` is 2,564 lines, the survey dashboard is 861 lines, and `app-actions/index.ts` is 2,264 lines. The build succeeds but emits a 661 kB App chunk and a 937 kB ExcelJS chunk; the service worker precaches 114 assets totaling about 4.2 MiB. These are uncompressed build sizes, and user impact needs browser measurement.

**Fix:** split Surveys into builder, response entry, results, and management modules with separate state/hooks. Split Edge write operations by domain while sharing auth/validation utilities. Load Excel/PDF code only from export actions. Use production browser measurements for startup and survey navigation on a midrange phone; define budgets from observed usage. Keep the PWA cache free of authenticated API responses.

**Acceptance:** smaller initial JavaScript and measured faster route interaction, with no regression in survey editing/export and offline shell updates.

### P2 — tighten types, test coverage, and user-facing failure paths

**Confirmed checks:** production build passes; 25 test files and 91 tests pass; translation coverage reports 750 keys in four languages; lint exits successfully with 235 warnings, mostly explicit `any`. The CI workflow checks Edge Functions for type correctness but does not execute Edge authorization tests or migration replay. The PDF export path can download HTML after PDF generation fails, then throw; callers may treat the export as failed even though a different file was downloaded.

**Fix:** define generated database types and typed request/response schemas for Edge operations; reduce `any` in authorization and survey code first. Add tests for denial paths, atomic survey writes, counts, and exported files. Run migrations against a fresh local or disposable project in CI. Make PDF fallback explicit in the UI and label the downloaded file type. Add a small authenticated browser smoke suite for login, branch scoping, survey results, and logout.

**Acceptance:** CI fails on an authorization regression or migration replay failure; PDF behavior and error messages match the actual downloaded artifact; lint warnings trend down without suppressing checks.

### P3 — product and operations development

- Decide whether the empty fees, grades, messages, donor, and parent-portal modules are launch priorities or should be hidden until populated and exercised. The database shows no current data in fees, grades, or messages; that is a usage observation, not proof those features are broken.
- Add production telemetry for Edge request errors, latency, slow SQL, failed exports, and PWA update failures. Define an owner and alert threshold for login errors and cross-branch denials.
- Create a backup retention policy for operational/synthetic survey tables, including who can restore them, where the immutable copy lives, and when live scratch tables can be retired.
- Review the privacy scope of student health notes, documents, passport numbers, and downloadable CSVs against each role. A server-side permission matrix should drive both API access and visible UI actions.
- Improve accessibility with a keyboard and screen-reader pass over dialogs, tables, mobile navigation, loading states, and RTL screens. Static code inspection is not a substitute for this check.

## Recommended delivery sequence

| Phase | Target | Work | Exit gate |
| --- | --- | --- | --- |
| 1 | Immediate | Revoke backup-table whole-table privileges; inventory exposed schemas and backup access; archive the extra live migration SQL | Privilege query clean; restore path confirmed |
| 2 | Next sprint | Authorization matrix and live negative tests for data-read and app-actions; trusted audit events | Cross-role/branch suite green; forged audit event impossible |
| 3 | Following sprint | Atomic survey creation; dashboard failure handling and database aggregates; pagination | No partial survey on injected failure; exact totals at scale |
| 4 | Then | Break up large frontend/backend modules; typed contracts; lazy-load exports | Browser performance and functional regression gates pass |
| 5 | Ongoing | Accessibility, monitoring, backup retention, staged rollout for dormant modules | Operational metrics and owner sign-off |

## Evidence and limits

- Live checks were read-only: project status, migration history, deployed Edge source, tables, RLS/grants/functions/views, advisors, and aggregate row counts. No account credentials or production user rows were read.
- Both public views (`users_public`, `survey_list_stats`) are `security_invoker=true` and have no `anon` SELECT grant. All live public tables have RLS enabled. The security advisor only reported 47 informational “RLS enabled, no policy” findings, mostly operational backups and deliberately server-only tables. The performance advisor reported 84 no-primary-key notices and 54 unused-index notices, largely on backup or empty tables; neither list should be treated as a blanket instruction to add/drop indexes.
- The build, tests, lint, and i18n checks ran locally. No authenticated production browser session was available, so visual behavior, live login, and actual cross-role exploitation were not verified. The frontend currently deployed to hosting was not compared with this checkout.
- Migration history parity is not a byte-for-byte schema diff. Direct SQL changes outside migrations may exist. Before applying changes, pull a schema snapshot, compare it with a fresh migration replay, and review differences by object and grant.
- Existing untracked `.codex-work/` and `tmp/` directories were present before this review and were left untouched.

# Website repair results — 23 September 2026

## Delivery status

| Area | Status |
| --- | --- |
| Frontend | Updated and tested locally; hosting has not been deployed. |
| Supabase database | Three new migrations applied to `hzpivoubvfnrgqtovxoy` and verified. |
| Supabase backend | All nine Edge Functions deployed, active, and compared with local source including their shared dependencies. No source mismatches. |
| Migration history | 75 local and 75 remote versions and names match. One historical maintenance operation uses a documented replay marker; details below. |
| Existing records | The before/after checks both returned 56 surveys, 133,309 individual answers, and 11,267 existing activity entries. |

## Repairs delivered

### Security and backend integrity

- Removed all direct public-schema table and sequence privileges from browser roles, including `TRUNCATE`, `REFERENCES`, and `TRIGGER`. This closes the backup-table privilege issue identified in the audit. Future objects created by `postgres` also default to private access.
- Hardened the privileged read gateway: one target path, one projection, valid pagination values, an explicitly pinned public schema, restricted forwarded headers, and request timeouts. Scope calculation now fails explicitly if its supported size is exceeded.
- Extracted request validation and role/branch scope logic into testable modules. Regression tests cover administrator branch overrides, missing branches, teacher assignments, linked children, private profiles, restricted resources, and audit scope.
- Replaced browser-authored activity writes with database triggers on 22 business tables. The backend supplies the verified actor; the database records operation, table, record ID, branch at event time, and changed field names in the same transaction. Sensitive field values are excluded.
- Preserved old audit records as `legacy_client`. New events distinguish backend-attributed actions from database operations. Audit history has explicit source labels; branch administrators see new records by the recorded branch and legacy records through the existing actor scope.
- Survey creation now runs as one PostgreSQL transaction. It validates references, permissions, branch membership, respondent type, and real respondent identities. Questions/options have explicit IDs before insertion; their relationships do not depend on response order. A failure rolls back the survey, children, and audit events.
- Temporary session-database failures return 503 rather than invalidating a valid session. Sensitive API responses use `Cache-Control: private, no-store`.

### Frontend reliability and usability

- Dashboard lists are paginated, totals are checked, and inaccessible resources are not requested for roles that cannot read them. A failed required read shows Retry instead of presenting misleading zero totals. Loading uses placeholders; stale requests cannot update an unmounted dashboard.
- Parent accounts opening the dashboard are directed to their children’s portal.
- Tables recover when deletion or refreshed data removes the current page. Search includes numeric zero values. Search and page-size controls have accessible names.
- Session recovery retains credentials during an outage, blocks protected content until verification succeeds, and supports Retry. Expired-token initialization now completes even when the HTTP client already cleared the token. Restricted browser storage falls back to a temporary in-memory session.
- App updates prompt the user before activating/reloading. The older update-bridge URL remains a harmless compatibility file for existing installations.
- Route loading preserves the surrounding navigation and provides loading placeholders. Added a skip-to-content link, improved login semantics and autofill, accessible audit filters and table scrolling, reduced-motion behavior, and an error-screen reload action.
- Development hot updates reuse the existing React root, preventing duplicate roots from competing for the same page.
- Restored the missing local browser configuration in the ignored `.env.local` file using the project's public URL and anon key. The configured preview renders the login form without runtime errors, and the frontend was rebuilt with these settings.
- PDF export failure no longer silently downloads an HTML file under a fallback path. The caller receives the error. Audit Excel export handles failure and is disabled while loading, unavailable, or already exporting.
- Removed obsolete client logging calls, unused parameters/constants, ineffective audit filtering code, and the destructive update-bridge logic. Large gateway logic was separated into focused modules.

## Live migration and backend inventory

| Migration version | Name |
| --- | --- |
| `20260923211731` | `revoke_residual_browser_privileges` |
| `20260923211755` | `atomic_survey_creation` |
| `20260923211804` | `trusted_database_audit` |

All three migration bodies match the SQL stored in the live migration history.
Post-deployment checks found **zero browser-role public-table grants**, **22 enabled audit triggers**, no anonymous access to the new creation RPC, and the expected service-role access.

| Function | Verified active version |
| --- | ---: |
| app-actions | 27 |
| data-read | 10 |
| create-user | 46 |
| update-user | 22 |
| user-documents | 8 |
| parent-links | 8 |
| resolve-password-reset | 8 |
| login | 14 |
| request-password-reset | 8 |

The existing custom-session authentication model and gateway JWT settings were retained. All seven protected function endpoints returned HTTP 401 to live requests without a session and included non-cacheable response headers.

### Historical migration reconciliation

The previously missing remote migration `20260913124413_backup_synthetic_replacements_20260913` is a one-time backup/planning operation tied to production IDs and a maintenance plan. Its exact SQL is archived under `supabase/operations/`; its MD5 matches the live stored SQL (`754823fa099c3a0a57007b435d638b08`).

The corresponding local migration is an explicit no-op history marker. It is intentionally different from the archived operational SQL so a new database does not repeat a historical data operation. No remote migration history was rewritten. Do not run the archive as application setup or use migration repair to reapply it.

## Verification

| Check | Result |
| --- | --- |
| Frontend/unit regression suite | 29 files, 136 tests passed |
| Disposable PostgreSQL migration replay | 75 entries passed, including the documented operational marker |
| Database behavior | Creation success, child relationships, real respondent names, late-failure rollback, duplicate rejection, cross-branch denial, audit attribution, secret-value exclusion, timestamp-noise suppression, role privileges, and private future defaults passed |
| TypeScript and production build | Passed |
| Backend Deno type check | All nine entry points and their dependencies passed using CI flags |
| Lint | Zero errors; 214 existing/type-cleanup warnings remain, down from 235 at the audit baseline |
| Translations | 762 structured keys in four languages; 1,044 legacy UI literals checked |
| Production dependency audit | Zero reported vulnerabilities at check time |
| Live source comparison | Nine functions and all supplied shared dependencies match local source |
| Live migration comparison | All 75 version/name pairs match; three new bodies also match |
| Browser | Login, dashboard, library, audit history, mobile layout, Dari RTL, session outage/retry, and dashboard data-failure state checked |

Database tests use PGlite in a disposable database with Supabase auth/storage/platform scaffolding. They execute the application migrations and real PostgreSQL constraints/functions, without connecting to production. Run with `npm run test:database`; this is now included in CI.

Signed-in browser checks used fictional local API fixtures. Live checks verified deployment, source, schema/privileges, unchanged counts, and rejection of unauthenticated requests. A real-user authenticated production workflow has not been exercised. Automated accessibility checks on the tested login, dashboard, mobile RTL, library, and audit screens finished with zero violations; gradient contrast still needs human review because the automated tool could not resolve every background.

Screenshots in `docs/verification-2026-09-23/` show the local preview with fictional records.

## Remaining development priorities

1. **Release the frontend when approved.** The Supabase work is live; frontend usability fixes are local. Older clients may still send the retired activity-log request, which now returns 410 after their business operation succeeds.
2. **Complete a staging role matrix with real accounts.** Exercise every mutation, private document download, survey completion, and export as each role. Current scope tests and live unauthenticated probes are valuable but do not replace authenticated end-to-end testing.
3. **Continue module and type cleanup.** The survey page, export service, and action handler remain large. Reduce the remaining lint warnings with typed domain contracts rather than suppressing warnings.
4. **Reduce downloads.** The largest spreadsheet chunk remains about 937 kB before compression and the PWA precache is about 4.1 MiB. Measure actual route usage before changing offline behavior or replacing the export engine.
5. **Strengthen operations.** Add error-rate/latency monitoring and a documented backup retention/restore policy. Define production ownership for failures and run a restore drill.
6. **Resolve product decisions.** Student login is deliberately disabled while student routes exist. Fees, grades, and messages were empty at the original review; they need realistic acceptance testing before wider use.

## Handoff

The normal local preview is running at `http://127.0.0.1:5174/` using the restored public Supabase configuration. Its login form was verified without browser runtime errors. Temporary fixture servers and automated test browsers were stopped.

The original audit remains in `docs/website-architecture-audit-2026-09-23.md`.
Changes are in the working tree on `codex/fix-survey-analytics-refresh`; no Git commit or frontend deployment was created. Pre-change Git revision: `a9b3b9236ac3d5d59ad2adc9db48ff236d4661e4`.

For a deployment incident, prefer a narrowly scoped function correction or a reviewed source rollback. Retain the browser-privilege fix. The new database objects are additive; do not drop audit history, restore public grants, or re-run archived maintenance SQL as a generic rollback.

# Module system and rollout — 24 September 2026

## What is working

The site has 20 approved, built-in modules. Each module owns a manifest under `src/modules/<name>/manifest.tsx` with its routes, menu entries, and role ceiling. Pages load on demand as separate frontend chunks. A module's `id` is carried through the route and menu registry, so access rules hide navigation and block direct URLs.

The live Supabase catalog contains the same 20 IDs. Superadmins can open **Settings → Modules and access**, search active users, or choose a role, then set **Allow**, **Deny**, or **Inherit** for view, create, edit, delete, and export. Rules can be global or branch-specific. The screen shows recent changes. The backend independently checks access for mapped reads, writes, and account/document actions; hiding a menu is never the security boundary. A signed-in client reloads its visible permissions on focus and every 15 seconds.

The effective rule is chosen in this order: user and branch, user global, role and branch, role global, built-in default. A rule cannot exceed the existing role ceiling or data-scope checks. Denying `view` also denies the other actions. Superadmin access cannot be locked out by a rule. The database trigger records every access-rule insert, update, and deletion with the verified actor ID. No arbitrary executable code is stored in Supabase or uploaded through the admin screen.

This is an approved-module system, not a runtime package marketplace. Superadmins can assign and revoke installed capabilities for users. Developers still publish code changes through the normal frontend/backend release process. The frontend remains one Vite application; a module page's lazy chunk is a build artifact, not an independently deployable app.

## Current boundaries

| Layer | Location | Responsibility |
| --- | --- | --- |
| Module contract and registry | `src/modules/types.ts`, `src/modules/registry.ts`, `src/modules/*/manifest.tsx` | Routes, menu entries, and lazy page entry points |
| Client access state | `src/contexts/AuthContext.tsx` | Fetches effective access; blocks while unavailable; refreshes after changes |
| Route and menu gates | `src/components/layout/ProtectedRoute.tsx`, `src/components/layout/Sidebar.tsx` | Direct URL and navigation behavior |
| Superadmin editor | `src/pages/settings/ModuleAccessManager.tsx` | Search, rule edits, branch selection, change history |
| Access API | `supabase/functions/module-access/index.ts` | Authenticated catalog, effective access, rule edits, history |
| Backend policy | `supabase/functions/_shared/module-access.ts`, `module-guard.ts` | Module/action resolution and checks reused by Edge Functions |
| Database | `supabase/migrations/20260924121136_module_access_control.sql`, `20260924122636_preserve_existing_export_access.sql` | Approved catalog, grants, audit, existing export defaults |

Feature pages and services still live in shared `src/pages`, `src/components`, and `src/services` directories. They can be migrated into module-owned folders incrementally without changing route URLs or database IDs. The first candidates are Surveys, Library, and Reports because they are the largest or have clear feature boundaries. Shared auth, design system, account directory, branch scope, and audit primitives should remain in core packages.

## Adding a module safely

1. Choose a stable module ID and create `src/modules/<id>/manifest.tsx`. Register it in `src/modules/registry.ts`; use lazy page imports and include route/menu role ceilings. Do not reuse an ID for a different feature.
2. Add a migration that inserts the matching `app_modules` row with the narrowest view, write, and export role arrays. Keep IDs and labels stable in later migrations.
3. Map every associated table and Edge Function operation to a module and action in the shared policy. Keep existing row and branch scope checks; a module grant is an additional gate.
4. Add translations for menu and admin labels in English, Spanish, Catalan, and Dari. Add a direct-route access test, a policy test, and a database replay test.
5. Verify the complete flow using representative accounts: menu, direct URL, reads, create/edit/delete, exports, branch boundaries, revocation, and audit history. Deploy database, matching functions, and frontend in a coordinated release.

## Limits and next development work

1. **Finish physical feature isolation.** Move page-specific components and services beside each manifest, expose a small public entry point, and add import-boundary lint rules so unrelated modules cannot import internals. Do this one module at a time with a behavior baseline and focused tests.
2. **Keep backend operations declared.** The action gateway now uses an explicit operation-to-module map and rejects unknown operations. A regression test checks every handled action against the map. Extend the same declaration pattern when new Edge Functions are added.
3. **Improve export enforcement.** Built-in PDF/Excel buttons now respect export access, but data already visible in a browser can be copied. Move especially sensitive exports to an authenticated backend endpoint with export checks and audit events if a strict export policy is required.
4. **Test with actual role accounts in staging.** Automated tests cover resolver precedence, route denial, UI rendering, migration replay, and unauthenticated rejection. They do not yet prove every authenticated production workflow for all six roles and branches.
5. **Consider separate deployments only if needed.** Independent deployments would require a microfrontend or separately hosted application architecture, shared versioned contracts, and operational ownership. The present lazy-module approach keeps changes localized in source while avoiding that runtime complexity.

## Verified state

Both new migrations are present live in project `hzpivoubvfnrgqtovxoy` as versions `20260924121136` and `20260924122636`. Live catalog count is 20; live migration count is 77. The eight changed Edge Functions were deployed and their remote source packages matched local files. The two updated export defaults were queried live after deployment. The local frontend passed 141 tests, lint, translation coverage, a production build, and a disposable replay of all 77 migrations. The superadmin editor rendered in a local browser against fictional user fixtures without runtime errors. The frontend changes have **not** been deployed to hosting, and no real-user authenticated production test has been performed.

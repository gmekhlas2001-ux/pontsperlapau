/**
 * Authenticated, server-scoped read gateway for the SPA.
 *
 * The application uses its own HMAC session rather than Supabase Auth, so the
 * browser's Data API role is always `anon`. Direct anon SELECT grants would
 * therefore make RLS unable to distinguish users. This gateway verifies the
 * app session, reloads the active caller, applies role/tenant constraints, and
 * only then forwards a GET/HEAD request to PostgREST with the service role.
 */

import "jsr:@supabase/functions-js@2.110.0/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2.110.0";
import { authenticateRequest, authenticationErrorResponse } from "../_shared/auth.ts";
import { corsHeadersFor, errorResponse } from "../_shared/cors.ts";
import { validateDataReadSelect } from "../_shared/data-read-policy.ts";
import { ALLOWED_TABLES, ADMIN_ROLES, applyScope, type Caller } from "../_shared/data-read-scope.ts";
import { prepareDataReadTarget, dataReadHeaders } from "../_shared/data-read-request.ts";
import { canUseModule, TABLE_MODULE } from "../_shared/module-access.ts";

Deno.serve(async (req: Request) => {
  try {
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 200, headers: corsHeadersFor(req) });
    }
    if (req.method !== "GET" && req.method !== "HEAD") {
      return errorResponse(req, 405, "Method not allowed");
    }

    let claims;
    try {
      claims = await authenticateRequest(req);
    } catch (error) {
      return authenticationErrorResponse(req, error);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const client = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const caller: Caller = {
      id: claims.sub,
      role: claims.role,
      branch_id: claims.branchId,
    };

    let target: URL;
    try {
      target = prepareDataReadTarget(req, supabaseUrl);
    } catch {
      return errorResponse(req, 400, "Invalid data request");
    }
    const table = target.pathname.slice("/rest/v1/".length);
    if (!ALLOWED_TABLES.has(table)) return errorResponse(req, 403, "Data resource is not allowed");
    const moduleId = TABLE_MODULE[table];
    if (moduleId) {
      try {
        if (!await canUseModule(client, caller, moduleId, "view")) {
          return errorResponse(req, 403, "Module access is disabled");
        }
      } catch (error) {
        return errorResponse(req, 503, "Module access is temporarily unavailable", error);
      }
    }

    const select = target.searchParams.get("select") ?? "";
    const projectionError = validateDataReadSelect(table, select, caller);
    if (projectionError) return errorResponse(req, 403, projectionError);
    if (caller.role !== "superadmin" && /\buser_documents\b/i.test(select)) {
      return errorResponse(req, 403, "Document metadata is outside your scope");
    }
    if (!ADMIN_ROLES.includes(caller.role) && /\b(password_reset_requests|activity_logs)\b/i.test(select)) {
      return errorResponse(req, 403, "Administrative relations are outside your scope");
    }
    if (caller.role === "librarian" && /\b(students|attendance|grade_entries|student_fees|transactions|grants|grant_transactions|donors|surveys|survey_)\b/i.test(select)) {
      return errorResponse(req, 403, "Academic or financial relations are outside your scope");
    }
    if (table === "user_documents" && caller.role !== "superadmin" && (!select || select.includes("*") || /\bstorage_path\b/i.test(select))) {
      return errorResponse(req, 403, "Explicit safe document fields are required");
    }

    const allowed = await applyScope(client, caller, table, target.searchParams);
    if (!allowed) return errorResponse(req, 403, "Insufficient permissions");

    const forwardedHeaders = dataReadHeaders(req, serviceKey);

    const upstream = await fetch(target, { method: req.method, headers: forwardedHeaders, signal: AbortSignal.timeout(30_000) });
    const responseHeaders = new Headers({
      ...corsHeadersFor(req),
      "Cache-Control": "private, no-store",
      "Content-Type": upstream.headers.get("Content-Type") ?? "application/json",
    });
    for (const header of ["Content-Range", "Range-Unit", "Preference-Applied"]) {
      const value = upstream.headers.get(header);
      if (value) responseHeaders.set(header, value);
    }

    const body = req.method === "HEAD" ? null : await upstream.arrayBuffer();
    return new Response(body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders,
    });
  } catch (error) {
    return errorResponse(req, 500, "Data service error", error);
  }
});

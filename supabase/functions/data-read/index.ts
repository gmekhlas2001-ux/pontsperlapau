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
import { authenticateRequest } from "../_shared/auth.ts";
import { corsHeadersFor, errorResponse } from "../_shared/cors.ts";

const NO_MATCH = "00000000-0000-0000-0000-000000000000";
const STAFF_ROLES = ["superadmin", "admin", "teacher", "librarian"];
const ACADEMIC_ROLES = ["superadmin", "admin", "teacher"];
const ADMIN_ROLES = ["superadmin", "admin"];

const ALLOWED_TABLES = new Set([
  "activity_logs",
  "attendance",
  "book_borrowings",
  "books",
  "branches",
  "class_enrollments",
  "classes",
  "donors",
  "grade_entries",
  "grant_transactions",
  "grants",
  "messages",
  "organization_settings",
  "password_reset_requests",
  "roles",
  "staff",
  "student_fees",
  "students",
  "survey_branch_responses",
  "survey_branch_submissions",
  "survey_individual_responses",
  "survey_questions",
  "survey_respondents",
  "survey_response_options",
  "survey_sections",
  "surveys",
  "transactions",
  "user_documents",
  "users",
  "users_public",
]);

type Caller = {
  id: string;
  role: string;
  branch_id: string | null;
};

type Client = any;

function hasRole(caller: Caller, roles: string[]): boolean {
  return roles.includes(caller.role);
}

function appendEq(params: URLSearchParams, column: string, value: string | null): void {
  params.delete(column);
  params.append(column, `eq.${value ?? NO_MATCH}`);
}

function appendIn(params: URLSearchParams, column: string, ids: string[]): void {
  params.delete(column);
  params.append(column, `in.(${(ids.length ? ids : [NO_MATCH]).join(",")})`);
}

async function fetchIds(
  client: Client,
  table: string,
  column: string,
  configure: (query: any) => any,
): Promise<string[]> {
  const ids: string[] = [];
  const pageSize = 1000;

  for (let from = 0; from < 10_000; from += pageSize) {
    let query = client.from(table).select(column).order(column).range(from, from + pageSize - 1);
    query = configure(query);
    const { data, error } = await query;
    if (error) throw error;
    const page = (data ?? [])
      .map((row: Record<string, unknown>) => row[column])
      .filter((value: unknown): value is string => typeof value === "string");
    ids.push(...page);
    if (page.length < pageSize) break;
  }

  return ids;
}

async function studentIdsForCaller(client: Client, caller: Caller): Promise<string[]> {
  if (caller.role === "parent") {
    return fetchIds(client, "parent_student_links", "student_id", (query) =>
      query.eq("parent_user_id", caller.id)
    );
  }
  if (caller.role === "student") {
    return fetchIds(client, "students", "id", (query) =>
      query.eq("user_id", caller.id).is("deleted_at", null)
    );
  }
  return [];
}

async function branchClassIds(client: Client, branchId: string | null): Promise<string[]> {
  return fetchIds(client, "classes", "id", (query) =>
    query.eq("branch_id", branchId ?? NO_MATCH).is("deleted_at", null)
  );
}

async function assignedClassIds(client: Client, callerId: string): Promise<string[]> {
  const staffIds = await fetchIds(client, "staff", "id", (query) =>
    query.eq("user_id", callerId).is("deleted_at", null)
  );
  return fetchIds(client, "classes", "id", (query) =>
    query.in("teacher_id", staffIds.length ? staffIds : [NO_MATCH]).is("deleted_at", null)
  );
}

async function branchBookIds(client: Client, branchId: string | null): Promise<string[]> {
  return fetchIds(client, "books", "id", (query) =>
    query.eq("branch_id", branchId ?? NO_MATCH).is("deleted_at", null)
  );
}

async function branchGrantIds(client: Client, branchId: string | null): Promise<string[]> {
  return fetchIds(client, "grants", "id", (query) =>
    query.eq("branch_id", branchId ?? NO_MATCH)
  );
}

async function branchSurveyIds(client: Client, branchId: string | null): Promise<string[]> {
  return fetchIds(client, "surveys", "id", (query) =>
    query.eq("branch_id", branchId ?? NO_MATCH)
  );
}

async function applyScope(
  client: Client,
  caller: Caller,
  table: string,
  params: URLSearchParams,
): Promise<boolean> {
  const isGlobal = caller.role === "superadmin";

  if (table === "users" || table === "users_public") {
    if (isGlobal) return true;
    const select = params.get("select") ?? "";
    const requestsPrivateProfile = /\b(email|father_name|phone_number|date_of_birth|gender|passport_number|last_login|is_verified|two_factor_enabled)\b/i.test(select);
    if (caller.role === "admin" || (["teacher", "librarian"].includes(caller.role) && !requestsPrivateProfile)) {
      appendEq(params, "branch_id", caller.branch_id);
    } else {
      appendEq(params, "id", caller.id);
    }
    return true;
  }

  if (table === "branches") {
    if (!isGlobal) appendEq(params, "id", caller.branch_id);
    return true;
  }

  if (table === "staff") {
    if (hasRole(caller, STAFF_ROLES)) {
      if (!isGlobal) appendEq(params, "branch_id", caller.branch_id);
      return true;
    }
    appendEq(params, "user_id", caller.id);
    return true;
  }

  if (table === "students") {
    if (hasRole(caller, ACADEMIC_ROLES)) {
      if (!isGlobal) appendEq(params, "branch_id", caller.branch_id);
      return true;
    }
    if (caller.role === "student" || caller.role === "parent") {
      appendIn(params, "id", await studentIdsForCaller(client, caller));
      return true;
    }
    return false;
  }

  if (table === "classes") {
    if (caller.role === "teacher") {
      appendIn(params, "id", await assignedClassIds(client, caller.id));
      return true;
    }
    if (hasRole(caller, ["superadmin", "admin"])) {
      if (!isGlobal) appendEq(params, "branch_id", caller.branch_id);
      return true;
    }
    if (caller.role === "student") {
      const studentIds = await studentIdsForCaller(client, caller);
      const classIds = await fetchIds(client, "class_enrollments", "class_id", (query) =>
        query.in("student_id", studentIds.length ? studentIds : [NO_MATCH]).eq("status", "active")
      );
      appendIn(params, "id", classIds);
      return true;
    }
    return false;
  }

  if (["class_enrollments", "attendance", "grade_entries"].includes(table)) {
    if (caller.role === "teacher") {
      appendIn(params, "class_id", await assignedClassIds(client, caller.id));
      return true;
    }
    if (hasRole(caller, ["superadmin", "admin"])) {
      if (!isGlobal) appendIn(params, "class_id", await branchClassIds(client, caller.branch_id));
      return true;
    }
    if (caller.role === "student" || caller.role === "parent") {
      appendIn(params, "student_id", await studentIdsForCaller(client, caller));
      return true;
    }
    return false;
  }

  if (table === "books") {
    if (![...STAFF_ROLES, "student"].includes(caller.role)) return false;
    if (!isGlobal) appendEq(params, "branch_id", caller.branch_id);
    return true;
  }

  if (table === "book_borrowings") {
    if (hasRole(caller, STAFF_ROLES)) {
      if (!isGlobal) appendIn(params, "book_id", await branchBookIds(client, caller.branch_id));
      return true;
    }
    if (caller.role === "student") {
      appendEq(params, "borrower_id", caller.id);
      return true;
    }
    return false;
  }

  if (table === "student_fees") {
    if (hasRole(caller, ACADEMIC_ROLES)) {
      if (!isGlobal) appendEq(params, "branch_id", caller.branch_id);
      return true;
    }
    if (caller.role === "student" || caller.role === "parent") {
      appendIn(params, "student_id", await studentIdsForCaller(client, caller));
      return true;
    }
    return false;
  }

  if (table === "messages") {
    if (!hasRole(caller, STAFF_ROLES)) return false;
    if (!isGlobal) params.append("or", `(branch_id.eq.${caller.branch_id ?? NO_MATCH},branch_id.is.null)`);
    params.append("or", `(sender_id.eq.${caller.id},recipient_id.eq.${caller.id},recipient_id.is.null)`);
    return true;
  }

  if (table === "transactions") {
    if (!hasRole(caller, ADMIN_ROLES)) return false;
    if (!isGlobal) {
      const branchId = caller.branch_id ?? NO_MATCH;
      params.append("or", `(sender_branch_id.eq.${branchId},receiver_branch_id.eq.${branchId})`);
    }
    return true;
  }

  if (table === "grants") {
    if (!hasRole(caller, ADMIN_ROLES)) return false;
    if (!isGlobal) appendEq(params, "branch_id", caller.branch_id);
    return true;
  }

  if (table === "grant_transactions") {
    if (!hasRole(caller, ADMIN_ROLES)) return false;
    if (!isGlobal) appendIn(params, "grant_id", await branchGrantIds(client, caller.branch_id));
    return true;
  }

  if (table === "donors") {
    if (!hasRole(caller, ADMIN_ROLES)) return false;
    if (!isGlobal) {
      const grantIds = await branchGrantIds(client, caller.branch_id);
      const donorIds = await fetchIds(client, "grants", "donor_id", (query) =>
        query.in("id", grantIds.length ? grantIds : [NO_MATCH])
      );
      params.append("or", `(branch_id.eq.${caller.branch_id ?? NO_MATCH},id.in.(${(donorIds.length ? donorIds : [NO_MATCH]).join(",")}))`);
    }
    return true;
  }

  if (table === "surveys") {
    if (!hasRole(caller, ADMIN_ROLES)) return false;
    if (!isGlobal) appendEq(params, "branch_id", caller.branch_id);
    return true;
  }

  if (["survey_sections", "survey_questions", "survey_response_options"].includes(table)) {
    if (!hasRole(caller, ADMIN_ROLES)) return false;
    if (!isGlobal) appendIn(params, "survey_id", await branchSurveyIds(client, caller.branch_id));
    return true;
  }

  if ([
    "survey_branch_responses",
    "survey_branch_submissions",
    "survey_individual_responses",
    "survey_respondents",
  ].includes(table)) {
    if (!hasRole(caller, ADMIN_ROLES)) return false;
    if (!isGlobal) appendEq(params, "branch_id", caller.branch_id);
    return true;
  }

  if (table === "activity_logs") {
    if (!hasRole(caller, ADMIN_ROLES)) return false;
    if (!isGlobal) {
      const userIds = await fetchIds(client, "users", "id", (query) =>
        query.eq("branch_id", caller.branch_id ?? NO_MATCH)
      );
      appendIn(params, "user_id", userIds);
    }
    return true;
  }

  if (table === "password_reset_requests") {
    if (!hasRole(caller, ADMIN_ROLES)) return false;
    if (!isGlobal) {
      const userIds = await fetchIds(client, "users", "id", (query) =>
        query.eq("branch_id", caller.branch_id ?? NO_MATCH)
      );
      appendIn(params, "user_id", userIds);
    }
    return true;
  }

  if (["organization_settings", "roles", "user_documents"].includes(table)) {
    return isGlobal;
  }

  return false;
}

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
      return errorResponse(req, 401, "Authentication required", error);
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

    const requestUrl = new URL(req.url);
    const rawPath = requestUrl.searchParams.get("path");
    if (!rawPath || rawPath.length > 8000 || !rawPath.startsWith("/rest/v1/")) {
      return errorResponse(req, 400, "Invalid data path");
    }

    const target = new URL(rawPath, supabaseUrl);
    const table = decodeURIComponent(target.pathname.slice("/rest/v1/".length));
    if (!/^[a-z_]+$/.test(table) || !ALLOWED_TABLES.has(table)) {
      return errorResponse(req, 403, "Data resource is not allowed");
    }

    const select = target.searchParams.get("select") ?? "";
    const lowerSelect = select.toLowerCase();
    if (lowerSelect.includes("password_hash") || lowerSelect.includes("session_token") || lowerSelect.includes("two_factor_secret")) {
      return errorResponse(req, 403, "Sensitive fields are strictly prohibited from being read");
    }
    if (table === "users" && (!select || select.includes("*"))) {
      return errorResponse(req, 403, "Explicit safe user fields are required");
    }
    if (/users[^,(]*\([^)]*\*/i.test(select)) {
      return errorResponse(req, 403, "Wildcard user relations are not readable");
    }
    if (caller.role !== "superadmin" && /\buser_documents\b/i.test(select)) {
      return errorResponse(req, 403, "Document metadata is outside your scope");
    }
    if (!ADMIN_ROLES.includes(caller.role) && /\b(password_reset_requests|activity_logs)\b/i.test(select)) {
      return errorResponse(req, 403, "Administrative relations are outside your scope");
    }
    if (caller.role === "librarian" && /\b(students|attendance|grade_entries|student_fees|transactions|grants|grant_transactions|donors|surveys|survey_)\b/i.test(select)) {
      return errorResponse(req, 403, "Academic or financial relations are outside your scope");
    }

    const allowed = await applyScope(client, caller, table, target.searchParams);
    if (!allowed) return errorResponse(req, 403, "Insufficient permissions");

    const forwardedHeaders = new Headers({
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
      Accept: req.headers.get("Accept") ?? "application/json",
    });
    for (const header of ["Accept-Profile", "Content-Profile", "Prefer", "Range", "Range-Unit"]) {
      const value = req.headers.get(header);
      if (value) forwardedHeaders.set(header, value);
    }

    const upstream = await fetch(target, { method: req.method, headers: forwardedHeaders });
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

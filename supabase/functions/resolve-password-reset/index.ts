/**
 * Resolve or reject a password reset request.
 *
 * Auth: requires X-Session-Token issued by /login.
 * Authorization:
 *   - superadmin: can resolve/reject any request
 *   - admin (branch-scoped): can resolve/reject only requests whose
 *     target user belongs to their branch
 *   - everyone else: 403
 *
 * Operations:
 *   { requestId, operation: "resolve", newPassword, note? }
 *     -> hashes the new password, updates the user, marks request resolved
 *   { requestId, operation: "reject", note? }
 *     -> marks request rejected, no password change
 *
 * All happens against the service role so the anon-blocked RLS policy
 * on password_reset_requests is bypassed safely.
 */

import "jsr:@supabase/functions-js@2.110.0/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2.110.0";
import { authenticateRequest } from "../_shared/auth.ts";
import { corsHeadersFor, errorResponse, jsonResponse } from "../_shared/cors.ts";

interface Body {
  requestId: string;
  operation: "resolve" | "reject";
  newPassword?: string;
  note?: string;
}

const PRIVILEGED = ["superadmin", "admin"];

Deno.serve(async (req: Request) => {
  try {
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 200, headers: corsHeadersFor(req) });
    }
    if (req.method !== "POST") return errorResponse(req, 405, "Method not allowed");

    let claims;
    try {
      claims = await authenticateRequest(req);
    } catch (err) {
      return errorResponse(req, 401, "Authentication required", err);
    }
    let body: Body;
    try { body = await req.json(); } catch {
      return errorResponse(req, 400, "Invalid request body");
    }
    if (!body.requestId || !body.operation) {
      return errorResponse(req, 400, "Missing requestId or operation");
    }
    if (body.operation !== "resolve" && body.operation !== "reject") {
      return errorResponse(req, 400, "Invalid operation");
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // Re-load caller (token claims could be stale).
    const { data: caller } = await supabase
      .from("users")
      .select("id, role, status, branch_id")
      .eq("id", claims.sub)
      .eq("status", "active")
      .maybeSingle();
    if (!caller) return errorResponse(req, 401, "Authentication required");
    if (!PRIVILEGED.includes(caller.role)) {
      return errorResponse(req, 403, "Insufficient permissions");
    }
    if (caller.role === "admin" && !caller.branch_id) {
      return errorResponse(req, 403, "Admin account is missing a branch");
    }

    // Load the request row.
    const { data: reqRow, error: reqErr } = await supabase
      .from("password_reset_requests")
      .select("id, user_id, status, email_tried")
      .eq("id", body.requestId)
      .maybeSingle();
    if (reqErr || !reqRow) {
      return errorResponse(req, 404, "Request not found", reqErr);
    }
    if (reqRow.status !== "pending") {
      return errorResponse(req, 409, "Request is already " + reqRow.status);
    }

    // Branch-scoping: a non-superadmin must share a branch with the target user.
    if (caller.role === "admin" && !reqRow.user_id) {
      return errorResponse(req, 403, "Only a superadmin can handle unmatched requests");
    }
    if (caller.role === "admin" && reqRow.user_id) {
      const { data: target } = await supabase
        .from("users")
        .select("id, role, branch_id")
        .eq("id", reqRow.user_id)
        .maybeSingle();
      if (!target) return errorResponse(req, 404, "Target user not found");
      if (PRIVILEGED.includes(target.role)) {
        return errorResponse(req, 403, "Only a superadmin can reset administrator passwords");
      }
      if (target.branch_id !== caller.branch_id) {
        return errorResponse(req, 403, "User is in a different branch");
      }
    }

    const note = (body.note ?? "").trim().slice(0, 1000) || null;

    // ── REJECT ─────────────────────────────────────────────────────
    if (body.operation === "reject") {
      const { error } = await supabase
        .from("password_reset_requests")
        .update({
          status: "rejected",
          resolved_by: caller.id,
          resolved_at: new Date().toISOString(),
          resolved_note: note,
        })
        .eq("id", reqRow.id);
      if (error) return errorResponse(req, 500, "Failed to reject request", error);
      return jsonResponse(req, { success: true });
    }

    // ── RESOLVE ────────────────────────────────────────────────────
    if (!reqRow.user_id) {
      return errorResponse(req, 400, "Request has no associated user — reject it instead");
    }
    if (!body.newPassword || body.newPassword.length < 8) {
      return errorResponse(req, 400, "Password must be at least 8 characters");
    }

    // Hash + write the new password.
    const { data: hashData, error: hashError } = await supabase
      .rpc("hash_password", { password: body.newPassword });
    if (hashError || !hashData) {
      return errorResponse(req, 500, "Failed to hash password", hashError);
    }
    const { error: resolveError } = await supabase.rpc("resolve_password_reset_atomic", {
      p_request_id: reqRow.id,
      p_user_id: reqRow.user_id,
      p_password_hash: hashData as string,
      p_resolved_by: caller.id,
      p_note: note,
    });
    if (resolveError) return errorResponse(req, 409, "Password reset request is no longer pending", resolveError);

    return jsonResponse(req, { success: true });
  } catch (err) {
    console.error("[resolve-password-reset] uncaught:", err);
    return errorResponse(req, 500, "Service error", err);
  }
});

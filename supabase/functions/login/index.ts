/**
 * Login Edge Function
 *
 * @endpoint POST /functions/v1/login
 * @auth     Public (no session token required)
 * @rate     8 failed attempts per email / 30 per IP within a 15-minute window
 *
 * Handles user authentication and session token issuance. This server-side
 * approach replaces the previous client-side `verify_password` RPC call to
 * enforce security controls that cannot be bypassed by a malicious client:
 *
 *   1. Dual-axis rate limiting (per-email AND per-IP) to mitigate brute-force
 *      and credential-stuffing attacks without blocking legitimate users.
 *   2. Constant-time response path — even for nonexistent accounts — to
 *      prevent timing-based account enumeration.
 *   3. HMAC-signed session tokens scoped to user identity + role + branch,
 *      replacing stateless Supabase JWTs for tighter access control.
 *
 * @returns {{ success, token, user }} on valid credentials
 * @returns {401} on invalid credentials (generic message to prevent leakage)
 * @returns {403} when valid credentials are not permitted in this portal
 * @returns {429} when rate limit is exceeded, with a Retry-After header
 */

import "jsr:@supabase/functions-js@2.110.0/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2.110.0";
import { corsHeadersFor, errorResponse, jsonResponse } from "../_shared/cors.ts";
import { issueSessionToken } from "../_shared/auth.ts";

interface LoginRequest {
  email: string;
  password: string;
}

// ── Rate-limit thresholds ──────────────────────────────────────────────────
// These values balance security with usability. Per-email limits protect
// individual accounts; per-IP limits block distributed credential-stuffing
// from a single origin without penalizing shared networks excessively.
const MAX_FAILS_PER_EMAIL = 8;
const MAX_FAILS_PER_IP    = 30;
const RATE_WINDOW_MIN     = 15;

Deno.serve(async (req: Request) => {
  try {
  // ── CORS preflight ────────────────────────────────────────────────
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeadersFor(req) });
  }
  if (req.method !== "POST") {
    return errorResponse(req, 405, "Method not allowed");
  }

  // Service-role client bypasses RLS — required to read password hashes
  // and write audit records regardless of row-level policies.
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  // Extract client IP for rate-limit tracking. Prefers X-Forwarded-For
  // (set by reverse proxies / Supabase gateway) then CF-Connecting-IP.
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim()
          ?? req.headers.get("cf-connecting-ip")
          ?? "unknown";

  let body: LoginRequest;
  try {
    body = await req.json();
  } catch {
    return errorResponse(req, 400, "Invalid request body");
  }

  const email = (body.email ?? "").trim().toLowerCase();
  const password = body.password ?? "";

  if (!email || !password || email.length > 320 || password.length > 1024) {
    return errorResponse(req, 400, "Email and password are required");
  }

  // ── Rate limiting ─────────────────────────────────────────────────
  // Both per-email and per-IP windows are checked. Windows look back
  // RATE_WINDOW_MIN minutes and only count failed attempts.
  const since = new Date(Date.now() - RATE_WINDOW_MIN * 60_000).toISOString();

  const [emailFails, ipFails] = await Promise.all([
    supabase.from("login_attempts").select("id", { count: "exact", head: true })
      .eq("email", email).eq("success", false).gte("created_at", since),
    supabase.from("login_attempts").select("id", { count: "exact", head: true })
      .eq("ip", ip).eq("success", false).gte("created_at", since),
  ]);

  // Fail-open: if the rate-limit query itself fails (e.g. Supabase outage),
  // log the error but allow the login attempt to proceed. Blocking all users
  // from logging in during infrastructure issues is worse than temporarily
  // losing rate-limit protection.
  if (emailFails.error || ipFails.error) {
    console.error("[login] rate-limit check failed (proceeding without rate limit):", emailFails.error ?? ipFails.error);
  }

  if ((emailFails.count ?? 0) >= MAX_FAILS_PER_EMAIL ||
      (ipFails.count   ?? 0) >= MAX_FAILS_PER_IP) {
    // Constant-time-ish: still wait a bit before responding.
    await new Promise((r) => setTimeout(r, 750));
    const retryAfterSeconds = RATE_WINDOW_MIN * 60;
    return new Response(JSON.stringify({
      error: "Too many failed attempts. Try again in 15 minutes.",
      code: "rate_limited",
      retryAfterSeconds,
    }), {
      status: 429,
      headers: {
        ...corsHeadersFor(req),
        "Content-Type": "application/json",
        "Retry-After": String(retryAfterSeconds),
      },
    });
  }

  // ── Lookup user ───────────────────────────────────────────────────
  const { data: user } = await supabase
    .from("users")
    .select("id, email, first_name, last_name, role, status, branch_id, profile_picture_url, password_hash")
    .eq("email", email)
    .eq("status", "active")
    .maybeSingle();

  // ── Constant-time password verification ────────────────────────────
  // Security: always execute a bcrypt comparison regardless of whether the
  // account exists. This prevents attackers from distinguishing "email not
  // found" from "wrong password" via response-time analysis.
  let passwordValid = false;
  if (user?.password_hash) {
    const { data } = await supabase.rpc("verify_password", {
      user_email: email,
      user_password: password,
    });
    passwordValid = !!data;
  } else {
    // Burn equivalent CPU time against a dummy account so the response
    // latency is indistinguishable from a real verification.
    try {
      await supabase.rpc("verify_password", {
        user_email: "__nope__@example.invalid",
        user_password: password,
      });
    } catch { /* expected — no such user */ }
  }

  // ── Audit + record attempt ───────────────────────────────────────
  try {
    const { error: insErr } = await supabase.from("login_attempts").insert({
      email,
      ip,
      // A correct password is not a failed attempt even when this particular
      // portal does not authorize the user's role.
      success: passwordValid,
    });
    if (insErr) console.error("login_attempts insert failed:", insErr);
  } catch (err) {
    console.error("login_attempts insert threw:", err);
  }

  if (!passwordValid || !user) {
    return errorResponse(req, 401, "Invalid email or password");
  }

  // Students use a separate flow. Only disclose this after the password has
  // been verified, so the response cannot be used to enumerate accounts.
  if (user.role === "student") {
    return jsonResponse(req, {
      error: "Student accounts cannot access the management portal.",
      code: "student_portal_disabled",
    }, 403);
  }

  // ── Mint session token ────────────────────────────────────────────
  // The token embeds user ID, role, and branch — giving downstream edge
  // functions enough context for authorization without a DB roundtrip.
  let token: string;
  try {
    const { data: timeoutSetting } = await supabase
      .from("organization_settings")
      .select("setting_value")
      .eq("setting_key", "session_timeout_minutes")
      .maybeSingle();
    const requestedMinutes = Number(timeoutSetting?.setting_value ?? 60);
    const timeoutMinutes = Number.isFinite(requestedMinutes)
      ? Math.min(1440, Math.max(5, Math.floor(requestedMinutes)))
      : 60;
    const sessionId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + timeoutMinutes * 60_000).toISOString();
    const { error: sessionError } = await supabase.from("app_sessions").insert({
      id: sessionId,
      user_id: user.id,
      expires_at: expiresAt,
    });
    if (sessionError) throw sessionError;
    token = await issueSessionToken({
      id: user.id,
      role: user.role,
      branch_id: user.branch_id,
    }, sessionId, timeoutMinutes * 60);
  } catch (err) {
    return errorResponse(req, 500, "Login service misconfigured", err);
  }

  // Best-effort analytics — failure here must not block the login.
  try {
    await supabase.rpc("update_last_login", { p_user_id: user.id });
  } catch (err) {
    console.error("update_last_login failed:", err);
  }

  return jsonResponse(req, {
    success: true,
    token,
    user: {
      id: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      role: user.role,
      avatar: user.profile_picture_url,
      branchId: user.branch_id ?? null,
    },
  });
  } catch (err) {
    console.error("[login] uncaught:", err);
    return errorResponse(req, 500, "Login service error", err);
  }
});

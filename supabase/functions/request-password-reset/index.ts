/**
 * Forgot-password requests.
 *
 * Public endpoint (no session token). Anyone who knows an email address
 * can submit a request. To avoid:
 *   - account enumeration: response is always success-shaped, regardless
 *     of whether the email matches a real user
 *   - flooding: rate-limited per email and per IP
 *
 * On success we insert a row into password_reset_requests. A superadmin
 * reviews pending requests in the dashboard and either sets a new
 * password (via update-user) or rejects the request.
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeadersFor, errorResponse, jsonResponse } from "../_shared/cors.ts";

interface RequestBody {
  email: string;
  reason?: string;
}

const MAX_REQUESTS_PER_EMAIL = 3;
const MAX_REQUESTS_PER_IP    = 10;
const RATE_WINDOW_MIN        = 60;

Deno.serve(async (req: Request) => {
  try {
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 200, headers: corsHeadersFor(req) });
    }
    if (req.method !== "POST") {
      return errorResponse(req, 405, "Method not allowed");
    }

    let body: RequestBody;
    try { body = await req.json(); } catch {
      return errorResponse(req, 400, "Invalid request body");
    }

    const email = (body.email ?? "").trim().toLowerCase();
    const reason = (body.reason ?? "").trim().slice(0, 500) || null;

    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      return errorResponse(req, 400, "Invalid email");
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim()
            ?? req.headers.get("cf-connecting-ip")
            ?? "unknown";

    const since = new Date(Date.now() - RATE_WINDOW_MIN * 60_000).toISOString();

    const [emailCt, ipCt] = await Promise.all([
      supabase.from("password_reset_requests").select("id", { count: "exact", head: true })
        .eq("email_tried", email).gte("created_at", since),
      supabase.from("password_reset_requests").select("id", { count: "exact", head: true })
        .eq("ip", ip).gte("created_at", since),
    ]);

    if ((emailCt.count ?? 0) >= MAX_REQUESTS_PER_EMAIL ||
        (ipCt.count   ?? 0) >= MAX_REQUESTS_PER_IP) {
      // Same success shape — don't leak rate limit either.
      return jsonResponse(req, { success: true });
    }

    // Look up user — but never reveal whether it exists.
    const { data: user } = await supabase
      .from("users")
      .select("id")
      .eq("email", email)
      .eq("status", "active")
      .maybeSingle();

    try {
      const { error: insErr } = await supabase.from("password_reset_requests").insert({
        user_id: user?.id ?? null,
        email_tried: email,
        reason,
        ip,
        status: "pending",
      });
      if (insErr) console.error("[reset-request] insert failed:", insErr);
    } catch (err) {
      console.error("[reset-request] insert threw:", err);
    }

    // Always success-shaped to prevent account enumeration.
    return jsonResponse(req, { success: true });
  } catch (err) {
    console.error("[request-password-reset] uncaught:", err);
    return errorResponse(req, 500, "Service error", err);
  }
});

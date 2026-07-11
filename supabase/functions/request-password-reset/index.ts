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

import "jsr:@supabase/functions-js@2.110.0/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2.110.0";
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

    if (!email || email.length > 320 || !/^\S+@\S+\.\S+$/.test(email)) {
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

    const { error: requestError } = await supabase.rpc("create_password_reset_if_allowed", {
      p_email: email,
      p_ip: ip,
      p_reason: reason,
      p_since: since,
      p_email_limit: MAX_REQUESTS_PER_EMAIL,
      p_ip_limit: MAX_REQUESTS_PER_IP,
    });
    if (requestError) {
      return errorResponse(req, 503, "Password reset is temporarily unavailable", requestError);
    }

    // Always success-shaped to prevent account enumeration.
    return jsonResponse(req, { success: true });
  } catch (err) {
    console.error("[request-password-reset] uncaught:", err);
    return errorResponse(req, 500, "Service error", err);
  }
});

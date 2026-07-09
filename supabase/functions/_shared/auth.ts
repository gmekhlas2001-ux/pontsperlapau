/**
 * Shared HMAC session token utilities for edge functions.
 *
 * Tokens look like:   <base64url(payload)>.<base64url(hmac-sha256(payload))>
 * Payload (JSON) is:  { sub: <userId>, sid, role, branchId, iat, exp }
 *
 * The signing key comes from the SESSION_TOKEN_SECRET env var (set in
 * Supabase project secrets). Tokens are short-lived (default 60 minutes) so
 * a leaked token has limited blast radius.
 *
 * Edge functions call `verifySessionToken(req)` first thing — it returns
 * the verified payload or throws. Never trust X-User-Id without a paired
 * token: that header is now informational only.
 */

import { createClient } from "jsr:@supabase/supabase-js@2.110.0";

const enc = new TextEncoder();
const dec = new TextDecoder();

const DEFAULT_TTL_SECONDS = 60 * 60;

export interface TokenPayload {
  sub: string;        // user id
  sid: string;        // server-side revocable session id
  role: string;
  branchId: string | null;
  iat: number;        // issued-at (unix seconds)
  exp: number;        // expires-at (unix seconds)
}

function b64urlEncode(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): Uint8Array<ArrayBuffer> {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  const raw = atob(s);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function getKey(): Promise<CryptoKey> {
  const secret = Deno.env.get("SESSION_TOKEN_SECRET");
  if (!secret || secret.length < 32) {
    throw new Error(
      "SESSION_TOKEN_SECRET is missing or too short (min 32 chars). " +
      "Set it in Supabase project secrets.",
    );
  }
  return crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

/** Mint a token for a successful login. */
export async function issueSessionToken(
  user: { id: string; role: string; branch_id: string | null },
  sessionId: string,
  ttlSeconds = DEFAULT_TTL_SECONDS,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload: TokenPayload = {
    sub: user.id,
    sid: sessionId,
    role: user.role,
    branchId: user.branch_id,
    iat: now,
    exp: now + ttlSeconds,
  };

  const json = JSON.stringify(payload);
  const payloadB64 = b64urlEncode(enc.encode(json));

  const key = await getKey();
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payloadB64));
  const sigB64 = b64urlEncode(new Uint8Array(sig));

  return `${payloadB64}.${sigB64}`;
}

/** Verify a token signature + expiry. Throws if invalid. */
export async function verifySessionToken(token: string): Promise<TokenPayload> {
  const parts = token.split(".");
  if (parts.length !== 2) throw new Error("Malformed session token");

  const [payloadB64, sigB64] = parts;
  const key = await getKey();
  const ok = await crypto.subtle.verify(
    "HMAC",
    key,
    b64urlDecode(sigB64),
    enc.encode(payloadB64),
  );
  if (!ok) throw new Error("Invalid session token signature");

  const json = dec.decode(b64urlDecode(payloadB64));
  const payload = JSON.parse(json) as TokenPayload;

  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== "number" || payload.exp < now) {
    throw new Error("Session token expired");
  }
  if (!payload.sub || !payload.sid || !payload.role) {
    throw new Error("Session token missing required claims");
  }
  return payload;
}

/**
 * Pull and verify a session token from the request.
 * Looks for the X-Session-Token header.
 */
export async function authenticateRequest(req: Request): Promise<TokenPayload> {
  const token = req.headers.get("X-Session-Token");
  if (!token) throw new Error("Missing X-Session-Token header");
  const payload = await verifySessionToken(token);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceKey) throw new Error("Session validation is misconfigured");

  const client = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: session, error } = await client
    .from("app_sessions")
    .select("expires_at, revoked_at, user:users!user_id(role, branch_id, status, session_invalid_before)")
    .eq("id", payload.sid)
    .eq("user_id", payload.sub)
    .maybeSingle();

  if (error) {
    console.error("[auth] session DB check failed:", error);
    throw new Error("Session validation failed");
  }

  const user = Array.isArray(session?.user) ? session?.user[0] : session?.user;
  if (
    !session ||
    session.revoked_at ||
    new Date(session.expires_at).getTime() <= Date.now() ||
    !user ||
    user.status !== "active"
  ) throw new Error("Session is no longer active");

  const invalidBefore = Math.ceil(new Date(user.session_invalid_before).getTime() / 1000);
  if (Number.isFinite(invalidBefore) && payload.iat < invalidBefore) {
    throw new Error("Session has been revoked");
  }

  return {
    ...payload,
    role: user.role,
    branchId: user.branch_id ?? null,
  };
}

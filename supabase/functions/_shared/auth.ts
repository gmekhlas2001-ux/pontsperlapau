/**
 * Shared HMAC session token utilities for edge functions.
 *
 * Tokens look like:   <base64url(payload)>.<base64url(hmac-sha256(payload))>
 * Payload (JSON) is:  { sub: <userId>, role, branchId, iat, exp }
 *
 * The signing key comes from the SESSION_TOKEN_SECRET env var (set in
 * Supabase project secrets). Tokens are short-lived (default 12 hours) so
 * a leaked token has limited blast radius.
 *
 * Edge functions call `verifySessionToken(req)` first thing — it returns
 * the verified payload or throws. Never trust X-User-Id without a paired
 * token: that header is now informational only.
 */

const enc = new TextEncoder();
const dec = new TextDecoder();

const DEFAULT_TTL_SECONDS = 12 * 60 * 60; // 12h

interface TokenPayload {
  sub: string;        // user id
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
  ttlSeconds = DEFAULT_TTL_SECONDS,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload: TokenPayload = {
    sub: user.id,
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
  if (!payload.sub || !payload.role) {
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
  return verifySessionToken(token);
}

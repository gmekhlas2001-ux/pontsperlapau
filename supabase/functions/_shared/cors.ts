/**
 * CORS helper. Allowed origins come from the ALLOWED_ORIGINS env var,
 * comma-separated. Falls back to "*" only when explicitly enabled by
 * setting `ALLOWED_ORIGINS=*` (NOT recommended in production).
 *
 * Set in Supabase project secrets:
 *   ALLOWED_ORIGINS=https://pxpmanagement.es,http://localhost:5173
 */

function getAllowedOrigins(): string[] {
  const raw = Deno.env.get("ALLOWED_ORIGINS") ?? "";
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

export function corsHeadersFor(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  const allowed = getAllowedOrigins();

  const allowAll = allowed.length === 1 && allowed[0] === "*";
  const allowOrigin = allowAll
    ? "*"
    : (allowed.includes(origin) ? origin : allowed[0] ?? "");

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey, X-User-Id, X-Session-Token",
    "Vary": "Origin",
  };
}

export function jsonResponse(
  req: Request,
  body: unknown,
  status = 200,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeadersFor(req), "Content-Type": "application/json" },
  });
}

/**
 * Generic error response. Logs the real cause server-side and sends a
 * non-leaky message to the client.
 */
export function errorResponse(
  req: Request,
  status: number,
  publicMessage: string,
  internalError?: unknown,
): Response {
  if (internalError) {
    console.error(`[edge-error ${status}] ${publicMessage}:`, internalError);
  }
  return jsonResponse(req, { error: publicMessage }, status);
}

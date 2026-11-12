import { pickAllowedOrigin, PRODUCTION_ORIGIN } from "./logic.ts";

export function corsHeaders(req: Request, extraOrigin?: string): Record<string, string> {
  const origin = pickAllowedOrigin(req.headers.get("origin") ?? req.headers.get("Origin"), extraOrigin);
  const allow = origin ?? PRODUCTION_ORIGIN;
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-host-key, x-upload-token",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

export function withCors(req: Request, res: Response, extraOrigin?: string): Response {
  const headers = new Headers(res.headers);
  const c = corsHeaders(req, extraOrigin);
  for (const [k, v] of Object.entries(c)) headers.set(k, v);
  return new Response(res.body, { status: res.status, headers });
}

export function preflight(req: Request, extraOrigin?: string): Response {
  return new Response(null, { status: 204, headers: corsHeaders(req, extraOrigin) });
}

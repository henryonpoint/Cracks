import { NextRequest } from "next/server";

/**
 * Single-user v1 auth: a shared secret (CAPTURE_TOKEN) sent from the phone
 * Shortcut / Android share target / laptop bookmarklet.
 *
 * Accepts the token via either:
 *   - Authorization: Bearer <token>
 *   - ?token=<token>  (needed for the Web Share Target form POST, which can't set headers)
 */
export function isAuthorized(req: NextRequest): boolean {
  const expected = process.env.CAPTURE_TOKEN;
  if (!expected) return false; // fail closed if unconfigured

  const header = req.headers.get("authorization");
  if (header?.startsWith("Bearer ") && safeEqual(header.slice(7), expected)) {
    return true;
  }

  const urlToken = req.nextUrl.searchParams.get("token");
  if (urlToken && safeEqual(urlToken, expected)) return true;

  return false;
}

/**
 * Auth for background/cron endpoints (process, insights, resurface). Accepts the
 * Vercel-injected CRON_SECRET or the CAPTURE_TOKEN (so you can trigger by hand).
 */
export function isBackgroundAuthorized(req: NextRequest): boolean {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return false;
  const presented = auth.slice(7);
  const cronSecret = process.env.CRON_SECRET;
  const captureToken = process.env.CAPTURE_TOKEN;
  if (cronSecret && safeEqual(presented, cronSecret)) return true;
  if (captureToken && safeEqual(presented, captureToken)) return true;
  return false;
}

// Constant-time-ish comparison to avoid trivial timing leaks.
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

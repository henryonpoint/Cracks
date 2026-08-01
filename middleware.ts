import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionValue } from "@/lib/session";

/**
 * Gates the web UI behind the single-user session. Left open (each has its own
 * auth or is inherently public):
 *   - /login                     the sign-in page + its server action
 *   - /api/capture               token-gated (CAPTURE_TOKEN)
 *   - /api/process|insights|resurface  background-token-gated (CRON_SECRET/CAPTURE_TOKEN)
 *   - /share-target              SW fallback; bounces into the app
 *   - static files (have a .ext) and /_next/* (excluded by the matcher)
 *
 * Fails closed: if AUTH_PASSWORD is unset, no session can validate, so the UI
 * stays locked until it's configured.
 */
const OPEN_API_PREFIXES = [
  "/api/capture",
  "/api/process",
  "/api/insights",
  "/api/resurface",
  "/share-target",
];

function isOpenPath(pathname: string): boolean {
  if (pathname === "/login") return true;
  if (OPEN_API_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return true;
  }
  // Static assets served from /public (sw.js, manifest.webmanifest, icons, …).
  if (/\.[a-z0-9]+$/i.test(pathname)) return true;
  return false;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (isOpenPath(pathname)) return NextResponse.next();

  const secret = process.env.AUTH_PASSWORD;
  const ok = await verifySessionValue(req.cookies.get(SESSION_COOKIE)?.value, secret);
  if (ok) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  if (pathname !== "/") url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};

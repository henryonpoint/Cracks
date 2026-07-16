import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Normally the service worker intercepts POST /share-target and forwards it to
// /api/capture with the saved token. This route only runs as a fallback if the
// SW isn't active yet (e.g. the very first share after install). We can't
// authenticate here (no token), so we send the user into the app so the SW
// registers, then they can re-share.
export async function POST(req: NextRequest) {
  return NextResponse.redirect(new URL("/?share_error=1", req.url), 303);
}

export async function GET(req: NextRequest) {
  return NextResponse.redirect(new URL("/", req.url), 303);
}

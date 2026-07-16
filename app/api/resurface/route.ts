import { NextRequest, NextResponse } from "next/server";
import { isBackgroundAuthorized } from "@/lib/auth";
import { scheduleResurfacings } from "@/lib/resurface";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Queue a few older, on-theme saves to bubble back up in the feed.
 * Wired to Vercel Cron; also triggerable by hand with the CAPTURE_TOKEN.
 */
export async function GET(req: NextRequest) {
  if (!isBackgroundAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const created = await scheduleResurfacings();
  return NextResponse.json({ ok: true, scheduled: created });
}

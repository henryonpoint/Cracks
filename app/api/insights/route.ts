import { NextRequest, NextResponse } from "next/server";
import { isBackgroundAuthorized } from "@/lib/auth";
import { rebuildInterestProfile, synthesizeInsight } from "@/lib/interests";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Recompute the interest profile, then (re)synthesize the narrative digest.
 * Wired to Vercel Cron; also triggerable by hand with the CAPTURE_TOKEN.
 */
export async function GET(req: NextRequest) {
  if (!isBackgroundAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const themeCount = await rebuildInterestProfile();
  await synthesizeInsight();

  return NextResponse.json({ ok: true, themes: themeCount });
}

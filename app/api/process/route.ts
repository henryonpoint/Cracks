import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { processItem } from "@/lib/process";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Retry worker. Picks up items that are still pending/failed (e.g. the
 * post-response processing was killed, or the URL was temporarily down) and
 * reprocesses them. Wire this to Vercel Cron (see vercel.json) or hit it manually.
 *
 * Auth: the CRON_SECRET header that Vercel Cron sends, or the same
 * Authorization: Bearer as capture, so you can trigger it by hand.
 */
export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const stuck = await prisma.item.findMany({
    where: { status: { in: ["pending", "failed"] } },
    orderBy: { createdAt: "asc" },
    take: 5, // small batch to stay under the function time budget
  });

  const results: { id: string; ok: boolean; error?: string }[] = [];
  for (const item of stuck) {
    try {
      await processItem(item.id);
      results.push({ id: item.id, ok: true });
    } catch (err) {
      results.push({
        id: item.id,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return NextResponse.json({ processed: results.length, results });
}

function authorized(req: NextRequest): boolean {
  const auth = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  const captureToken = process.env.CAPTURE_TOKEN;
  if (cronSecret && auth === `Bearer ${cronSecret}`) return true;
  if (captureToken && auth === `Bearer ${captureToken}`) return true;
  return false;
}

import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { prisma } from "@/lib/db";
import { isAuthorized } from "@/lib/auth";
import { processItem } from "@/lib/process";
import { rateLimit, clientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Cap captures per IP to blunt cost/DoS abuse (each save = a fetch + a Claude call).
const CAPTURE_LIMIT = 30;
const CAPTURE_WINDOW_MS = 60_000;

interface CaptureBody {
  url?: string;
  title?: string;
  text?: string;
}

// A URL can arrive in any of these fields depending on the sender.
function extractUrl(b: CaptureBody): string | null {
  for (const candidate of [b.url, b.text, b.title]) {
    if (candidate) {
      const match = candidate.match(/https?:\/\/[^\s]+/);
      if (match) return match[0];
    }
  }
  return null;
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const limit = rateLimit(`capture:${clientIp(req.headers)}`, CAPTURE_LIMIT, CAPTURE_WINDOW_MS);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "rate limited" },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } },
    );
  }

  const contentType = req.headers.get("content-type") ?? "";
  const isForm =
    contentType.includes("form-urlencoded") || contentType.includes("form-data");

  let body: CaptureBody;
  if (isForm) {
    const form = await req.formData();
    body = {
      url: str(form.get("url")),
      title: str(form.get("title")),
      text: str(form.get("text")),
    };
  } else {
    body = (await req.json().catch(() => ({}))) as CaptureBody;
  }

  const url = extractUrl(body);
  const hasNote = Boolean(body.text?.trim() || body.title?.trim());
  if (!url && !hasNote) {
    return NextResponse.json({ error: "nothing to capture" }, { status: 400 });
  }

  const item = await prisma.item.create({
    data: {
      url: url ?? undefined,
      title: body.title?.trim() || undefined,
      // A pasted note with no URL keeps its text as the body to summarize.
      rawText: !url && body.text?.trim() ? body.text.trim() : undefined,
      status: "pending",
    },
  });

  // Analyze after the response is sent so the share sheet dismisses instantly.
  // Serverless keeps the function alive for after() callbacks; the cron route
  // re-picks anything that still fails.
  after(async () => {
    try {
      await processItem(item.id);
    } catch {
      // already recorded on the item as status=failed
    }
  });

  // Web Share Target performs a navigation — send the browser to the feed.
  if (isForm) {
    return NextResponse.redirect(new URL("/?captured=1", req.url), 303);
  }
  return NextResponse.json({ id: item.id, status: "pending" }, { status: 201 });
}

function str(v: FormDataEntryValue | null): string | undefined {
  return typeof v === "string" && v.trim() ? v : undefined;
}

/**
 * Minimal in-memory fixed-window rate limiter. Per-process only, so on
 * serverless it caps each warm instance rather than the fleet — enough to blunt
 * abuse of the unauthenticated capture paths (each save costs a fetch + a Claude
 * call) without new infrastructure. Swap for a shared store (Upstash/Redis) if
 * this ever needs to be global.
 */
type Window = { count: number; resetAt: number };

const windows = new Map<string, Window>();
const MAX_KEYS = 10_000;

export interface RateLimitResult {
  ok: boolean;
  retryAfterSec: number;
}

export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const existing = windows.get(key);

  if (!existing || now > existing.resetAt) {
    // Opportunistic cleanup so the map can't grow without bound.
    if (windows.size > MAX_KEYS) {
      for (const [k, w] of windows) if (now > w.resetAt) windows.delete(k);
    }
    windows.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfterSec: 0 };
  }

  if (existing.count >= limit) {
    return { ok: false, retryAfterSec: Math.ceil((existing.resetAt - now) / 1000) };
  }

  existing.count += 1;
  return { ok: true, retryAfterSec: 0 };
}

/** Best-effort client IP from proxy headers; falls back to a shared bucket. */
export function clientIp(headers: Headers): string {
  const fwd = headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return headers.get("x-real-ip")?.trim() || "unknown";
}

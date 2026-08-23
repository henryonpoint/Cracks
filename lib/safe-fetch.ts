import dns from "node:dns/promises";
import net from "node:net";

/**
 * SSRF guard for fetching user-supplied URLs.
 *
 * Cracks fetches arbitrary URLs that come from capture input. Without a guard,
 * an attacker (the capture endpoint and the add box both reach this) can make
 * the server request internal addresses — cloud metadata (169.254.169.254),
 * loopback, or RFC1918 hosts — and exfiltrate the response via the summary.
 *
 * This blocks non-http(s) schemes and any host that resolves to a private,
 * loopback, or link-local address, and it re-validates on every redirect hop
 * (redirect: "manual") so a public URL can't 30x into an internal one.
 *
 * Residual risk: DNS rebinding between the lookup and the socket connect is not
 * fully closed (that needs connecting to a pinned IP with a Host header, which
 * fetch does not expose). Acceptable for single-user scale; revisit if the app
 * ever serves untrusted multi-tenant traffic.
 */

const MAX_REDIRECTS = 5;

function isBlockedIPv4(ip: string): boolean {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return true;
  const [a, b] = p;
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // loopback
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64/10
  if (a === 169 && b === 254) return true; // link-local incl. cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16/12
  if (a === 192 && b === 168) return true; // 192.168/16
  if (a === 192 && b === 0) return true; // 192.0.0.0/24, 192.0.2.0/24
  if (a >= 224) return true; // multicast + reserved
  return false;
}

function isBlockedIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === "::" || lower === "::1") return true; // unspecified, loopback
  if (lower.startsWith("fe80")) return true; // link-local
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // unique local fc00::/7
  // IPv4-mapped (::ffff:a.b.c.d) — validate the embedded v4.
  const mapped = lower.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isBlockedIPv4(mapped[1]);
  return false;
}

function isBlockedAddress(ip: string): boolean {
  const kind = net.isIP(ip);
  if (kind === 4) return isBlockedIPv4(ip);
  if (kind === 6) return isBlockedIPv6(ip);
  return true; // not a resolvable literal — refuse
}

async function assertPublicUrl(raw: string): Promise<void> {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error("invalid URL");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new Error("unsupported URL scheme");
  }
  const host = u.hostname.replace(/^\[|\]$/g, ""); // strip IPv6 brackets

  // If the host is already an IP literal, check it directly.
  if (net.isIP(host)) {
    if (isBlockedAddress(host)) throw new Error("blocked address");
    return;
  }

  const results = await dns.lookup(host, { all: true });
  if (results.length === 0) throw new Error("host did not resolve");
  for (const { address } of results) {
    if (isBlockedAddress(address)) throw new Error("blocked address");
  }
}

export interface SafeFetchOptions {
  headers?: Record<string, string>;
  timeoutMs?: number;
}

/**
 * fetch() that validates the target (and each redirect hop) is a public host
 * before connecting. Follows redirects manually so intermediate hops can't
 * escape the guard.
 */
export async function safeFetch(url: string, opts: SafeFetchOptions = {}): Promise<Response> {
  const { headers, timeoutMs = 15_000 } = opts;
  let current = url;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublicUrl(current);

    const res = await fetch(current, {
      headers,
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) return res;
      current = new URL(location, current).toString();
      continue;
    }
    return res;
  }
  throw new Error("too many redirects");
}

/**
 * Read a response body as text, but stop after `maxBytes` so a huge or
 * slow-drip response can't exhaust memory.
 */
export async function readTextCapped(res: Response, maxBytes: number): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return "";

  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        chunks.push(value.subarray(0, value.byteLength - (total - maxBytes)));
        await reader.cancel();
        break;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock?.();
  }

  const merged = new Uint8Array(chunks.reduce((n, c) => n + c.byteLength, 0));
  let offset = 0;
  for (const c of chunks) {
    merged.set(c, offset);
    offset += c.byteLength;
  }
  return new TextDecoder().decode(merged);
}

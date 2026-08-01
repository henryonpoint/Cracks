/**
 * Single-user session token: a signed, expiring cookie value. No user table —
 * one shared password (AUTH_PASSWORD) gates the whole UI. Uses Web Crypto so it
 * runs in both the Edge middleware and Node server actions.
 *
 * Cookie value: `<issuedAtMs>.<base64url(HMAC-SHA256(issuedAtMs))>`, signed with
 * AUTH_PASSWORD. If AUTH_PASSWORD is unset, verification always fails (closed).
 */
export const SESSION_COOKIE = "cracks_session";
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

const encoder = new TextEncoder();

function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sign(data: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  return base64url(new Uint8Array(sig));
}

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

export async function createSessionValue(secret: string): Promise<string> {
  const issued = Date.now().toString();
  return `${issued}.${await sign(issued, secret)}`;
}

export async function verifySessionValue(
  value: string | undefined | null,
  secret: string | undefined | null,
): Promise<boolean> {
  if (!value || !secret) return false;
  const dot = value.lastIndexOf(".");
  if (dot <= 0) return false;
  const issued = value.slice(0, dot);
  const providedSig = value.slice(dot + 1);
  const issuedMs = Number(issued);
  if (!Number.isFinite(issuedMs)) return false;
  if (Date.now() - issuedMs > SESSION_TTL_MS) return false;
  const expectedSig = await sign(issued, secret);
  return timingSafeEqual(providedSig, expectedSig);
}

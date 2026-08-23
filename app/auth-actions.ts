"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  SESSION_COOKIE,
  SESSION_TTL_MS,
  createSessionValue,
  timingSafeEqual,
} from "@/lib/session";

// Only allow same-site, non-protocol-relative redirect targets.
function safeNext(raw: FormDataEntryValue | null): string {
  const v = typeof raw === "string" ? raw : "";
  if (v.startsWith("/") && !v.startsWith("//")) return v;
  return "/";
}

export async function login(formData: FormData) {
  const password = String(formData.get("password") ?? "");
  const next = safeNext(formData.get("next"));
  const expected = process.env.AUTH_PASSWORD;

  // Fail closed if unconfigured; constant-time compare otherwise.
  if (!expected || !timingSafeEqual(password, expected)) {
    redirect(`/login?error=1${next !== "/" ? `&next=${encodeURIComponent(next)}` : ""}`);
  }

  const store = await cookies();
  store.set(SESSION_COOKIE, await createSessionValue(expected), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });

  redirect(next);
}

export async function logout() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  redirect("/login");
}

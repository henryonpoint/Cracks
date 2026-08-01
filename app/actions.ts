"use server";

import { after } from "next/server";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { processItem } from "@/lib/process";
import { rateLimit, clientIp } from "@/lib/rate-limit";

const ADD_LIMIT = 30;
const ADD_WINDOW_MS = 60_000;

/**
 * Server action for the in-app "add" box (desktop capture). Runs behind the
 * session middleware, so the caller is already authenticated; rate-limited per
 * IP as defense-in-depth against a runaway client (each save = fetch + Claude call).
 */
export async function addItem(formData: FormData) {
  const raw = String(formData.get("input") ?? "").trim();
  if (!raw) return;

  const ip = clientIp(await headers());
  if (!rateLimit(`add:${ip}`, ADD_LIMIT, ADD_WINDOW_MS).ok) return;

  const urlMatch = raw.match(/https?:\/\/[^\s]+/);
  const url = urlMatch ? urlMatch[0] : null;

  const item = await prisma.item.create({
    data: {
      url: url ?? undefined,
      rawText: url ? undefined : raw, // no URL → treat as a note
      status: "pending",
    },
  });

  revalidatePath("/");

  after(async () => {
    try {
      await processItem(item.id);
    } catch {
      // recorded on the item as status=failed
    }
  });
}

// Dismiss a resurfaced item so it stops bubbling up.
export async function dismissResurfacing(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await prisma.resurfacing.update({
    where: { id },
    data: { dismissed: true, shownAt: new Date() },
  });
  revalidatePath("/");
}

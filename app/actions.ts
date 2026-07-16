"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { processItem } from "@/lib/process";

/**
 * Server action for the in-app "add" box (laptop capture). Runs on the server,
 * so no capture token is exposed to the browser — the token guards only the
 * external /api/capture endpoint used by the phone Shortcut / share target.
 */
export async function addItem(formData: FormData) {
  const raw = String(formData.get("input") ?? "").trim();
  if (!raw) return;

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

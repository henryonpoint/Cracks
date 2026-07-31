"use client";

import { useEffect, useState } from "react";

// Stores the capture token in IndexedDB so the service worker can read it when
// forwarding a shared link. Kept out of the public manifest on purpose.
function idbSet(key: string, value: string): Promise<void> {
  return new Promise((resolve) => {
    const open = indexedDB.open("cracks", 1);
    open.onupgradeneeded = () => open.result.createObjectStore("kv");
    open.onsuccess = () => {
      const tx = open.result.transaction("kv", "readwrite");
      tx.objectStore("kv").put(value, key);
      tx.oncomplete = () => resolve();
    };
    open.onerror = () => resolve();
  });
}

function idbGet(key: string): Promise<string | null> {
  return new Promise((resolve) => {
    const open = indexedDB.open("cracks", 1);
    open.onupgradeneeded = () => open.result.createObjectStore("kv");
    open.onsuccess = () => {
      const tx = open.result.transaction("kv", "readonly");
      const req = tx.objectStore("kv").get(key);
      req.onsuccess = () => resolve((req.result as string) ?? null);
      req.onerror = () => resolve(null);
    };
    open.onerror = () => resolve(null);
  });
}

export function SettingsBox({ startOpen = false }: { startOpen?: boolean }) {
  const [open, setOpen] = useState(startOpen);
  const [token, setToken] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    idbGet("captureToken").then((t) => t && setToken(t));
  }, []);

  return (
    <details
      open={open}
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
      className="mb-6 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm dark:border-slate-800 dark:bg-slate-900"
    >
      <summary className="cursor-pointer select-none font-medium text-ink-soft dark:text-slate-300">
        Phone capture setup
      </summary>
      <p className="mt-2 text-xs text-ink-soft dark:text-slate-400">
        Paste your capture token so shared links from your phone are accepted. It&apos;s stored only on
        this device.
      </p>
      <div className="mt-2 flex gap-2">
        <input
          type="password"
          value={token}
          onChange={(e) => {
            setToken(e.target.value);
            setSaved(false);
          }}
          placeholder="CAPTURE_TOKEN"
          className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-accent dark:border-slate-700 dark:bg-slate-950"
        />
        <button
          onClick={async () => {
            await idbSet("captureToken", token.trim());
            setSaved(true);
          }}
          className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
        >
          {saved ? "Saved ✓" : "Save"}
        </button>
      </div>
    </details>
  );
}

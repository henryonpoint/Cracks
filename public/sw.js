// Service worker for Cracks.
// Optional Android/Chrome path only — primary capture is iOS Shortcut + desktop
// add box. When the installed PWA is used as a Web Share Target, the browser
// POSTs to /share-target; we intercept, attach the saved capture token, and
// forward to /api/capture.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

// --- tiny IndexedDB key/value (the token is stored by the in-app settings box) ---
function idbGet(key) {
  return new Promise((resolve) => {
    const open = indexedDB.open("cracks", 1);
    open.onupgradeneeded = () => open.result.createObjectStore("kv");
    open.onsuccess = () => {
      const tx = open.result.transaction("kv", "readonly");
      const req = tx.objectStore("kv").get(key);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => resolve(null);
    };
    open.onerror = () => resolve(null);
  });
}

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method === "POST" && url.pathname === "/share-target") {
    event.respondWith(handleShare(event.request));
  }
  // Everything else: let the network handle it (no offline caching in v1).
});

async function handleShare(request) {
  try {
    const form = await request.formData();
    const token = await idbGet("captureToken");

    const body = new URLSearchParams();
    for (const field of ["title", "text", "url"]) {
      const v = form.get(field);
      if (typeof v === "string" && v) body.set(field, v);
    }

    const headers = { "Content-Type": "application/x-www-form-urlencoded" };
    if (token) headers["Authorization"] = "Bearer " + token;

    const res = await fetch("/api/capture", { method: "POST", headers, body });

    // Success or not, send the user to the feed (with a hint if unauthorized).
    const dest = res.ok || res.status === 303 ? "/?captured=1" : "/?needs_token=1";
    return Response.redirect(dest, 303);
  } catch {
    return Response.redirect("/?share_error=1", 303);
  }
}

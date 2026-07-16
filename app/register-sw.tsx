"use client";

import { useEffect } from "react";

// Registers the service worker that backs PWA install + the Web Share Target.
export function RegisterSW() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // non-fatal: the app still works without the SW, just no share target/offline
      });
    }
  }, []);
  return null;
}

"use client";

import { useEffect } from "react";

// Registers the service worker for the optional Android/Chrome Web Share Target.
// Primary capture (iOS Shortcut + desktop add box) does not depend on this.
export function RegisterSW() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // non-fatal: app still works; only optional Android share target is affected
      });
    }
  }, []);
  return null;
}

"use client";

import { useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(callback: () => void): () => void {
  const mq = window.matchMedia(QUERY);
  mq.addEventListener("change", callback);
  return () => mq.removeEventListener("change", callback);
}

function getSnapshot(): boolean {
  return window.matchMedia(QUERY).matches;
}

// No window on the server — reduced motion is a client-only browser
// preference, so the SSR/first-paint snapshot is always "no preference."
function getServerSnapshot(): boolean {
  return false;
}

/** useSyncExternalStore (not useState+useEffect) — the value React
 * recommends for exactly this shape: reading an external, synchronously-
 * available browser API and re-rendering on its change event. Avoids ever
 * needing to set state from inside an effect body at all (the previous
 * version's `setPrefersReduced(mq.matches)` call at effect start was
 * flagged as an impure-during-effect pattern). */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

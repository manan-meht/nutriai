"use client";

import { useEffect, useRef } from "react";
import { track } from "@/lib/landing/track";

/** One coach_landing_view per page load.
 *
 * GA4 already sends page_view automatically, so this is not a duplicate of
 * it — it carries foundingSpotsRemaining, which page_view cannot, and which
 * is the property that answers whether the scarcity is doing any work.
 */
export function PageView({ spotsRemaining }: { spotsRemaining: number }) {
  const fired = useRef(false);
  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    track("coach_landing_view", { foundingSpotsRemaining: spotsRemaining });
  }, [spotsRemaining]);
  return null;
}

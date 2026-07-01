"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Progress (0→1) through the scroll BUDGET of a sticky container.
 * p=0 the moment the outer div pins (top at viewport top).
 * p=1 when the budget is fully consumed (outer div bottom at viewport top).
 *
 * Use this on a single large outer div that wraps all scenes so there are
 * no gaps between chapters — one sticky viewport, all scenes inside.
 */
export function useChapterScroll(
  ref: React.RefObject<HTMLElement | null>
): number {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    function update() {
      const rect = el!.getBoundingClientRect();
      const budget = rect.height - window.innerHeight;
      if (budget <= 0) return;
      const scrolled = -rect.top;
      setProgress(Math.max(0, Math.min(scrolled / budget, 1)));
    }

    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update, { passive: true });
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [ref]);

  return progress;
}

/** Map a value from one range to another, clamped to [0,1] internally. */
export function mapRange(
  value: number,
  inMin: number,
  inMax: number,
  outMin: number,
  outMax: number
): number {
  const t = Math.max(0, Math.min((value - inMin) / (inMax - inMin), 1));
  return outMin + (outMax - outMin) * t;
}

"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Returns a 0–1 scroll progress value for the given element.
 * 0 = top of element at viewport bottom (just entering)
 * 1 = bottom of element at viewport top (fully scrolled past)
 */
export function useScrollProgress(
  ref: React.RefObject<HTMLElement | null>
): number {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    function update() {
      const rect = el!.getBoundingClientRect();
      const windowHeight = window.innerHeight;
      const total = rect.height + windowHeight;
      const scrolled = windowHeight - rect.top;
      setProgress(Math.max(0, Math.min(scrolled / total, 1)));
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

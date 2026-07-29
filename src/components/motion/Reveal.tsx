"use client";

import React, { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "./useReducedMotion";

interface RevealProps {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  threshold?: number;
  direction?: "up" | "left" | "right";
}

const TRANSLATE: Record<NonNullable<RevealProps["direction"]>, string> = {
  up: "translateY(32px)",
  left: "translateX(-48px)",
  right: "translateX(48px)",
};

export function Reveal({
  children,
  className = "",
  delay = 0,
  threshold = 0.12,
  direction = "up",
}: RevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const reduced = useReducedMotion();

  useEffect(() => {
    // No need to setVisible(true) here — the render below already treats
    // `reduced` as visible via `visible || reduced`, so skipping observer
    // setup entirely is enough; this also removes the only setState-
    // during-effect call this component had.
    if (reduced) return;
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          const t = setTimeout(() => setVisible(true), delay);
          observer.disconnect();
          return () => clearTimeout(t);
        }
      },
      { threshold }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [delay, threshold, reduced]);

  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: visible || reduced ? 1 : 0,
        transform: visible || reduced ? "none" : TRANSLATE[direction],
        transition: reduced ? "none" : "opacity 0.7s ease, transform 0.7s ease",
      }}
    >
      {children}
    </div>
  );
}

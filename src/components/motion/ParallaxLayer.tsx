"use client";

import React, { useRef } from "react";
import { useScrollProgress } from "./useScrollProgress";
import { useReducedMotion } from "./useReducedMotion";

interface ParallaxLayerProps {
  children: React.ReactNode;
  speed?: number; // negative = slower than scroll (standard parallax), positive = faster
  className?: string;
}

/**
 * Applies a vertical parallax offset to children based on scroll position.
 * No-ops when prefers-reduced-motion is set.
 */
export function ParallaxLayer({ children, speed = -0.3, className = "" }: ParallaxLayerProps) {
  const ref = useRef<HTMLDivElement>(null);
  const progress = useScrollProgress(ref);
  const reduced = useReducedMotion();

  const offset = reduced ? 0 : progress * speed * 100;

  return (
    <div
      ref={ref}
      className={className}
      style={{
        transform: `translateY(${offset}px)`,
        willChange: reduced ? "auto" : "transform",
      }}
    >
      {children}
    </div>
  );
}

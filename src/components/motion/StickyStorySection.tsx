"use client";

import React, { useRef } from "react";
import { useScrollProgress } from "./useScrollProgress";
import { useReducedMotion } from "./useReducedMotion";

interface StoryStep {
  label: string;
  content: React.ReactNode;
}

interface StickyStorySectionProps {
  steps: StoryStep[];
  stickyVisual: (stepIndex: number, progress: number) => React.ReactNode;
  className?: string;
}

/**
 * Scroll-driven sticky storytelling section.
 * The visual panel stays fixed while the copy advances step by step.
 * With reduced motion, all steps render in a simple column layout.
 */
export function StickyStorySection({
  steps,
  stickyVisual,
  className = "",
}: StickyStorySectionProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const progress = useScrollProgress(containerRef);
  const reduced = useReducedMotion();

  const activeIndex = Math.min(
    Math.floor(progress * steps.length),
    steps.length - 1
  );

  if (reduced) {
    return (
      <div className={`flex flex-col gap-16 ${className}`}>
        {steps.map((step, i) => (
          <div key={i} className="flex flex-col gap-6 md:flex-row md:items-start">
            <div className="md:w-1/2">{step.content}</div>
            <div className="md:w-1/2">{stickyVisual(i, 1)}</div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`relative ${className}`}
      style={{ minHeight: `${steps.length * 80}vh` }}
    >
      {/* Sticky visual panel */}
      <div className="sticky top-0 h-screen flex items-center justify-end pointer-events-none">
        <div className="w-1/2 h-full flex items-center justify-center p-8">
          {stickyVisual(activeIndex, progress)}
        </div>
      </div>

      {/* Scrollable copy */}
      <div className="absolute top-0 left-0 w-1/2 flex flex-col">
        {steps.map((step, i) => (
          <div
            key={i}
            className="min-h-[80vh] flex flex-col justify-center px-8 py-16 transition-opacity duration-500"
            style={{ opacity: i === activeIndex ? 1 : 0.3 }}
          >
            <p className="text-sm font-semibold uppercase tracking-widest mb-4 opacity-60">
              {step.label}
            </p>
            {step.content}
          </div>
        ))}
      </div>
    </div>
  );
}

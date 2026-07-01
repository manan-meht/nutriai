"use client";

/**
 * Client-side performance-aware variant refinement.
 *
 * Run AFTER the server has selected a candidate variant.
 * If the server chose "immersive" but the browser signals limited capability,
 * this returns "standard" as the effective variant.
 *
 * Strategy: render the standard shell first, then call this hook. If the
 * result is "immersive", swap in the immersive page. This avoids a visible
 * flash and prevents hydration errors because the server never hard-codes
 * the variant into HTML that must be preserved exactly.
 */

export interface PerformanceSignals {
  saveData: boolean;
  effectiveType: "slow-2g" | "2g" | "3g" | "4g" | "unknown";
  deviceMemoryGb: number | null;
  prefersReducedMotion: boolean;
  viewportWidth: number;
}

export function collectPerformanceSignals(): PerformanceSignals {
  const nav = navigator as any;
  const connection = nav.connection ?? nav.mozConnection ?? nav.webkitConnection;

  return {
    saveData: connection?.saveData === true,
    effectiveType: connection?.effectiveType ?? "unknown",
    deviceMemoryGb: nav.deviceMemory ?? null,
    prefersReducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    viewportWidth: window.innerWidth,
  };
}

export type PerformanceVariantDecision = "immersive" | "standard" | "reduced_motion_immersive";

export function resolveClientVariant(
  serverVariant: "standard" | "immersive",
  signals: PerformanceSignals
): PerformanceVariantDecision {
  if (serverVariant === "standard") return "standard";

  // Hard-degrade conditions
  if (signals.saveData) return "standard";
  if (signals.effectiveType === "slow-2g" || signals.effectiveType === "2g") return "standard";
  if (signals.deviceMemoryGb !== null && signals.deviceMemoryGb < 1) return "standard";

  // Reduced motion — show immersive but without motion
  if (signals.prefersReducedMotion) return "reduced_motion_immersive";

  return "immersive";
}

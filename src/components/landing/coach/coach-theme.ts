import { Montserrat } from "next/font/google";

/** The Momentum Dark Premium palette, from the approved Stitch design.
 *
 * Scoped to this subtree rather than added to globals: Tistra Health and
 * the Tistra Club marketplace both run light palettes, and a dark theme in
 * globals.css would leak into them.
 *
 * Self-hosted by next/font at build time — no runtime font CDN, matching
 * how the club deck loads Hanken Grotesk. Montserrat carries the display
 * type; body copy stays on the app's existing system stack, which is
 * already what Inter falls back to.
 */
export const display = Montserrat({
  subsets: ["latin"],
  weight: ["600", "700", "900"],
  display: "swap",
  variable: "--coach-display",
});

export const T = {
  surface: "#0A0A0A",
  surfaceDim: "#131313",
  surfaceContainerLowest: "#0E0E0E",
  surfaceContainer: "#1C1C1C",
  surfaceContainerHigh: "#252525",
  onSurface: "#FFFFFF",
  onSurfaceVariant: "#A1A1A1",
  outlineVariant: "#4A4455",
  /** Light lavender — the accent that reads on black. */
  primary: "#D2BBFF",
  onPrimary: "#3F008E",
  /** Saturated purple, for filled CTAs and the commission block. */
  primaryContainer: "#630ED4",
  primaryPop: "#7F27FF",
} as const;

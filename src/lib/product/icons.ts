import type { ProductType } from "@/types";

/**
 * Per-product favicon paths. Dedicated route segments (src/app/(gym)/icon.png,
 * src/app/(adults)/icon.png, src/app/icon.png) already cover their own
 * static favicon via Next's file convention. This map exists specifically
 * for the shared (public) routes ("/", "/login", "/signup") — a single
 * physical route that renders gym/adults/unified content dynamically based
 * on hostname or ?product=, so the favicon must be set per-request via
 * generateMetadata's `icons` field rather than a static file.
 */
export function faviconForProduct(product: ProductType | null): string {
  if (product === "gym") return "/logos/logo-purple.png";
  if (product === "adults") return "/logos/logo-purple.png";
  return "/logos/logo-black.png";
}

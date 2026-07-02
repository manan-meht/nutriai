import type { ProductType } from "@/types";

const GYM_DOMAINS = new Set([
  "coach.tistrahealth.com",
  "gym.nutritionplatform.com",
  "brand-gym.com",
  "gym.localhost",
]);

const ADULTS_DOMAINS = new Set([
  "family.tistrahealth.com",
  "family.nutritionplatform.com",
  "brand-adults.com",
  "adults.localhost",
]);

/**
 * Resolves which product is active.
 * Checks hostname first, then ?product= query param (dev only), then env var.
 */
export function resolveProductFromHostname(
  hostname: string,
  searchParams?: URLSearchParams
): ProductType | null {
  const host = hostname.split(":")[0].toLowerCase();

  if (GYM_DOMAINS.has(host) || host.startsWith("gym.")) return "gym";
  if (ADULTS_DOMAINS.has(host) || host.startsWith("adults.") || host.startsWith("family.")) return "adults";

  // ?product= override — works in all environments when no subdomain is configured
  if (searchParams) {
    const qp = searchParams.get("product");
    if (qp === "gym" || qp === "adults") return qp;
  }

  // Env-var override
  const envProduct = process.env.NEXT_PUBLIC_PRODUCT as ProductType | undefined;
  if (envProduct === "gym" || envProduct === "adults") return envProduct;

  return null;
}

/**
 * Returns the canonical domain for a product.
 */
export function getProductDomain(product: ProductType): string {
  if (product === "gym") {
    return process.env.NEXT_PUBLIC_GYM_DOMAIN ?? "coach.tistrahealth.com";
  }
  return process.env.NEXT_PUBLIC_FAMILY_DOMAIN ?? "family.tistrahealth.com";
}

/**
 * Builds the URL to switch to the other product.
 * In production: switches domain.
 * In local dev: uses ?product= query param on the same origin.
 */
export function getCrossProductSwitchUrl(
  currentProduct: ProductType,
  path = "/"
): string {
  const targetProduct: ProductType = currentProduct === "gym" ? "adults" : "gym";

  const gymDomain = process.env.NEXT_PUBLIC_GYM_DOMAIN;
  const familyDomain = process.env.NEXT_PUBLIC_FAMILY_DOMAIN;
  const hasSeparateDomains =
    gymDomain && familyDomain && gymDomain !== familyDomain;

  if (!hasSeparateDomains || process.env.NODE_ENV === "development") {
    return `${path}?product=${targetProduct}`;
  }

  const domain = getProductDomain(targetProduct);
  return `https://${domain}${path}`;
}

import { isClubHost } from "@/lib/club/host";
import { resolveProductFromHostnameOnly } from "@/lib/product/resolve-product";

/** Auth surfaces that share this app's Supabase project.
 *
 * "adults" is the only scoped one: its accounts carry a +nutriai-adults tag
 * so the same person can hold a separate Tistra Health family workspace.
 * "gym" (Tistra Coach) and "club" (Tistra Club) deliberately share the
 * BASE, untagged identity — a coach and a club member are meant to be one
 * account, with a free account booking sessions and a paid one adding
 * nutrition tracking. Scoping club would mint a second user per person,
 * which is exactly what the marketplace spec forbids.
 */
export type AuthSurface = "gym" | "adults" | "club";

export function scopedEmail(email: string, product: AuthSurface): string {
  if (product === "gym" || product === "club") return email;
  const at = email.lastIndexOf("@");
  return `${email.slice(0, at)}+nutriai-adults${email.slice(at)}`;
}

// Strip the product scope tag for display purposes
export function displayEmail(email: string): string {
  return email.replace(/\+nutriai-[^@]+(?=@)/, "");
}

/** Which sign-in surface a signup/login request belongs to.
 *
 * Host first, then an explicit ?product=, then Tistra Health. It
 * deliberately does NOT fall through to resolveProductFromHostname's
 * NEXT_PUBLIC_PRODUCT fallback, which is "gym" at build time and made
 * https://tistrahealth.com/signup render "Create a Tistra Coach account" —
 * on the Health domain, carrying the coach product's Google tag.
 *
 * The rules, in order:
 *   1. A dedicated host is unambiguous. coach.tistra.club is a coach
 *      signup and stays one; tistra.club is a club signup.
 *   2. An explicit ?product= wins on a neutral host, including the
 *      user-facing aliases used in CTA links (family/me → adults,
 *      coach → gym).
 *   3. tistrahealth.com, with nothing else to go on, is Tistra Health —
 *      which means adults, covering both the self and family flows.
 *
 * Shared rather than duplicated: signup and login each had their own copy
 * of this, so the bug had to be fixed twice or not at all.
 */
export function resolveAuthSurface(hostname: string, params: URLSearchParams): AuthSurface {
  if (isClubHost(hostname)) return "club";
  if (params.get("product") === "club") return "club";

  const byHost = resolveProductFromHostnameOnly(hostname);
  if (byHost) return byHost;

  const qp = params.get("product");
  if (qp === "gym" || qp === "coach") return "gym";
  if (qp === "adults" || qp === "family" || qp === "me") return "adults";

  return "adults";
}

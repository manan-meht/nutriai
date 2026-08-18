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

import { supabase } from "./supabase";
import { apiGet } from "./api";

export type Product = "adults" | "gym";
export type Tier = "self" | "family" | "coach";

/**
 * Derives which product an already-authenticated session belongs to from
 * the account's actual (scoped) email — see scopedEmail() in
 * src/lib/auth.ts, which tags adults/family/self accounts with
 * "+nutriai-adults" and leaves gym/coach accounts untouched.
 */
export function detectProductFromEmail(email: string | null | undefined): Product {
  return email?.includes("+nutriai-adults@") ? "adults" : "gym";
}

/**
 * Self and Family both scope to the same "adults" account tag (see
 * detectProductFromEmail), so they can't be told apart from the email
 * alone the way Coach can — this fetches the workspace itself and reads
 * workspace.plan, the same field the main web app uses for this exact
 * distinction (see workspaces.plan in the main app's schema).
 */
export async function detectTier(): Promise<Tier> {
  const { data } = await supabase.auth.getSession();
  const product = detectProductFromEmail(data.session?.user.email);
  if (product === "gym") return "coach";

  const { workspace } = await apiGet<{ workspace: { plan?: string } }>("/adults/workspace");
  return workspace.plan === "self" ? "self" : "family";
}

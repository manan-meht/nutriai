import { createClient } from "@supabase/supabase-js";

/** Where a logged-in user's brand-name/logo click in the marketing nav
 * should go — their own dashboard, not the marketing homepage. Looks up
 * the user's workspace(s) directly (read-only, service-role — no side
 * effects, unlike getOrCreate*Workspace which creates one if missing)
 * rather than assuming a product from the current page, since a user
 * could in principle click the logo on any marketing page.
 *
 * An account can legitimately own workspaces in both products — Google/
 * Facebook OAuth sign-in isn't scoped per-product the way scopedEmail()
 * scopes password sign-in, so one OAuth identity can end up owning both a
 * gym and an adults workspace. `lastVisitedProduct` (read from the
 * tistra_last_product cookie set by middleware.ts on an actual dashboard
 * visit) resolves that ambiguity when present; falling back to the
 * oldest-owned workspace otherwise (shouldn't normally matter for an
 * account with only one workspace, which is still the common case). */
export async function getDashboardHrefForUser(
  userId: string,
  lastVisitedProduct?: "gym" | "adults"
): Promise<string> {
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data } = await admin
    .from("workspaces")
    .select("type")
    .eq("owner_id", userId)
    .order("created_at", { ascending: true });

  if (!data || data.length === 0) return "/adults/dashboard";
  if (lastVisitedProduct && data.some((w) => w.type === lastVisitedProduct)) {
    return lastVisitedProduct === "gym" ? "/gym/dashboard" : "/adults/dashboard";
  }

  return data[0].type === "gym" ? "/gym/dashboard" : "/adults/dashboard";
}

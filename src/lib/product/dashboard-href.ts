import { createClient } from "@supabase/supabase-js";

/** Where a logged-in user's brand-name/logo click in the marketing nav
 * should go — their own dashboard, not the marketing homepage. Looks up
 * the user's oldest workspace directly (read-only, service-role — no
 * side effects, unlike getOrCreate*Workspace which creates one if
 * missing) rather than assuming a product from the current page, since a
 * user could in principle click the logo on any marketing page. Falls
 * back to the Family dashboard if no workspace is found (shouldn't
 * normally happen for a logged-in user). */
export async function getDashboardHrefForUser(userId: string): Promise<string> {
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data } = await admin
    .from("workspaces")
    .select("type")
    .eq("owner_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  return data?.type === "gym" ? "/gym/dashboard" : "/adults/dashboard";
}

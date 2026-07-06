import { createClient } from "@/lib/supabase/server";

export const ADMIN_ROLES = ["reviewer", "nutrition_expert", "admin", "super_admin"] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

// Only admin/super_admin may create/edit/archive food knowledge base
// entries and are the intended audience for destructive actions generally.
export const FOOD_KB_WRITE_ROLES = ["admin", "super_admin"] as const;

export interface AdminSession {
  userId: string;
  role: AdminRole;
}

/** Returns the current user's admin session, or null if they're not signed
 * in or don't hold one of the review-console roles. Pages/actions should
 * treat null as "not authorized" and redirect/reject accordingly — this
 * function itself never redirects, so it's safe to call from both Server
 * Components and Server Actions. */
export async function getAdminSession(): Promise<AdminSession | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  const role = profile?.role;
  if (!role || !(ADMIN_ROLES as readonly string[]).includes(role)) return null;

  return { userId: user.id, role: role as AdminRole };
}

export function canWriteFoodKnowledgeBase(role: AdminRole): boolean {
  return (FOOD_KB_WRITE_ROLES as readonly string[]).includes(role);
}

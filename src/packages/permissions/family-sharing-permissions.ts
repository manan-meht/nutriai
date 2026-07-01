import { createClient } from "@/lib/supabase/server";
import type { FamilySharingPermissions } from "@/types";

export const DEFAULT_SHARING_PERMISSIONS: FamilySharingPermissions = {
  canSeeMealPhotos: false,
  canSeeMealDescriptions: true,
  canSeeWeeklySummaries: true,
  canSeeGoalProgress: true,
  canSeeAlerts: true,
  canSeeMessages: true,
  canProposeGoals: true,
};

export async function getSharingPermissions(
  workspaceId: string,
  olderAdultId: string,
  supporterId: string
): Promise<FamilySharingPermissions | null> {
  const supabase = await createClient();

  // The older adult always has full access to their own data
  if (olderAdultId === supporterId) {
    return {
      canSeeMealPhotos: true,
      canSeeMealDescriptions: true,
      canSeeWeeklySummaries: true,
      canSeeGoalProgress: true,
      canSeeAlerts: true,
      canSeeMessages: true,
      canProposeGoals: false,
    };
  }

  const { data } = await supabase
    .from("sharing_permissions")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("older_adult_id", olderAdultId)
    .eq("supporter_id", supporterId)
    .single();

  if (!data) return null;

  return {
    canSeeMealPhotos: data.can_see_meal_photos,
    canSeeMealDescriptions: data.can_see_meal_descriptions,
    canSeeWeeklySummaries: data.can_see_weekly_summaries,
    canSeeGoalProgress: data.can_see_goal_progress,
    canSeeAlerts: data.can_see_alerts,
    canSeeMessages: data.can_see_messages,
    canProposeGoals: data.can_propose_goals,
  };
}

export async function updateSharingPermissions(
  workspaceId: string,
  olderAdultId: string,
  supporterId: string,
  permissions: Partial<FamilySharingPermissions>,
  updatedById: string
): Promise<void> {
  // Only the older adult may update their own sharing permissions
  if (updatedById !== olderAdultId) {
    throw new Error("Only the older adult can change their sharing permissions");
  }

  const supabase = await createClient();
  await supabase.from("sharing_permissions").upsert({
    workspace_id: workspaceId,
    older_adult_id: olderAdultId,
    supporter_id: supporterId,
    can_see_meal_photos: permissions.canSeeMealPhotos,
    can_see_meal_descriptions: permissions.canSeeMealDescriptions,
    can_see_weekly_summaries: permissions.canSeeWeeklySummaries,
    can_see_goal_progress: permissions.canSeeGoalProgress,
    can_see_alerts: permissions.canSeeAlerts,
    can_see_messages: permissions.canSeeMessages,
    can_propose_goals: permissions.canProposeGoals,
    updated_at: new Date().toISOString(),
  });
}

/**
 * Filter a dashboard response to only include fields the supporter is permitted to see.
 * This must be called server-side — never rely on the frontend to omit hidden fields.
 */
export function applyPermissionFilter<T extends Record<string, unknown>>(
  data: T,
  permissions: FamilySharingPermissions,
  fieldPermissionMap: Partial<Record<keyof T, keyof FamilySharingPermissions>>
): T {
  const result = { ...data };
  for (const [field, permissionKey] of Object.entries(fieldPermissionMap)) {
    if (!permissions[permissionKey as keyof FamilySharingPermissions]) {
      delete result[field as keyof T];
    }
  }
  return result;
}

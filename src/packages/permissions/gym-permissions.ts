import type { GymPermissions, WorkspaceMemberRole } from "@/types";

const ROLE_PERMISSIONS: Record<string, GymPermissions> = {
  gym_owner: {
    canViewClientMeals: true,
    canViewCoachNotes: true,
    canSetNutritionTargets: true,
    canViewReports: true,
    canApproveReports: true,
    canSendMessages: true,
    canManageGoals: true,
    canViewAllClients: true,
  },
  trainer: {
    canViewClientMeals: true,
    canViewCoachNotes: true,
    canSetNutritionTargets: true,
    canViewReports: true,
    canApproveReports: true,
    canSendMessages: true,
    canManageGoals: true,
    canViewAllClients: false,
  },
  client: {
    canViewClientMeals: false,
    canViewCoachNotes: false,
    canSetNutritionTargets: false,
    canViewReports: true, // own reports only
    canApproveReports: false,
    canSendMessages: true,
    canManageGoals: false,
    canViewAllClients: false,
  },
};

const DENY_ALL: GymPermissions = {
  canViewClientMeals: false,
  canViewCoachNotes: false,
  canSetNutritionTargets: false,
  canViewReports: false,
  canApproveReports: false,
  canSendMessages: false,
  canManageGoals: false,
  canViewAllClients: false,
};

export function getGymPermissions(role: WorkspaceMemberRole | null): GymPermissions {
  if (!role) return DENY_ALL;
  return ROLE_PERMISSIONS[role] ?? DENY_ALL;
}

export function assertGymPermission(
  role: WorkspaceMemberRole | null,
  permission: keyof GymPermissions
): void {
  const permissions = getGymPermissions(role);
  if (!permissions[permission]) {
    throw new Error(`Permission denied: ${permission}`);
  }
}

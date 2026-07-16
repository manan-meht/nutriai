// Viewer-role permission model for the shared ProfileDashboard component
// (src/components/dashboard/ProfileDashboard.tsx). Before this, every
// dashboard (ContactDashboard.tsx, ClientDashboard.tsx,
// MyProgressDashboardClient.tsx) hardcoded a single implicit viewer — this
// is the first generalized "who's looking at this profile, and what can
// they do" concept in the codebase, so keep it centralized here rather
// than re-deriving role checks ad hoc in components.

export type ViewerRole = "participant" | "family_admin" | "coach";

export interface DashboardPermissions {
  /** In-app meal logging doesn't exist yet for any role — all meals are
   * logged via the WhatsApp bot (see src/lib/whatsapp/conversation-handler.ts).
   * Kept false for every role today; flip on per-role once an in-app
   * logging UI ships. */
  canAddMeal: boolean;
  /** Editing/correcting an already-logged meal also doesn't have a web UI
   * yet (corrections happen via the WhatsApp conversation flow) — same
   * caveat as canAddMeal. */
  canEditMeals: boolean;
  /** Editing profile fields that drive the Food Balance Score goal
   * (age/weight/height/nutrition goal, etc. — see EditContactModal/
   * EditClientModal). */
  canManageGoal: boolean;
  canViewMealPhotos: boolean;
  canViewDetailedNutrition: boolean;
  /** Pausing sharing, revoking a device, requesting removal — the
   * account-control actions unique to the tracked person themselves
   * (see src/components/end-user/MyProgressDashboardClient.tsx). */
  canManageSharing: boolean;
  /** Generating/sending the WhatsApp invite link that connects this
   * profile in the first place. */
  canInviteOthers: boolean;
}

const BASE: DashboardPermissions = {
  canAddMeal: false,
  canEditMeals: false,
  canManageGoal: false,
  canViewMealPhotos: false,
  canViewDetailedNutrition: false,
  canManageSharing: false,
  canInviteOthers: false,
};

export function permissionsForRole(role: ViewerRole): DashboardPermissions {
  switch (role) {
    case "participant":
      // The tracked person looking at their own data: full visibility, can
      // manage their own goal and sharing/access, but "inviting others" (a
      // caregiver/coach adding *them*) isn't something they'd initiate.
      return { ...BASE, canManageGoal: true, canViewMealPhotos: true, canViewDetailedNutrition: true, canManageSharing: true };
    case "family_admin":
    case "coach":
      // Caregiver/coach: can manage the profile and invite/reconnect them,
      // but sharing/access control (pausing, trusted devices) belongs to
      // the tracked person, not the account managing them.
      return { ...BASE, canManageGoal: true, canViewMealPhotos: true, canViewDetailedNutrition: true, canInviteOthers: true };
  }
}

import { permissionsForRole } from "@/lib/dashboard/permissions";

describe("permissionsForRole", () => {
  it("no role can add or edit meals yet — in-app logging doesn't exist (WhatsApp-only today)", () => {
    for (const role of ["participant", "family_admin", "coach"] as const) {
      const perms = permissionsForRole(role);
      expect(perms.canAddMeal).toBe(false);
      expect(perms.canEditMeals).toBe(false);
    }
  });

  it("participant can manage their own goal and sharing, but not invite others", () => {
    const perms = permissionsForRole("participant");
    expect(perms.canManageGoal).toBe(true);
    expect(perms.canViewMealPhotos).toBe(true);
    expect(perms.canViewDetailedNutrition).toBe(true);
    expect(perms.canManageSharing).toBe(true);
    expect(perms.canInviteOthers).toBe(false);
  });

  it("family_admin and coach can manage the goal and invite, but not manage sharing", () => {
    for (const role of ["family_admin", "coach"] as const) {
      const perms = permissionsForRole(role);
      expect(perms.canManageGoal).toBe(true);
      expect(perms.canViewMealPhotos).toBe(true);
      expect(perms.canViewDetailedNutrition).toBe(true);
      expect(perms.canInviteOthers).toBe(true);
      expect(perms.canManageSharing).toBe(false);
    }
  });
});

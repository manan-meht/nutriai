import {
  resolveServerSideVariant,
  parseAssignmentCookie,
  serializeAssignment,
  createNewAssignment,
  getCookieName,
  EXPERIMENT_IDS,
} from "@/lib/experiments/landing-page-experiment";
import type { LandingExperimentAssignment } from "@/types";

const GYM_ASSIGNMENT: LandingExperimentAssignment = {
  experimentId: EXPERIMENT_IDS.gym,
  product: "gym",
  variant: "immersive",
  assignedAt: Date.now(),
  selectionMode: "ab_test",
};

describe("parseAssignmentCookie", () => {
  it("parses a valid gym assignment", () => {
    const serialized = serializeAssignment(GYM_ASSIGNMENT);
    const parsed = parseAssignmentCookie(serialized, "gym");
    expect(parsed?.variant).toBe("immersive");
    expect(parsed?.product).toBe("gym");
  });

  it("rejects a cookie for the wrong product", () => {
    const serialized = serializeAssignment(GYM_ASSIGNMENT);
    const parsed = parseAssignmentCookie(serialized, "adults");
    expect(parsed).toBeNull();
  });

  it("rejects a cookie with wrong experiment id", () => {
    const stale: LandingExperimentAssignment = { ...GYM_ASSIGNMENT, experimentId: "gym_landing_v0" };
    const serialized = serializeAssignment(stale);
    const parsed = parseAssignmentCookie(serialized, "gym");
    expect(parsed).toBeNull();
  });

  it("returns null for undefined input", () => {
    expect(parseAssignmentCookie(undefined, "gym")).toBeNull();
  });
});

describe("resolveServerSideVariant — query override", () => {
  it("honours ?landing=standard override", () => {
    const params = new URLSearchParams("landing=standard");
    const { variant } = resolveServerSideVariant("gym", params, null);
    expect(variant).toBe("standard");
  });

  it("honours ?landing=immersive override", () => {
    const params = new URLSearchParams("landing=immersive");
    const { variant } = resolveServerSideVariant("gym", params, null);
    expect(variant).toBe("immersive");
  });

  it("ignores unknown landing param", () => {
    const params = new URLSearchParams("landing=fancy");
    // Should still produce an assignment (not crash)
    const { assignment } = resolveServerSideVariant("gym", params, null);
    expect(["standard", "immersive"]).toContain(assignment.variant);
  });
});

describe("resolveServerSideVariant — stable cookie", () => {
  it("returns existing assignment when cookie is valid", () => {
    const params = new URLSearchParams();
    const { variant } = resolveServerSideVariant("gym", params, GYM_ASSIGNMENT);
    expect(variant).toBe("immersive");
  });
});

describe("resolveServerSideVariant — forced modes", () => {
  beforeEach(() => {
    delete process.env.GYM_LANDING_MODE;
    delete process.env.ADULTS_LANDING_MODE;
  });

  it("always returns standard in standard_only mode", () => {
    process.env.GYM_LANDING_MODE = "standard_only";
    const params = new URLSearchParams();
    const { variant } = resolveServerSideVariant("gym", params, null);
    expect(variant).toBe("standard");
    delete process.env.GYM_LANDING_MODE;
  });

  it("always returns immersive in immersive_only mode", () => {
    process.env.GYM_LANDING_MODE = "immersive_only";
    const params = new URLSearchParams();
    const { variant } = resolveServerSideVariant("gym", params, null);
    expect(variant).toBe("immersive");
    delete process.env.GYM_LANDING_MODE;
  });
});

describe("product experiment separation", () => {
  it("gym and adults have different cookie names", () => {
    expect(getCookieName("gym")).not.toBe(getCookieName("adults"));
  });

  it("gym and adults have different experiment ids", () => {
    expect(EXPERIMENT_IDS.gym).not.toBe(EXPERIMENT_IDS.adults);
  });

  it("gym assignment cookie rejected for adults product", () => {
    const serialized = serializeAssignment(GYM_ASSIGNMENT);
    expect(parseAssignmentCookie(serialized, "adults")).toBeNull();
  });
});

describe("landing routes CTA — no private data", () => {
  it("signup URL contains only safe params", () => {
    const { getSignupUrl } = require("@/lib/landing/routes");
    const url = getSignupUrl({
      product: "gym",
      source: "landing",
      variant: "immersive",
      experimentId: "gym_landing_v1",
    });
    expect(url).not.toContain("meal");
    expect(url).not.toContain("food");
    expect(url).not.toContain("health");
    expect(url).toContain("variant=immersive");
    expect(url).toContain("exp=gym_landing_v1");
  });
});

describe("family permission gate", () => {
  it("getGymPermissions returns deny-all for null role", () => {
    const { getGymPermissions } = require("@/packages/permissions/gym-permissions");
    const perms = getGymPermissions(null);
    expect(perms.canViewClientMeals).toBe(false);
    expect(perms.canViewCoachNotes).toBe(false);
  });

  it("trainer can view client meals", () => {
    const { getGymPermissions } = require("@/packages/permissions/gym-permissions");
    const perms = getGymPermissions("trainer");
    expect(perms.canViewClientMeals).toBe(true);
    expect(perms.canViewCoachNotes).toBe(true);
  });

  it("client cannot view coach notes", () => {
    const { getGymPermissions } = require("@/packages/permissions/gym-permissions");
    const perms = getGymPermissions("client");
    expect(perms.canViewCoachNotes).toBe(false);
    expect(perms.canViewAllClients).toBe(false);
  });
});

describe("performance-aware selection", () => {
  it("degrades to standard on saveData", () => {
    const { resolveClientVariant } = require("@/lib/experiments/landing-page-performance");
    const result = resolveClientVariant("immersive", {
      saveData: true,
      effectiveType: "4g",
      deviceMemoryGb: 4,
      prefersReducedMotion: false,
      viewportWidth: 1440,
    });
    expect(result).toBe("standard");
  });

  it("degrades to standard on 2g connection", () => {
    const { resolveClientVariant } = require("@/lib/experiments/landing-page-performance");
    const result = resolveClientVariant("immersive", {
      saveData: false,
      effectiveType: "2g",
      deviceMemoryGb: 4,
      prefersReducedMotion: false,
      viewportWidth: 1440,
    });
    expect(result).toBe("standard");
  });

  it("uses reduced_motion_immersive when motion preference set", () => {
    const { resolveClientVariant } = require("@/lib/experiments/landing-page-performance");
    const result = resolveClientVariant("immersive", {
      saveData: false,
      effectiveType: "4g",
      deviceMemoryGb: 4,
      prefersReducedMotion: true,
      viewportWidth: 1440,
    });
    expect(result).toBe("reduced_motion_immersive");
  });

  it("returns immersive on capable device and network", () => {
    const { resolveClientVariant } = require("@/lib/experiments/landing-page-performance");
    const result = resolveClientVariant("immersive", {
      saveData: false,
      effectiveType: "4g",
      deviceMemoryGb: 6,
      prefersReducedMotion: false,
      viewportWidth: 1440,
    });
    expect(result).toBe("immersive");
  });
});

describe("Indian Nutrition Database lookup", () => {
  it("finds dal by exact name", () => {
    const { lookupIndb } = require("@/packages/analysis/shared-food-recognition/indian-nutrition-db");
    const result = lookupIndb("Dal Makhani");
    expect(result).not.toBeNull();
    expect(result.confidence).toBe("high");
  });

  it("finds paneer by partial match", () => {
    const { lookupIndb } = require("@/packages/analysis/shared-food-recognition/indian-nutrition-db");
    const result = lookupIndb("paneer tikka");
    expect(result).not.toBeNull();
  });

  it("returns null for unknown food", () => {
    const { lookupIndb } = require("@/packages/analysis/shared-food-recognition/indian-nutrition-db");
    const result = lookupIndb("xyzzyx unknown");
    expect(result).toBeNull();
  });

  it("estimates nutrition correctly for 200g of rice", () => {
    const { lookupIndb, estimateNutritionFromIndb } = require("@/packages/analysis/shared-food-recognition/indian-nutrition-db");
    const match = lookupIndb("Steamed Rice (cooked)");
    expect(match).not.toBeNull();
    const est = estimateNutritionFromIndb(match.food, 200);
    expect(est.calories).toBe(260);
    expect(est.proteinGrams).toBe(5.4);
  });
});

describe("family alert evaluator — single meal does not trigger alert", () => {
  it("returns no alerts for a single meal", () => {
    const { evaluateFamilyAlerts } = require("@/packages/analysis/family-intelligence/family-alert-evaluator");
    const singleMeal = [
      {
        id: "m1",
        loggedAt: new Date(),
        workspaceId: "ws1",
        workspaceType: "family",
        mealLoggerId: "u1",
        foods: [],
        nutritionEstimate: {},
        foodGroups: [],
        analysisConfidence: "medium",
        confirmedByUser: true,
        source: "web",
      },
    ];
    const singleInsight = [
      {
        mealId: "m1",
        supportedPersonId: "u1",
        quantitySignal: "possibly_lower",
        appetiteSignal: "low",
        hydrationSignal: "not_recorded",
        familyAlertCandidate: false,
        baselineChange: { detected: false },
      },
    ];
    const alerts = evaluateFamilyAlerts(singleMeal as any, singleInsight as any, 7);
    // Data completeness < 0.4 — no alerts should be raised
    expect(alerts).toHaveLength(0);
  });
});

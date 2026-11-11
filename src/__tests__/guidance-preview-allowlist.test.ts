// Guidance in production before the clinical review (decided 2026-11-11):
// accounts on the billing test whitelist may use it as a labelled beta;
// everyone else sees nothing new, even with NEXT_PUBLIC_GUIDANCE_ENABLED
// on. The policy row stays 'unreviewed' throughout.

const mockFlags = { guidance: true };
jest.mock("@/lib/billing/feature-flags", () =>
  Object.defineProperty({ ...jest.requireActual("@/lib/billing/feature-flags") }, "GUIDANCE_ENABLED", {
    get: () => mockFlags.guidance,
    enumerable: true,
  })
);

import type { GuidanceActor } from "@/lib/guidance/authorization";
import { confirmActivation } from "@/lib/guidance/activation";
import { evaluateReleaseState, isGuidancePreviewAccount, loadReleaseState } from "@/lib/guidance/release";
import { loadGuidanceContactIds, loadGuidanceDashboard, loadGuidanceEntry } from "@/lib/guidance/view";
import { loadWhatsAppGuidance } from "@/lib/guidance/whatsapp";

import { makeGuidanceDb, type GuidanceRows } from "./helpers/guidance-db";

const TZ = "Asia/Kolkata";
const now = new Date("2026-11-11T06:00:00Z");

/** Production, as release.ts recognises it, with the whitelist set. */
async function inProduction<T>(fn: () => Promise<T>): Promise<T> {
  const prev = { env: process.env.NODE_ENV, tistra: process.env.NEXT_PUBLIC_TISTRA_ENV, list: process.env.BILLING_TEST_WHITELIST_EMAILS };
  try {
    Object.defineProperty(process.env, "NODE_ENV", { value: "production", configurable: true });
    delete process.env.NEXT_PUBLIC_TISTRA_ENV;
    process.env.BILLING_TEST_WHITELIST_EMAILS = "tester@example.com, Coach@Example.com";
    return await fn();
  } finally {
    Object.defineProperty(process.env, "NODE_ENV", { value: prev.env, configurable: true });
    if (prev.tistra !== undefined) process.env.NEXT_PUBLIC_TISTRA_ENV = prev.tistra;
    if (prev.list === undefined) delete process.env.BILLING_TEST_WHITELIST_EMAILS;
    else process.env.BILLING_TEST_WHITELIST_EMAILS = prev.list;
  }
}

function rows(): GuidanceRows & { profiles: Array<Record<string, unknown>> } {
  const target = (id: string, contact: string) => ({
    id,
    adults_contact_id: contact,
    effective_from: "2026-11-01",
    effective_to: null,
    policy_version: "v1-mifflin-2026-10",
    calories_kcal: 1436,
    protein_g: 95,
    carbs_g: 170,
    fat_g: 48,
    fiber_g: 25,
    explanation: "x",
  });
  return {
    profiles: [
      // The "+nutriai-adults" tag is how adults sign-ups store emails.
      { id: "p-tester", email: "tester+nutriai-adults@example.com" },
      { id: "p-other", email: "someone@example.com" },
    ],
    adults_contacts: [
      { id: "c-tester", caregiver_id: "p-tester", relationship_type: "family_caregiver", timezone: TZ, full_name: "Tested Person" },
      { id: "c-other", caregiver_id: "p-other", relationship_type: "family_caregiver", timezone: TZ, full_name: "Other Person" },
    ],
    gym_clients: [],
    nutrition_policy_versions: [{ version: "v1-mifflin-2026-10", status: "unreviewed" }],
    nutrition_guidance: [
      { id: "g1", adults_contact_id: "c-tester", mode: "guidance", activated_at: "2026-11-01T04:00:00Z", activated_via: "caregiver" },
      { id: "g2", adults_contact_id: "c-other", mode: "guidance", activated_at: "2026-11-01T04:00:00Z", activated_via: "caregiver" },
    ],
    nutrition_guidance_screening: [],
    nutrition_targets: [target("t1", "c-tester"), target("t2", "c-other")],
    meal_logs: [],
  } as GuidanceRows & { profiles: Array<Record<string, unknown>> };
}

beforeEach(() => {
  mockFlags.guidance = true;
});

describe("the release gate", () => {
  it("opens in production with an unreviewed policy only for a whitelisted owner, and always as a preview", () => {
    const base = { featureEnabled: true, policyStatus: "unreviewed" as const, isProduction: true };
    expect(evaluateReleaseState(base)).toMatchObject({ canActivate: false, isPreviewOnly: false });
    expect(evaluateReleaseState({ ...base, ownerIsPreviewAccount: true })).toMatchObject({ canActivate: true, isPreviewOnly: true });
    // The whitelist never stands in for a missing flag, a missing policy or a retired one.
    expect(evaluateReleaseState({ ...base, featureEnabled: false, ownerIsPreviewAccount: true }).canActivate).toBe(false);
    expect(evaluateReleaseState({ ...base, policyStatus: null, ownerIsPreviewAccount: true }).canActivate).toBe(false);
    expect(evaluateReleaseState({ ...base, policyStatus: "retired", ownerIsPreviewAccount: true }).canActivate).toBe(false);
  });

  it("matches the whitelist the way billing does: case and the +nutriai tag don't matter", async () => {
    await inProduction(async () => {
      expect(isGuidancePreviewAccount("TESTER+nutriai-adults@example.com")).toBe(true);
      expect(isGuidancePreviewAccount("coach@example.com")).toBe(true);
      expect(isGuidancePreviewAccount("someone@example.com")).toBe(false);
      expect(isGuidancePreviewAccount(null)).toBe(false);
      const db = makeGuidanceDb(rows());
      expect(await loadReleaseState(db, "p-tester")).toMatchObject({ canActivate: true, isPreviewOnly: true });
      expect(await loadReleaseState(db, "p-other")).toMatchObject({ canActivate: false });
      expect(await loadReleaseState(db)).toMatchObject({ canActivate: false });
    });
  });
});

describe("what each account sees in production with the flag on", () => {
  it("a whitelisted owner gets the Guidance entry, dashboard and overview marker; anyone else gets none of it", async () => {
    await inProduction(async () => {
      const db = makeGuidanceDb(rows());
      expect(await loadGuidanceEntry(db, "c-tester")).toEqual({ visible: true, mode: "guidance" });
      const dashboard = await loadGuidanceDashboard(db, { contactId: "c-tester", now });
      expect(dashboard).not.toBeNull();
      expect(dashboard!.isPreviewOnly).toBe(true);
      expect(await loadGuidanceContactIds(db, ["c-tester"], "p-tester")).toEqual(["c-tester"]);

      // Not whitelisted: no dashboard and no overview marker, even though
      // this person's row says Guidance.
      expect(await loadGuidanceDashboard(db, { contactId: "c-other", now })).toBeNull();
      expect(await loadGuidanceContactIds(db, ["c-other"], "p-other")).toEqual([]);
      expect(await loadWhatsAppGuidance(db, { contactId: "c-other", contactType: "adults", now })).toBeNull();
      expect(await loadWhatsAppGuidance(db, { contactId: "c-tester", contactType: "adults", now })).not.toBeNull();
    });
  });

  it("a non-whitelisted account can't switch Guidance on", async () => {
    await inProduction(async () => {
      const data = rows();
      data.nutrition_guidance = [];
      const db = makeGuidanceDb(data);
      const other: GuidanceActor = { kind: "caregiver", profileId: "p-other" };
      const result = await confirmActivation(db, {
        contactId: "c-other",
        actor: other,
        answers: {
          ageYears: 60,
          heightCm: 170,
          weightKg: 70,
          metabolicEquationSex: "male",
          activityLevel: "lightly_active",
          goals: ["healthy_aging"],
          isPregnantOrBreastfeeding: false,
          hasEatingDisorderHistory: false,
          conditionsOrMedications: null,
          timezone: "",
          mealsPerDay: 3,
          usualMealTimes: null,
          cookingAccess: null,
          cuisines: [],
          allergies: [],
          avoidedFoods: [],
        },
        now,
      });
      expect(result).toMatchObject({ ok: false, kind: "unavailable" });
      expect(data.nutrition_guidance).toHaveLength(0);
    });
  });

  it("with the flag off, nothing shows for anyone, whitelisted or not", async () => {
    mockFlags.guidance = false;
    await inProduction(async () => {
      const db = makeGuidanceDb(rows());
      expect(await loadGuidanceEntry(db, "c-tester")).toEqual({ visible: false, mode: "tracking" });
      expect(await loadGuidanceDashboard(db, { contactId: "c-tester", now })).toBeNull();
    });
  });
});

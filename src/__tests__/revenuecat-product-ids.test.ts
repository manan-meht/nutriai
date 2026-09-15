import {
  moduleForRevenueCatProductId,
  extraCapacityModuleForRevenueCatProductId,
} from "@/lib/billing/revenuecat";

/**
 * The two stores name the same plan differently, and the webhook has to
 * recognise both. Play sends "<product>:<basePlan>" because one Play
 * product carries several base plans. The App Store has no base plans —
 * every duration is a separate product with a permanent id — so the iOS
 * products are suffixed instead.
 *
 * An id that isn't recognised makes the webhook ignore the event, which
 * means a customer is charged and never unlocked. That failure is silent
 * on both ends, so it's worth pinning both spellings here.
 */
describe("RevenueCat product ids resolve to the right module", () => {
  describe("plan subscriptions", () => {
    it("recognises Play's base-plan form", () => {
      expect(moduleForRevenueCatProductId("self_premium:monthly")).toBe("adults");
      expect(moduleForRevenueCatProductId("family_premium:annual")).toBe("adults");
      expect(moduleForRevenueCatProductId("coach_premium:annual")).toBe("gym");
    });

    it("recognises the App Store's per-duration products", () => {
      expect(moduleForRevenueCatProductId("self_premium_monthly")).toBe("adults");
      expect(moduleForRevenueCatProductId("self_premium_annual")).toBe("adults");
      expect(moduleForRevenueCatProductId("family_premium_monthly")).toBe("adults");
      expect(moduleForRevenueCatProductId("family_premium_annual")).toBe("adults");
    });

    it("still recognises a bare product id", () => {
      expect(moduleForRevenueCatProductId("self_premium")).toBe("adults");
      expect(moduleForRevenueCatProductId("family_premium")).toBe("adults");
    });

    it("ignores anything it doesn't know", () => {
      expect(moduleForRevenueCatProductId("something_else_monthly")).toBeNull();
      expect(moduleForRevenueCatProductId("")).toBeNull();
      expect(moduleForRevenueCatProductId(null)).toBeNull();
      expect(moduleForRevenueCatProductId(undefined)).toBeNull();
    });

    it("does not treat the extra-capacity add-on as a plan", () => {
      // These grant a seat, not a subscription tier — routing one through
      // the plan path would overwrite the customer's actual plan status.
      expect(moduleForRevenueCatProductId("adults_additional_person_monthly")).toBeNull();
      expect(moduleForRevenueCatProductId("adults_additional_person")).toBeNull();
    });
  });

  describe("extra-capacity add-on", () => {
    it("recognises Play's spelling", () => {
      expect(extraCapacityModuleForRevenueCatProductId("adults_additional_person")).toBe("adults");
      expect(extraCapacityModuleForRevenueCatProductId("adults_additional_person:monthly")).toBe("adults");
      expect(extraCapacityModuleForRevenueCatProductId("coach_additional_person")).toBe("gym");
    });

    it("recognises the App Store's renamed product", () => {
      // The seat add-on must sit in its own subscription group, and the id
      // first created alongside the plans could not be reused once moved —
      // App Store product ids are permanent even after deletion.
      expect(extraCapacityModuleForRevenueCatProductId("adults_extra_person_monthly")).toBe("adults");
      expect(extraCapacityModuleForRevenueCatProductId("adults_extra_person")).toBe("adults");
    });

    it("does not treat a plan as extra capacity", () => {
      expect(extraCapacityModuleForRevenueCatProductId("family_premium_annual")).toBeNull();
      expect(extraCapacityModuleForRevenueCatProductId(null)).toBeNull();
    });
  });
});

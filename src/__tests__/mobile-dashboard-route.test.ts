import { chooseDashboard } from "../../apps/mobile/src/lib/dashboard-route";

// Which dashboard the mobile app opens after sign-in or on a cold start.
// The coach view is for an account that already owns a gym workspace; the
// failure that matters most is any other account landing in it, or a coach
// sign-in quietly creating a Health workspace nobody asked for.
describe("mobile dashboard routing", () => {
  const base = { ownsAdults: false, ownsGym: false, lastChoice: null, pendingProduct: null } as const;

  it("never opens the coach view without a gym workspace", () => {
    for (const lastChoice of [null, "adults", "gym"] as const) {
      for (const pendingProduct of [null, "self", "family"] as const) {
        for (const ownsAdults of [false, true]) {
          const route = chooseDashboard({ ...base, ownsAdults, lastChoice, pendingProduct });
          expect(route).not.toEqual({ kind: "dashboard", dashboard: "gym" });
        }
      }
    }
  });

  it("sends a coach-only account to the coach view, even with a fresh self/family pick", () => {
    // Every sign-in passes through the self/family picker. Honoring the
    // pick would create an empty adults workspace on each coach sign-in.
    for (const pendingProduct of [null, "self", "family"] as const) {
      expect(chooseDashboard({ ...base, ownsGym: true, pendingProduct })).toEqual({ kind: "dashboard", dashboard: "gym" });
    }
  });

  it("sends a Health-only account to Health, whatever an old device remembered", () => {
    expect(chooseDashboard({ ...base, ownsAdults: true, lastChoice: "gym" })).toEqual({ kind: "dashboard", dashboard: "adults" });
  });

  describe("an account that owns both", () => {
    const both = { ...base, ownsAdults: true, ownsGym: true };

    it("reopens the dashboard it last used", () => {
      expect(chooseDashboard({ ...both, lastChoice: "gym" })).toEqual({ kind: "dashboard", dashboard: "gym" });
      expect(chooseDashboard({ ...both, lastChoice: "adults" })).toEqual({ kind: "dashboard", dashboard: "adults" });
    });

    it("opens Health when nothing is remembered", () => {
      expect(chooseDashboard(both)).toEqual({ kind: "dashboard", dashboard: "adults" });
    });

    it("keeps the remembered dashboard through the sign-in's self/family pick", () => {
      // The picker is mandatory before login, so for an account that already
      // owns workspaces the pick carries no signal.
      expect(chooseDashboard({ ...both, lastChoice: "gym", pendingProduct: "family" })).toEqual({
        kind: "dashboard",
        dashboard: "gym",
      });
      expect(chooseDashboard({ ...both, pendingProduct: "self" })).toEqual({ kind: "dashboard", dashboard: "adults" });
    });
  });

  describe("an account with no workspace yet", () => {
    it("creates the adults workspace on the plan that was picked", () => {
      expect(chooseDashboard({ ...base, pendingProduct: "self" })).toEqual({ kind: "new-adults", self: true });
      expect(chooseDashboard({ ...base, pendingProduct: "family" })).toEqual({ kind: "new-adults", self: false });
    });

    it("asks self vs family when nothing was picked", () => {
      expect(chooseDashboard(base)).toEqual({ kind: "picker" });
    });

    it("tells a coach sign-in with no account so, instead of the self/family picker", () => {
      // lastChoice "gym" with no workspace comes from "Coach? Sign in here".
      expect(chooseDashboard({ ...base, lastChoice: "gym" })).toEqual({ kind: "no-coach-account" });
    });

    it("still honors a fresh self/family pick over that", () => {
      expect(chooseDashboard({ ...base, lastChoice: "gym", pendingProduct: "family" })).toEqual({ kind: "new-adults", self: false });
    });
  });
});

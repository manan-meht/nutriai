import { __setClockOverrideForTests, now } from "@/lib/time/clock";

describe("controllable clock", () => {
  afterEach(() => __setClockOverrideForTests(null));

  it("returns real time when no override is set", () => {
    const before = Date.now();
    const t = now().getTime();
    const after = Date.now();
    expect(t).toBeGreaterThanOrEqual(before);
    expect(t).toBeLessThanOrEqual(after);
  });

  it("returns the overridden time when set (for deterministic trial-expiry tests)", () => {
    const fixed = new Date("2026-01-15T00:00:00.000Z");
    __setClockOverrideForTests(fixed);
    expect(now().getTime()).toBe(fixed.getTime());
  });
});

// Fake service-role Supabase client covering exactly what entitlements.ts
// needs: .from("entitlements").select(...).eq(...).eq(...).maybeSingle(),
// and .from("entitlements").upsert(...).
function makeFakeServiceClient(opts: {
  row?: { status: string; trial_start_at: string | null; trial_end_at: string | null; current_period_end: string | null } | null;
  upsertCalls?: any[];
}) {
  const upsertCalls = opts.upsertCalls ?? [];
  return {
    from: (table: string) => {
      if (table !== "entitlements") throw new Error(`unexpected table ${table}`);
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: opts.row ?? null }),
            }),
          }),
        }),
        upsert: async (row: any, _options: any) => {
          upsertCalls.push(row);
          return { error: null };
        },
      };
    },
  };
}

describe("entitlements — trial lifecycle", () => {
  const originalBillingAvailable = process.env.NEXT_PUBLIC_BILLING_AVAILABLE;

  afterEach(() => {
    __setClockOverrideForTests(null);
    jest.resetModules();
    if (originalBillingAvailable === undefined) delete process.env.NEXT_PUBLIC_BILLING_AVAILABLE;
    else process.env.NEXT_PUBLIC_BILLING_AVAILABLE = originalBillingAvailable;
  });

  it("getEntitlementSnapshot: not_started when no entitlement row exists yet", async () => {
    jest.resetModules();
    jest.doMock("@/lib/supabase/server", () => ({
      createServiceClient: () => makeFakeServiceClient({ row: null }),
    }));
    const { getEntitlementSnapshot } = await import("@/lib/entitlements/entitlements");

    const snapshot = await getEntitlementSnapshot("ws-1", "adults");
    expect(snapshot.status).toBe("not_started");
    expect(snapshot.isReadOnly).toBe(false);
    expect(snapshot.trialDaysRemaining).toBeNull();
  });

  it("getEntitlementSnapshot: trialing and not read-only when within an active trial window", async () => {
    jest.resetModules();
    const { __setClockOverrideForTests: setClock } = await import("@/lib/time/clock");
    setClock(new Date("2026-01-10T00:00:00.000Z"));
    jest.doMock("@/lib/supabase/server", () => ({
      createServiceClient: () =>
        makeFakeServiceClient({
          row: {
            status: "trialing",
            trial_start_at: "2026-01-01T00:00:00.000Z",
            trial_end_at: "2026-01-31T00:00:00.000Z",
            current_period_end: null,
          },
        }),
    }));
    const { getEntitlementSnapshot } = await import("@/lib/entitlements/entitlements");

    const snapshot = await getEntitlementSnapshot("ws-1", "adults");
    expect(snapshot.status).toBe("trialing");
    expect(snapshot.isReadOnly).toBe(false);
    expect(snapshot.trialDaysRemaining).toBe(21);
  });

  it("getEntitlementSnapshot: expired and read-only exactly after a trial window elapses (billing available)", async () => {
    // Trial started 2026-01-01T00:00:00Z, so it ends 2026-01-31T00:00:00Z.
    // One millisecond after that instant, it must read as expired.
    // Read-only enforcement only applies once billing is available (post-Beta).
    jest.resetModules();
    process.env.NEXT_PUBLIC_BILLING_AVAILABLE = "true";
    const { __setClockOverrideForTests: setClock } = await import("@/lib/time/clock");
    setClock(new Date("2026-01-31T00:00:00.001Z"));
    jest.doMock("@/lib/supabase/server", () => ({
      createServiceClient: () =>
        makeFakeServiceClient({
          row: {
            status: "trialing",
            trial_start_at: "2026-01-01T00:00:00.000Z",
            trial_end_at: "2026-01-31T00:00:00.000Z",
            current_period_end: null,
          },
        }),
    }));
    const { getEntitlementSnapshot } = await import("@/lib/entitlements/entitlements");

    const snapshot = await getEntitlementSnapshot("ws-1", "adults");
    expect(snapshot.status).toBe("expired");
    expect(snapshot.isReadOnly).toBe(true);
    expect(snapshot.trialDaysRemaining).toBe(0);
  });

  it("getEntitlementSnapshot: not yet expired one millisecond before a trial window elapses", async () => {
    jest.resetModules();
    const { __setClockOverrideForTests: setClock } = await import("@/lib/time/clock");
    setClock(new Date("2026-01-30T23:59:59.999Z"));
    jest.doMock("@/lib/supabase/server", () => ({
      createServiceClient: () =>
        makeFakeServiceClient({
          row: {
            status: "trialing",
            trial_start_at: "2026-01-01T00:00:00.000Z",
            trial_end_at: "2026-01-31T00:00:00.000Z",
            current_period_end: null,
          },
        }),
    }));
    const { getEntitlementSnapshot } = await import("@/lib/entitlements/entitlements");

    const snapshot = await getEntitlementSnapshot("ws-1", "adults");
    expect(snapshot.status).toBe("trialing");
    expect(snapshot.isReadOnly).toBe(false);
  });

  it("getEntitlementSnapshot: a lapsed paid period (active status, current_period_end passed) reads as expired (billing available)", async () => {
    jest.resetModules();
    process.env.NEXT_PUBLIC_BILLING_AVAILABLE = "true";
    const { __setClockOverrideForTests: setClock } = await import("@/lib/time/clock");
    setClock(new Date("2026-03-01T00:00:00.000Z"));
    jest.doMock("@/lib/supabase/server", () => ({
      createServiceClient: () =>
        makeFakeServiceClient({
          row: {
            status: "active",
            trial_start_at: null,
            trial_end_at: null,
            current_period_end: "2026-02-01T00:00:00.000Z",
          },
        }),
    }));
    const { getEntitlementSnapshot } = await import("@/lib/entitlements/entitlements");

    const snapshot = await getEntitlementSnapshot("ws-1", "gym");
    expect(snapshot.status).toBe("expired");
    expect(snapshot.isReadOnly).toBe(true);
  });

  it("startTrialIfNeeded: writes trial_start_at/trial_end_at exactly 14 days apart, in UTC ISO", async () => {
    jest.resetModules();
    const { __setClockOverrideForTests: setClock } = await import("@/lib/time/clock");
    setClock(new Date("2026-01-01T00:00:00.000Z"));
    const upsertCalls: any[] = [];
    jest.doMock("@/lib/supabase/server", () => ({
      createServiceClient: () => makeFakeServiceClient({ row: null, upsertCalls }),
    }));
    const { startTrialIfNeeded } = await import("@/lib/entitlements/entitlements");

    await startTrialIfNeeded("ws-1", "owner-1", "gym");

    expect(upsertCalls).toHaveLength(1);
    const written = upsertCalls[0];
    expect(written.status).toBe("trialing");
    expect(written.workspace_id).toBe("ws-1");
    expect(written.owner_id).toBe("owner-1");
    expect(written.module).toBe("gym");
    expect(written.trial_start_at).toBe("2026-01-01T00:00:00.000Z");
    expect(written.trial_end_at).toBe("2026-01-15T00:00:00.000Z");
  });
});

describe("entitlements — Beta (BILLING_AVAILABLE off, the default)", () => {
  const originalBillingAvailable = process.env.NEXT_PUBLIC_BILLING_AVAILABLE;

  afterEach(() => {
    __setClockOverrideForTests(null);
    jest.resetModules();
    if (originalBillingAvailable === undefined) delete process.env.NEXT_PUBLIC_BILLING_AVAILABLE;
    else process.env.NEXT_PUBLIC_BILLING_AVAILABLE = originalBillingAvailable;
  });

  it("never marks a workspace read-only, even long after its trial expired", async () => {
    jest.resetModules();
    delete process.env.NEXT_PUBLIC_BILLING_AVAILABLE;
    const { __setClockOverrideForTests: setClock } = await import("@/lib/time/clock");
    setClock(new Date("2027-01-01T00:00:00.000Z")); // ~a year past trial end
    jest.doMock("@/lib/supabase/server", () => ({
      createServiceClient: () =>
        makeFakeServiceClient({
          row: {
            status: "trialing",
            trial_start_at: "2026-01-01T00:00:00.000Z",
            trial_end_at: "2026-01-31T00:00:00.000Z",
            current_period_end: null,
          },
        }),
    }));
    const { getEntitlementSnapshot } = await import("@/lib/entitlements/entitlements");

    const snapshot = await getEntitlementSnapshot("ws-1", "adults");
    expect(snapshot.status).toBe("expired");
    expect(snapshot.isReadOnly).toBe(false);
  });

  it("never marks a cancelled workspace read-only either", async () => {
    jest.resetModules();
    delete process.env.NEXT_PUBLIC_BILLING_AVAILABLE;
    jest.doMock("@/lib/supabase/server", () => ({
      createServiceClient: () =>
        makeFakeServiceClient({
          row: { status: "cancelled", trial_start_at: null, trial_end_at: null, current_period_end: null },
        }),
    }));
    const { getEntitlementSnapshot } = await import("@/lib/entitlements/entitlements");

    const snapshot = await getEntitlementSnapshot("ws-1", "gym");
    expect(snapshot.status).toBe("cancelled");
    expect(snapshot.isReadOnly).toBe(false);
  });
});

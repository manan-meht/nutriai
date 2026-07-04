import { FAMILY_MEMBER_LIMIT, GYM_CLIENT_LIMIT, FAMILY_LIMIT_REACHED_MESSAGE, GYM_LIMIT_REACHED_MESSAGE, familyLimitReachedMessage, gymLimitReachedMessage } from "@/lib/limits";

jest.mock("@/lib/whatsapp/client", () => ({
  sendTextMessage: jest.fn().mockResolvedValue(undefined),
}));

// Trial lifecycle is covered separately in trials.test.ts — here we only
// care about the account-limit logic, so keep entitlements out of the way
// (never read-only, trial-start is a no-op).
jest.mock("@/lib/entitlements/entitlements", () => ({
  getEntitlementSnapshot: jest.fn().mockResolvedValue({
    status: "not_started",
    trialStartAt: null,
    trialEndAt: null,
    trialDaysRemaining: null,
    isReadOnly: false,
  }),
  startTrialIfNeeded: jest.fn().mockResolvedValue(undefined),
}));

// Minimal chainable fake that supports exactly the query shapes actions.ts
// uses: .from(table).select(...).eq(...).is(...)/.gte(...) resolving to a
// count, .single() resolving to a row, and .from(table).insert(...).select(...).single()
// resolving to {data,error}. The chain is self-referential (every filter
// method returns the same proxy) so any combination/order of .eq/.is/.gte
// keeps working without hand-listing every call shape actions.ts might use.
function makeFakeSupabase(opts: {
  activeCount: number;
  monthCount?: number;
  insertError?: string;
  extraCapacity?: number;
}) {
  const user = { id: "owner-1", email: "owner@example.com" };
  const monthCount = opts.monthCount ?? opts.activeCount;

  function selectChain(table: string, calls: { method: string; args: any[] }[] = []) {
    const chain: any = {};
    const proxy: any = new Proxy(chain, {
      get(_target, prop) {
        if (prop === "single" || prop === "maybeSingle") {
          return async () => {
            if (table === "profiles") return { data: { full_name: "Owner" } };
            if (table === "workspaces") return { data: { extra_capacity: opts.extraCapacity ?? 0 } };
            return { data: null };
          };
        }
        if (prop === "then") {
          // Awaiting the chain directly (no .single()) — this is the
          // count pre-check path. Distinguish the two count queries by
          // whether an .is("deleted_at", null) filter was applied.
          const usedIsFilter = calls.some((c) => c.method === "is");
          const count = usedIsFilter ? opts.activeCount : monthCount;
          const resolved = Promise.resolve({ count, data: null, error: null });
          return resolved.then.bind(resolved);
        }
        // Any other property access (eq/is/gte/...) — record the call and
        // keep returning the same proxy so chaining continues to work.
        return (...args: any[]) => selectChain(table, [...calls, { method: String(prop), args }]);
      },
    });
    return proxy;
  }

  function insertChain(table: string) {
    return {
      select: () => ({
        single: async () => {
          if (opts.insertError) return { data: null, error: { message: opts.insertError } };
          return { data: { id: `${table}-new-id` }, error: null };
        },
      }),
    };
  }

  return {
    auth: { getUser: async () => ({ data: { user } }) },
    from: (table: string) => ({
      select: (..._args: any[]) => selectChain(table),
      insert: (..._args: any[]) => insertChain(table),
    }),
  };
}

describe("account limits — server-side pre-check (defense in depth alongside the DB trigger)", () => {
  it("family: rejects adding a 3rd member when the workspace already has 2", async () => {
    jest.resetModules();
    jest.doMock("@/lib/supabase/server", () => ({
      createClient: async () => makeFakeSupabase({ activeCount: FAMILY_MEMBER_LIMIT }),
    }));
    const { addContact } = await import("@/app/(adults)/adults/dashboard/actions");

    await expect(
      addContact({ workspaceId: "ws-1", fullName: "Third Person", whatsappNumber: "+911234567890" })
    ).resolves.toEqual({ error: FAMILY_LIMIT_REACHED_MESSAGE });
  });

  it("family: allows adding when below the limit", async () => {
    jest.resetModules();
    jest.doMock("@/lib/supabase/server", () => ({
      createClient: async () => makeFakeSupabase({ activeCount: FAMILY_MEMBER_LIMIT - 1 }),
    }));
    const { addContact } = await import("@/app/(adults)/adults/dashboard/actions");

    await expect(
      addContact({ workspaceId: "ws-1", fullName: "Second Person", whatsappNumber: "+911234567890" })
    ).resolves.toEqual({ contactId: "adults_contacts-new-id" });
  });

  it("coaching: rejects adding a 6th client when the workspace already has 5", async () => {
    jest.resetModules();
    jest.doMock("@/lib/supabase/server", () => ({
      createClient: async () => makeFakeSupabase({ activeCount: GYM_CLIENT_LIMIT }),
    }));
    const { addClient } = await import("@/app/(gym)/gym/dashboard/actions");

    await expect(
      addClient({ workspaceId: "ws-1", fullName: "Sixth Client", whatsappNumber: "+911234567890" })
    ).resolves.toEqual({ error: GYM_LIMIT_REACHED_MESSAGE });
  });

  it("coaching: allows adding when below the limit", async () => {
    jest.resetModules();
    jest.doMock("@/lib/supabase/server", () => ({
      createClient: async () => makeFakeSupabase({ activeCount: GYM_CLIENT_LIMIT - 1 }),
    }));
    const { addClient } = await import("@/app/(gym)/gym/dashboard/actions");

    await expect(
      addClient({ workspaceId: "ws-1", fullName: "Fifth Client", whatsappNumber: "+911234567890" })
    ).resolves.toEqual({ clientId: "gym_clients-new-id" });
  });

  it("family: purchased extra_capacity raises the effective limit beyond the base of 2", async () => {
    jest.resetModules();
    jest.doMock("@/lib/supabase/server", () => ({
      // 3 existing members would fail against the base limit (2), but this
      // workspace has purchased 2 extra seats, so the effective limit is 4.
      createClient: async () => makeFakeSupabase({ activeCount: 3, extraCapacity: 2 }),
    }));
    const { addContact } = await import("@/app/(adults)/adults/dashboard/actions");

    await expect(
      addContact({ workspaceId: "ws-1", fullName: "Fourth Person", whatsappNumber: "+911234567890" })
    ).resolves.toEqual({ contactId: "adults_contacts-new-id" });
  });

  it("family: still blocks once purchased capacity is also exhausted", async () => {
    jest.resetModules();
    jest.doMock("@/lib/supabase/server", () => ({
      createClient: async () => makeFakeSupabase({ activeCount: 4, extraCapacity: 2 }),
    }));
    const { addContact } = await import("@/app/(adults)/adults/dashboard/actions");

    await expect(
      addContact({ workspaceId: "ws-1", fullName: "Fifth Person", whatsappNumber: "+911234567890" })
    ).resolves.toEqual({ error: familyLimitReachedMessage(FAMILY_MEMBER_LIMIT + 2) });
  });

  it("coaching: purchased extra_capacity raises the effective limit beyond the base of 5", async () => {
    jest.resetModules();
    jest.doMock("@/lib/supabase/server", () => ({
      createClient: async () => makeFakeSupabase({ activeCount: 5, extraCapacity: 3 }),
    }));
    const { addClient } = await import("@/app/(gym)/gym/dashboard/actions");

    await expect(
      addClient({ workspaceId: "ws-1", fullName: "Sixth Client", whatsappNumber: "+911234567890" })
    ).resolves.toEqual({ clientId: "gym_clients-new-id" });
  });

  it("coaching: still blocks once purchased capacity is also exhausted", async () => {
    jest.resetModules();
    jest.doMock("@/lib/supabase/server", () => ({
      createClient: async () => makeFakeSupabase({ activeCount: 8, extraCapacity: 3 }),
    }));
    const { addClient } = await import("@/app/(gym)/gym/dashboard/actions");

    await expect(
      addClient({ workspaceId: "ws-1", fullName: "Ninth Client", whatsappNumber: "+911234567890" })
    ).resolves.toEqual({ error: gymLimitReachedMessage(GYM_CLIENT_LIMIT + 3) });
  });

  it("family: surfaces the friendly message when the DB trigger itself rejects the insert (race condition)", async () => {
    jest.resetModules();
    jest.doMock("@/lib/supabase/server", () => ({
      createClient: async () =>
        makeFakeSupabase({ activeCount: 0, insertError: "FAMILY_MEMBER_LIMIT_REACHED: workspace ws-1 already has 2 family member(s) (limit 2)" }),
    }));
    const { addContact } = await import("@/app/(adults)/adults/dashboard/actions");

    await expect(
      addContact({ workspaceId: "ws-1", fullName: "Racer", whatsappNumber: "+911234567890" })
    ).resolves.toEqual({ error: FAMILY_LIMIT_REACHED_MESSAGE });
  });

  it("family: blocks adding a member once the trial/subscription has lapsed, even with room under the count limit", async () => {
    jest.resetModules();
    jest.doMock("@/lib/supabase/server", () => ({
      createClient: async () => makeFakeSupabase({ activeCount: 1 }),
    }));
    jest.doMock("@/lib/entitlements/entitlements", () => ({
      getEntitlementSnapshot: jest.fn().mockResolvedValue({
        status: "expired", trialStartAt: null, trialEndAt: null, trialDaysRemaining: 0, isReadOnly: true,
      }),
      startTrialIfNeeded: jest.fn().mockResolvedValue(undefined),
    }));
    const { addContact } = await import("@/app/(adults)/adults/dashboard/actions");

    const result = await addContact({ workspaceId: "ws-1", fullName: "Second Person", whatsappNumber: "+911234567890" });
    expect(result.error).toMatch(/trial has ended/i);
  });

  it("coaching: blocks inviting a client once the trial/subscription has lapsed, even with room under the count limit", async () => {
    jest.resetModules();
    jest.doMock("@/lib/supabase/server", () => ({
      createClient: async () => makeFakeSupabase({ activeCount: 1 }),
    }));
    jest.doMock("@/lib/entitlements/entitlements", () => ({
      getEntitlementSnapshot: jest.fn().mockResolvedValue({
        status: "expired", trialStartAt: null, trialEndAt: null, trialDaysRemaining: 0, isReadOnly: true,
      }),
      startTrialIfNeeded: jest.fn().mockResolvedValue(undefined),
    }));
    const { addClient } = await import("@/app/(gym)/gym/dashboard/actions");

    const result = await addClient({ workspaceId: "ws-1", fullName: "Second Client", whatsappNumber: "+911234567890" });
    expect(result.error).toMatch(/trial has ended/i);
  });
});

const notReadOnlyEntitlementMock = () => ({
  getEntitlementSnapshot: jest.fn().mockResolvedValue({
    status: "not_started", trialStartAt: null, trialEndAt: null, trialDaysRemaining: null, isReadOnly: false,
  }),
  startTrialIfNeeded: jest.fn().mockResolvedValue(undefined),
});

describe("account limits — monthly add quota survives removals", () => {
  it("family: blocks a new add once this month's quota is used, even after freeing an active slot by removing someone", async () => {
    jest.resetModules();
    jest.doMock("@/lib/supabase/server", () => ({
      // Active count is only 1 (one was removed), but 2 were added this
      // calendar month already — removing someone must not refund the quota.
      createClient: async () => makeFakeSupabase({ activeCount: 1, monthCount: 2 }),
    }));
    jest.doMock("@/lib/entitlements/entitlements", notReadOnlyEntitlementMock);
    const { addContact } = await import("@/app/(adults)/adults/dashboard/actions");

    const result = await addContact({ workspaceId: "ws-1", fullName: "Replacement Person", whatsappNumber: "+911234567890" });
    expect(result.error).toMatch(/already added 2 family members this month/i);
  });

  it("coaching: blocks a new invite once this month's quota is used, even after freeing an active slot by removing someone", async () => {
    jest.resetModules();
    jest.doMock("@/lib/supabase/server", () => ({
      createClient: async () => makeFakeSupabase({ activeCount: 2, monthCount: 5 }),
    }));
    jest.doMock("@/lib/entitlements/entitlements", notReadOnlyEntitlementMock);
    const { addClient } = await import("@/app/(gym)/gym/dashboard/actions");

    const result = await addClient({ workspaceId: "ws-1", fullName: "Replacement Client", whatsappNumber: "+911234567890" });
    expect(result.error).toMatch(/already added 5 clients this month/i);
  });

  it("family: allows adding when active count is low and this month's quota still has room", async () => {
    jest.resetModules();
    jest.doMock("@/lib/supabase/server", () => ({
      createClient: async () => makeFakeSupabase({ activeCount: 0, monthCount: 1 }),
    }));
    jest.doMock("@/lib/entitlements/entitlements", notReadOnlyEntitlementMock);
    const { addContact } = await import("@/app/(adults)/adults/dashboard/actions");

    await expect(
      addContact({ workspaceId: "ws-1", fullName: "First Person This Month", whatsappNumber: "+911234567890" })
    ).resolves.toEqual({ contactId: "adults_contacts-new-id" });
  });
});

import { ensureConnectAccount, refreshAccountState } from "@/lib/club/stripe-connect";

// Switching the platform from Stripe test mode to live mode.
//
// Connect accounts are scoped to a mode: acct_… created under sk_test_ does
// not exist under sk_live_. Every coach who onboarded before the switch
// therefore holds a dangling reference, and the DB still says their payouts
// are enabled. Two things must not happen:
//
//   1. The coach must not be stranded — "you already have an account" plus
//      "no such account" leaves no route to getting paid.
//   2. Checkout must not attempt a destination charge to an account that
//      isn't there, which is what a stale stripe_payouts_enabled=true does.

const MISSING = {
  ok: false,
  status: 404,
  json: async () => ({ error: { code: "resource_missing", message: "No such account: 'acct_test'" } }),
};

/** Captures what was written back to coach_profiles. */
function stubAdmin() {
  const updates: Record<string, unknown>[] = [];
  const admin: any = {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: { stripe_account_id: "acct_test", display_name: "A Coach", headline: null, status: "published" },
          }),
        }),
      }),
      update: (patch: Record<string, unknown>) => {
        updates.push(patch);
        return { eq: async () => ({ error: null }) };
      },
    }),
  };
  return { admin, updates };
}

describe("a Connect account from the other Stripe mode", () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
    delete process.env.STRIPE_SECRET_KEY;
  });

  it("is replaced with a fresh one rather than handed back", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_live_x";
    const calls: string[] = [];
    global.fetch = (async (url: any, init: any) => {
      calls.push(`${init?.method ?? "GET"} ${String(url)}`);
      if (String(url).includes("/accounts/acct_test")) return MISSING as any;
      return { ok: true, status: 200, json: async () => ({ id: "acct_live_new" }) } as any;
    }) as any;

    const { admin, updates } = stubAdmin();
    const id = await ensureConnectAccount(admin, "coach-1", "c@example.com", "SG", "https://tistra.club");

    expect(id).toBe("acct_live_new");
    // It checked before trusting the stored id, then created a new account.
    expect(calls.some((c) => c.includes("GET") && c.includes("/accounts/acct_test"))).toBe(true);
    expect(calls.some((c) => c.startsWith("POST") && c.endsWith("/accounts"))).toBe(true);
    // And the dangling id was cleared, payouts with it.
    expect(updates.some((u) => u.stripe_account_id === null && u.stripe_payouts_enabled === false)).toBe(true);
  });

  it("never leaves payouts marked enabled for an account that is gone", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_live_x";
    global.fetch = (async () => MISSING as any) as any;

    const { admin, updates } = stubAdmin();
    const state = await refreshAccountState(admin, "coach-1", "acct_test");

    expect(state.status).toBe("not_started");
    expect(state.payoutsEnabled).toBe(false);
    const wrote = updates.at(-1)!;
    expect(wrote.stripe_payouts_enabled).toBe(false);
    expect(wrote.stripe_account_id).toBeNull();
  });

  it("does not mistake a real Stripe outage for a missing account", async () => {
    // A 500 must propagate. Swallowing it would delete a live coach's
    // Connect account id because Stripe hiccuped.
    process.env.STRIPE_SECRET_KEY = "sk_live_x";
    global.fetch = (async () => ({
      ok: false,
      status: 500,
      json: async () => ({ error: { code: "api_error", message: "Stripe is down" } }),
    })) as any;

    const { admin, updates } = stubAdmin();
    await expect(refreshAccountState(admin, "coach-1", "acct_test")).rejects.toThrow("Stripe is down");
    expect(updates).toHaveLength(0);
  });

  it("leaves a valid account alone", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_live_x";
    global.fetch = (async () => ({
      ok: true,
      status: 200,
      json: async () => ({ id: "acct_test", charges_enabled: true, payouts_enabled: true, requirements: {} }),
    })) as any;

    const { admin, updates } = stubAdmin();
    const id = await ensureConnectAccount(admin, "coach-1", "c@example.com", "SG", "https://tistra.club");
    expect(id).toBe("acct_test");
    expect(updates.some((u) => u.stripe_account_id === null)).toBe(false);
  });
});

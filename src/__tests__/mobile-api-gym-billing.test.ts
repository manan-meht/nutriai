import fs from "fs";
import path from "path";

// mobile-api's Coach ("gym") write path must follow the same billing rules
// as the main app's addClient (src/app/(gym)/gym/dashboard/actions.ts).
// It used to follow none: POST /gym/clients never checked the entitlement
// or started a trial, and mobile-api hardcoded read-only to "adults", so
// an expired coach could keep adding clients from the phone for free.
//
// Coach is billed only on the web. The app sells no Coach plan, so a
// refusal is all the app may show — never a way to pay.

const MOBILE_API_SUPABASE = "../../apps/mobile-api/src/lib/supabase";
const MOBILE_API_ENTITLEMENTS = "../../apps/mobile-api/src/lib/entitlements";
const MOBILE_API_GYM = "../../apps/mobile-api/src/lib/gym";

const repo = (p: string) => fs.readFileSync(path.join(__dirname, "..", "..", p), "utf-8");
const code = (p: string) => repo(p).replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");

const ENV_KEYS = [
  "NEXT_PUBLIC_BILLING_AVAILABLE",
  "NEXT_PUBLIC_SUBSCRIPTION_ENFORCEMENT_ENABLED",
  "NEXT_PUBLIC_GYM_TRIAL_ENFORCEMENT_ENABLED",
  "FEATURE_ACTIVATION_DATE",
  "BILLING_TEST_WHITELIST_EMAILS",
] as const;
const originalEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));

function setEnv(values: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>) {
  for (const key of ENV_KEYS) {
    const value = values[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

afterEach(() => {
  jest.resetModules();
  setEnv(originalEnv);
});

const ACTIVATION = "2026-10-01T00:00:00.000Z";
const GRANDFATHERED_WORKSPACE = { id: "ws-old", createdAt: "2026-09-01T00:00:00.000Z" };
const NEW_WORKSPACE = { id: "ws-new", createdAt: "2026-10-20T00:00:00.000Z" };
const WHITELISTED = "coach@example.com";
const NOT_WHITELISTED = "someone@example.com";

const STATUSES = [
  "not_started",
  "trialing",
  "active",
  "past_due",
  "cancel_at_period_end",
  "expired",
  "cancelled",
  "grace_period",
] as const;

type EntitlementRow = { status: string; trial_start_at: string | null; trial_end_at: string | null; current_period_end: string | null };

const row = (status: string): EntitlementRow => ({ status, trial_start_at: null, trial_end_at: null, current_period_end: null });

/** Service-role client covering what both apps' entitlements.ts and
 * mobile-api's gym.ts touch. */
function fakeAdmin(opts: { entitlement: EntitlementRow | null; upsertError?: string }, calls: { upserts: { row: any; options: any }[] }) {
  return {
    from: (table: string) => {
      if (table === "entitlements") {
        return {
          select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: opts.entitlement }) }) }) }),
          upsert: async (r: any, options: any) => {
            calls.upserts.push({ row: r, options });
            return { error: opts.upsertError ? { message: opts.upsertError } : null };
          },
        };
      }
      if (table === "adults_contacts" || table === "gym_clients") {
        return { select: () => ({ is: async () => ({ data: [] }) }) };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
}

/** The coach's RLS-bound client: only the gym_clients insert. */
function fakeCoachClient(calls: { inserts: any[] }, insertError?: string) {
  return {
    from: (table: string) => {
      if (table !== "gym_clients") throw new Error(`unexpected table ${table}`);
      return {
        insert: (r: any) => {
          calls.inserts.push(r);
          return {
            select: () => ({
              single: async () =>
                insertError ? { data: null, error: { message: insertError } } : { data: { id: `client-${calls.inserts.length}` }, error: null },
            }),
          };
        },
      };
    },
  };
}

describe("mobile-api applies the web's Coach entitlement rules exactly", () => {
  // Every combination of the three web flags, including unset (each flag's
  // default) — and FEATURE_ACTIVATION_DATE unset, which grandfathers every
  // existing workspace.
  const FLAG_COMBOS: Partial<Record<(typeof ENV_KEYS)[number], string>>[] = [];
  for (const billing of [undefined, "true", "false"]) {
    for (const master of [undefined, "false"]) {
      for (const gym of [undefined, "false"]) {
        for (const activation of [ACTIVATION, undefined]) {
          FLAG_COMBOS.push({
            NEXT_PUBLIC_BILLING_AVAILABLE: billing,
            NEXT_PUBLIC_SUBSCRIPTION_ENFORCEMENT_ENABLED: master,
            NEXT_PUBLIC_GYM_TRIAL_ENFORCEMENT_ENABLED: gym,
            FEATURE_ACTIVATION_DATE: activation,
          });
        }
      }
    }
  }

  it.each(FLAG_COMBOS.map((flags) => [JSON.stringify(flags), flags]))("with %s", async (_label, flags) => {
    setEnv({ ...flags, BILLING_TEST_WHITELIST_EMAILS: WHITELISTED });

    let currentRow: EntitlementRow | null = null;
    const calls = { upserts: [] };
    jest.doMock("@/lib/supabase/server", () => ({ createServiceClient: () => fakeAdmin({ entitlement: currentRow }, calls) }));
    jest.doMock(MOBILE_API_SUPABASE, () => ({ createServiceClient: () => fakeAdmin({ entitlement: currentRow }, calls) }));
    const web = await import("@/lib/entitlements/entitlements");
    const mobile = await import(MOBILE_API_ENTITLEMENTS);

    const mismatches: string[] = [];
    let readOnlyCount = 0;
    let cardCount = 0;
    for (const entitlement of [null, ...STATUSES.map(row)]) {
      currentRow = entitlement;
      for (const email of [WHITELISTED, `coach+nutriai-adults@example.com`, NOT_WHITELISTED, null]) {
        for (const workspace of [GRANDFATHERED_WORKSPACE, NEW_WORKSPACE]) {
          const w = await web.getEntitlementSnapshot(workspace.id, "gym", email);
          const webCard = web.requiresCardBeforeFirstTrial({
            workspaceCreatedAt: workspace.createdAt,
            entitlementStatus: w.status,
            ownerEmail: email,
          });
          const m = await mobile.getEntitlementSnapshot(workspace, "gym", email);

          const label = `${entitlement?.status ?? "no row"} / ${email} / ${workspace.id}`;
          if (m.status !== w.status) mismatches.push(`${label}: status ${m.status} vs web ${w.status}`);
          if (m.isReadOnly !== w.isReadOnly) mismatches.push(`${label}: isReadOnly ${m.isReadOnly} vs web ${w.isReadOnly}`);
          if (m.requiresCardBeforeTrial !== webCard) mismatches.push(`${label}: card ${m.requiresCardBeforeTrial} vs web ${webCard}`);
          if (w.isReadOnly) readOnlyCount++;
          if (webCard) cardCount++;
        }
      }
    }

    expect(mismatches).toEqual([]);
    // Not vacuous: wherever the web blocks anyone, some cases here are blocked.
    const billingOn = flags.NEXT_PUBLIC_BILLING_AVAILABLE === "true";
    const enforcementOn = billingOn && !flags.NEXT_PUBLIC_SUBSCRIPTION_ENFORCEMENT_ENABLED && !flags.NEXT_PUBLIC_GYM_TRIAL_ENFORCEMENT_ENABLED;
    expect(readOnlyCount > 0).toBe(enforcementOn);
    expect(cardCount > 0).toBe(billingOn && !!flags.FEATURE_ACTIVATION_DATE);
  });

  it("starts trials of the same length", async () => {
    const web = await import("@/lib/billing/pricing");
    const mobile = await import(MOBILE_API_ENTITLEMENTS);
    expect(mobile.TRIAL_LENGTH_DAYS_BY_MODULE).toEqual(web.TRIAL_LENGTH_DAYS_BY_MODULE);
  });
});

describe("POST /gym/clients (mobile-api addClient)", () => {
  const INPUT = { fullName: "Asha Rao", whatsappNumber: "+919800000001" };

  async function load(opts: { entitlement: EntitlementRow | null; upsertError?: string; billing?: boolean }) {
    setEnv({
      NEXT_PUBLIC_BILLING_AVAILABLE: opts.billing === false ? undefined : "true",
      FEATURE_ACTIVATION_DATE: ACTIVATION,
      BILLING_TEST_WHITELIST_EMAILS: WHITELISTED,
    });
    const calls = { upserts: [] as { row: any; options: any }[], inserts: [] as any[] };
    jest.doMock(MOBILE_API_SUPABASE, () => ({ createServiceClient: () => fakeAdmin(opts, calls) }));
    const gym = await import(MOBILE_API_GYM);
    return { gym, calls };
  }

  it("refuses an expired or cancelled Coach plan, and inserts nothing", async () => {
    for (const status of ["expired", "cancelled"]) {
      jest.resetModules();
      const { gym, calls } = await load({ entitlement: row(status) });
      const result = await gym.addClient(GRANDFATHERED_WORKSPACE, { id: "coach-1", email: NOT_WHITELISTED }, INPUT, fakeCoachClient(calls));
      expect([status, result.error]).toEqual([status, gym.addClientBlockedReason({ isReadOnly: true, requiresCardBeforeTrial: false })]);
      expect(calls.inserts).toEqual([]);
      expect(calls.upserts).toEqual([]);
    }
  });

  it("refuses a new workspace whose card goes in before its first trial", async () => {
    for (const entitlement of [null, row("not_started")]) {
      jest.resetModules();
      const { gym, calls } = await load({ entitlement });
      const result = await gym.addClient(NEW_WORKSPACE, { id: "coach-1", email: NOT_WHITELISTED }, INPUT, fakeCoachClient(calls));
      expect(result.error).toBe(gym.addClientBlockedReason({ isReadOnly: false, requiresCardBeforeTrial: true }));
      expect(calls.inserts).toEqual([]);
    }
  });

  it("never blocks on not_started alone: a whitelisted coach stuck there keeps adding", async () => {
    // recordCheckoutIntent writes a not_started row, and startTrialIfNeeded
    // (ignoreDuplicates) never replaces it — this is a real production
    // coach's state, and every add must keep working for them.
    const { gym, calls } = await load({ entitlement: row("not_started") });
    const coach = { id: "coach-1", email: WHITELISTED };
    const first = await gym.addClient(NEW_WORKSPACE, coach, INPUT, fakeCoachClient(calls));
    const second = await gym.addClient(NEW_WORKSPACE, coach, { ...INPUT, whatsappNumber: "+919800000002" }, fakeCoachClient(calls));
    expect([first.error, second.error]).toEqual([undefined, undefined]);
    expect(calls.inserts).toHaveLength(2);
  });

  it("lets a grandfathered not_started workspace add, and starts its 30-day Coach trial", async () => {
    const { gym, calls } = await load({ entitlement: row("not_started") });
    const result = await gym.addClient(GRANDFATHERED_WORKSPACE, { id: "coach-1", email: NOT_WHITELISTED }, INPUT, fakeCoachClient(calls));

    expect(result).toEqual({ clientId: "client-1" });
    expect(calls.upserts).toHaveLength(1);
    const { row: trial, options } = calls.upserts[0];
    expect(trial).toMatchObject({ workspace_id: "ws-old", owner_id: "coach-1", module: "gym", status: "trialing" });
    expect(new Date(trial.trial_end_at).getTime() - new Date(trial.trial_start_at).getTime()).toBe(30 * 24 * 60 * 60 * 1000);
    // Never overwrites an existing row, the same as the main app.
    expect(options).toEqual({ onConflict: "workspace_id,module", ignoreDuplicates: true });
  });

  it("runs the trial start on every add, since it is a no-op once a row exists", async () => {
    const { gym, calls } = await load({ entitlement: row("trialing") });
    await gym.addClient(GRANDFATHERED_WORKSPACE, { id: "coach-1", email: NOT_WHITELISTED }, INPUT, fakeCoachClient(calls));
    expect(calls.upserts).toHaveLength(1);
  });

  it("allows every status that still has access", async () => {
    for (const status of ["trialing", "active", "past_due", "cancel_at_period_end", "grace_period"]) {
      jest.resetModules();
      const { gym, calls } = await load({ entitlement: row(status) });
      const result = await gym.addClient(NEW_WORKSPACE, { id: "coach-1", email: NOT_WHITELISTED }, INPUT, fakeCoachClient(calls));
      expect([status, result.error]).toEqual([status, undefined]);
    }
  });

  it("exempts a whitelisted coach whose plan expired", async () => {
    const { gym, calls } = await load({ entitlement: row("expired") });
    const result = await gym.addClient(GRANDFATHERED_WORKSPACE, { id: "coach-1", email: WHITELISTED }, INPUT, fakeCoachClient(calls));
    expect(result.error).toBeUndefined();
  });

  it("blocks no one while BILLING_AVAILABLE is unset on mobile-api", async () => {
    // The safe default: deploying this changes nothing until the flags are
    // set on the nutriai-mobile-api Pages project.
    for (const [workspace, entitlement] of [
      [GRANDFATHERED_WORKSPACE, row("expired")],
      [NEW_WORKSPACE, null],
    ] as const) {
      jest.resetModules();
      const { gym, calls } = await load({ entitlement, billing: false });
      const result = await gym.addClient(workspace, { id: "coach-1", email: NOT_WHITELISTED }, INPUT, fakeCoachClient(calls));
      expect(result.error).toBeUndefined();
    }
  });

  it("starts no trial when the insert fails", async () => {
    const { gym, calls } = await load({ entitlement: row("not_started") });
    const result = await gym.addClient(
      GRANDFATHERED_WORKSPACE,
      { id: "coach-1", email: NOT_WHITELISTED },
      INPUT,
      fakeCoachClient(calls, "GYM_CLIENT_LIMIT_REACHED")
    );
    expect(result.error).toMatch(/client limit/);
    expect(calls.upserts).toEqual([]);
  });

  it("still reports the add when only the trial start fails", async () => {
    // The client row exists by then; an error would send the coach back to
    // a form whose retry fails on "number already registered".
    const { gym, calls } = await load({ entitlement: row("not_started"), upsertError: "boom" });
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    const result = await gym.addClient(GRANDFATHERED_WORKSPACE, { id: "coach-1", email: NOT_WHITELISTED }, INPUT, fakeCoachClient(calls));
    expect(result).toEqual({ clientId: "client-1" });
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("refusal copy never asks the coach to pay", async () => {
    const gym = await import(MOBILE_API_GYM);
    const reasons = [
      gym.addClientBlockedReason({ isReadOnly: true, requiresCardBeforeTrial: false }),
      gym.addClientBlockedReason({ isReadOnly: false, requiresCardBeforeTrial: true }),
    ];
    for (const reason of reasons) {
      expect(reason).toEqual(expect.any(String));
      expect(reason).not.toMatch(/subscri|purchas|\bbuy\b|upgrade|\bpay|card|price|checkout|trial|https?:|www\.|\.club|\.com/i);
    }
    expect(gym.addClientBlockedReason({ isReadOnly: false, requiresCardBeforeTrial: false })).toBeNull();
  });
});

describe("the route and the app use the server's refusal", () => {
  const ROUTE = "apps/mobile-api/src/app/gym/[...path]/route.ts";
  const LIST = "apps/mobile/src/app/(app)/gym/index.tsx";

  it("checks the entitlement as the signed-in coach, with the workspace's creation date", () => {
    const route = code(ROUTE);
    expect(route).toMatch(/addClient\(workspace, \{ id: auth\.user\.id, email: auth\.user\.email \}/);
    expect(route).toMatch(/getEntitlementSnapshot\(workspace, "gym", auth\.user\.email\)/);
  });

  it("GET /gym/workspace reports the same refusal POST would give", () => {
    expect(code(ROUTE)).toMatch(/addClientBlockedReason: addClientBlockedReason\(entitlement\)/);
  });

  it("the coach list stops offering Add and shows the server's words", () => {
    const list = code(LIST);
    expect(list).toMatch(/addBlockedReason: addClientBlockedReason \?\? null/);
    expect(list).toMatch(/const canAdd = !state\.addBlockedReason && /);
    expect(list).toMatch(/message=\{state\.addBlockedReason\}/);
    // Still no status gate of its own — see the not_started case above.
    expect(list).not.toMatch(/not_started|requiresCardBeforeTrial/);
    expect(list).not.toMatch(/Subscribe|Upgrade|Purchases\./);
  });

  it("the add form shows the server's error message as-is", () => {
    // The API client carries body.error through as the message, and the
    // form renders that message — which covers older builds too.
    expect(code("apps/mobile/src/lib/api.ts")).toMatch(/throw new ApiError\(res\.status, body\.error \?\? res\.statusText\)/);
    expect(code("apps/mobile/src/components/person-form.tsx")).toMatch(/setError\(err instanceof Error \? err\.message/);
  });
});

// Route-level coverage for the RevenueCat webhook (see
// src/app/api/webhooks/revenuecat/route.ts's module doc) — unlike Stripe/
// Razorpay there's no shared processProviderWebhook pipeline to test
// separately, since RevenueCat's payload is already the authoritative
// entitlement state and resolution is a direct owner_id lookup. This tests
// the route itself end to end against a fake Supabase client.

jest.mock("@/lib/supabase/server", () => ({ createServiceClient: jest.fn() }));

import { createServiceClient } from "@/lib/supabase/server";
import { NextRequest } from "next/server";

const AUTH_HEADER = "Bearer test-revenuecat-secret";

function fakeDb(opts: {
  entitlementRow?: { workspace_id: string; module: string } | null;
  existingEvent?: { processed_at: string | null } | null;
  /** A workspace findEntitlementByOwner can fall back to when no
   * entitlements row exists yet — see entitlements.ts's own comment on
   * why this fallback exists (mobile IAP purchases before any prior
   * checkout-intent/trial-start ever created a row). */
  workspaceForOwner?: { ownerId: string; module: string; workspaceId: string } | null;
  /** Simulates the payment_webhook_events insert itself failing for a
   * reason OTHER than a genuine duplicate — e.g. the enum-value rejection
   * from migration 0042 (payment_provider didn't include 'apple'/
   * 'google_play' for a long time, so every real store webhook insert
   * failed here, before any event-type/entitlement logic ever ran). */
  insertFailure?: { code: string; message: string } | null;
}) {
  const webhookEvents = new Map<string, { processed_at: string | null }>();
  if (opts.existingEvent) webhookEvents.set("apple:evt_1", opts.existingEvent);
  if (opts.existingEvent) webhookEvents.set("google_play:evt_1", opts.existingEvent);

  const entitlementUpdates: any[] = [];

  return {
    webhookEvents,
    entitlementUpdates,
    db: {
      from(table: string) {
        if (table === "payment_webhook_events") {
          return {
            select: () => ({
              eq: (_c1: string, provider: string) => ({
                eq: (_c2: string, eventId: string) => ({
                  maybeSingle: async () => {
                    const existing = webhookEvents.get(`${provider}:${eventId}`);
                    return { data: existing ? { id: `${provider}:${eventId}`, ...existing } : null };
                  },
                }),
              }),
            }),
            insert: async (row: any) => {
              if (opts.insertFailure) return { error: opts.insertFailure };
              const key = `${row.provider}:${row.provider_event_id}`;
              // Real Postgres unique_violation code — this branch is
              // actually unreachable given the route's `if (!existing)`
              // guard above it, but kept realistic (matching route.ts's
              // 23505 check) in case that guard is ever relaxed.
              if (webhookEvents.has(key)) return { error: { code: "23505", message: "duplicate key" } };
              webhookEvents.set(key, { processed_at: null });
              return { error: null };
            },
            update: (patch: any) => ({
              eq: (_c1: string, provider: string) => ({
                eq: (_c2: string, eventId: string) => {
                  const key = `${provider}:${eventId}`;
                  const existing = webhookEvents.get(key);
                  if (existing) webhookEvents.set(key, { ...existing, processed_at: patch.processed_at });
                  return Promise.resolve({ error: null });
                },
              }),
            }),
          };
        }
        if (table === "entitlements") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: opts.entitlementRow ?? null }),
                }),
              }),
            }),
            upsert: (row: any) => {
              entitlementUpdates.push(row);
              return Promise.resolve({ error: null });
            },
          };
        }
        if (table === "workspaces") {
          return {
            select: () => ({
              eq: (_c1: string, ownerId: string) => ({
                eq: (_c2: string, module: string) => ({
                  order: () => ({
                    limit: () => ({
                      maybeSingle: async () => {
                        const w = opts.workspaceForOwner;
                        const match = w && w.ownerId === ownerId && w.module === module;
                        return { data: match ? { id: w!.workspaceId } : null };
                      },
                    }),
                  }),
                }),
              }),
            }),
          };
        }
        throw new Error(`unexpected table ${table}`);
      },
    },
  };
}

function postRequest(body: unknown, authHeader: string | null = AUTH_HEADER): NextRequest {
  return new NextRequest("https://example.com/api/webhooks/revenuecat", {
    method: "POST",
    headers: authHeader ? { authorization: authHeader } : {},
    body: JSON.stringify(body),
  });
}

describe("POST /api/webhooks/revenuecat", () => {
  const originalEnv = process.env.REVENUECAT_WEBHOOK_AUTH_HEADER;
  beforeEach(() => {
    process.env.REVENUECAT_WEBHOOK_AUTH_HEADER = AUTH_HEADER;
  });
  afterEach(() => {
    process.env.REVENUECAT_WEBHOOK_AUTH_HEADER = originalEnv;
  });

  it("rejects a request with a missing/incorrect Authorization header", async () => {
    (createServiceClient as jest.Mock).mockReturnValue(fakeDb({}).db);
    const { POST } = await import("@/app/api/webhooks/revenuecat/route");

    const res = await POST(postRequest({ event: { id: "evt_1" } }, "Bearer wrong-secret"));
    expect(res.status).toBe(401);
  });

  it("applies an active subscription snapshot for a matching adults entitlement", async () => {
    const { db, entitlementUpdates } = fakeDb({ entitlementRow: { workspace_id: "ws-1", module: "adults" } });
    (createServiceClient as jest.Mock).mockReturnValue(db);
    const { POST } = await import("@/app/api/webhooks/revenuecat/route");

    const res = await POST(
      postRequest({
        event: {
          id: "evt_1",
          type: "INITIAL_PURCHASE",
          app_user_id: "user-1",
          store: "PLAY_STORE",
          period_type: "NORMAL",
          product_id: "family_premium:monthly",
          purchased_at_ms: 1700000000000,
          expiration_at_ms: 1702592000000,
        },
      })
    );

    const json = await res.json();
    expect(json.result).toBe("processed");
    expect(entitlementUpdates).toHaveLength(1);
    expect(entitlementUpdates[0]).toMatchObject({ status: "active", payment_provider: "google_play" });
  });

  it("is idempotent — a retried event is not applied twice", async () => {
    const { db, entitlementUpdates } = fakeDb({
      entitlementRow: { workspace_id: "ws-1", module: "adults" },
      existingEvent: { processed_at: new Date().toISOString() },
    });
    (createServiceClient as jest.Mock).mockReturnValue(db);
    const { POST } = await import("@/app/api/webhooks/revenuecat/route");

    const res = await POST(
      postRequest({ event: { id: "evt_1", type: "RENEWAL", app_user_id: "user-1", store: "PLAY_STORE" } })
    );
    const json = await res.json();
    expect(json.result).toBe("duplicate");
    expect(entitlementUpdates).toHaveLength(0);
  });

  it("resolves a coach_premium product to the gym entitlement module", async () => {
    const { db, entitlementUpdates } = fakeDb({ entitlementRow: { workspace_id: "ws-2", module: "gym" } });
    (createServiceClient as jest.Mock).mockReturnValue(db);
    const { POST } = await import("@/app/api/webhooks/revenuecat/route");

    const res = await POST(
      postRequest({
        event: {
          id: "evt_1",
          type: "INITIAL_PURCHASE",
          app_user_id: "coach-1",
          store: "PLAY_STORE",
          period_type: "NORMAL",
          product_id: "coach_premium:annual",
          purchased_at_ms: 1700000000000,
          expiration_at_ms: 1702592000000,
        },
      })
    );

    const json = await res.json();
    expect(json.result).toBe("processed");
    expect(entitlementUpdates).toHaveLength(1);
    expect(entitlementUpdates[0]).toMatchObject({ status: "active", payment_provider: "google_play" });
  });

  it("ignores an event with an unrecognized product id, without applying any snapshot", async () => {
    const { db, entitlementUpdates } = fakeDb({ entitlementRow: { workspace_id: "ws-1", module: "adults" } });
    (createServiceClient as jest.Mock).mockReturnValue(db);
    const { POST } = await import("@/app/api/webhooks/revenuecat/route");

    const res = await POST(
      postRequest({
        event: { id: "evt_1", type: "RENEWAL", app_user_id: "user-1", store: "PLAY_STORE", product_id: "some_old_removed_product" },
      })
    );
    const json = await res.json();
    expect(json.result).toBe("ignored");
    expect(entitlementUpdates).toHaveLength(0);
  });

  it("ignores an event when neither an entitlements row nor a workspace exists for the app_user_id", async () => {
    const { db, entitlementUpdates } = fakeDb({ entitlementRow: null, workspaceForOwner: null });
    (createServiceClient as jest.Mock).mockReturnValue(db);
    const { POST } = await import("@/app/api/webhooks/revenuecat/route");

    const res = await POST(
      postRequest({ event: { id: "evt_1", type: "RENEWAL", app_user_id: "unknown-user", store: "APP_STORE" } })
    );
    const json = await res.json();
    expect(json.result).toBe("ignored");
    expect(entitlementUpdates).toHaveLength(0);
  });

  // Regression test for the actual reported bug: restoring/purchasing on
  // mobile before ever adding a first contact/client left no entitlements
  // row for findEntitlementByOwner to find (that row is only ever created
  // lazily by startTrialIfNeeded/recordCheckoutIntent, neither of which
  // mobile's card-first RevenueCat purchase flow triggers) — so the
  // webhook silently dropped the purchase and the app was stuck forever on
  // "Confirming your subscription…". The workspace itself always exists by
  // then, so this must succeed via that fallback instead of being ignored.
  it("creates the entitlements row from the workspace when a purchase/restore lands before one exists yet", async () => {
    const { db, entitlementUpdates } = fakeDb({
      entitlementRow: null,
      workspaceForOwner: { ownerId: "user-fresh", module: "adults", workspaceId: "ws-fresh" },
    });
    (createServiceClient as jest.Mock).mockReturnValue(db);
    const { POST } = await import("@/app/api/webhooks/revenuecat/route");

    const res = await POST(
      postRequest({
        event: {
          id: "evt_1",
          type: "INITIAL_PURCHASE",
          app_user_id: "user-fresh",
          store: "PLAY_STORE",
          period_type: "TRIAL",
          product_id: "family_premium:monthly",
          purchased_at_ms: 1700000000000,
          expiration_at_ms: 1702592000000,
        },
      })
    );

    const json = await res.json();
    expect(json.result).toBe("processed");
    expect(entitlementUpdates).toHaveLength(1);
    expect(entitlementUpdates[0]).toMatchObject({
      workspace_id: "ws-fresh",
      module: "adults",
      owner_id: "user-fresh",
      status: "trialing",
      payment_provider: "google_play",
    });
  });

  // Regression test for the actual root cause of every "restore/subscribe
  // never takes effect" report this session: payment_provider (migration
  // 0001) only had 'stripe'/'razorpay' — inserting a payment_webhook_events
  // row with provider 'apple'/'google_play' failed with a Postgres enum
  // error on every single RevenueCat webhook, and the route previously
  // treated ANY insert error the same as a harmless already-seen
  // duplicate, returning 200 with nothing ever recorded or applied. A
  // non-duplicate insert failure must now surface as a real error instead.
  it("surfaces a non-duplicate insert failure instead of silently reporting it as a harmless duplicate", async () => {
    const { db, entitlementUpdates } = fakeDb({
      entitlementRow: { workspace_id: "ws-1", module: "adults" },
      insertFailure: { code: "22P02", message: 'invalid input value for enum payment_provider: "google_play"' },
    });
    (createServiceClient as jest.Mock).mockReturnValue(db);
    const { POST } = await import("@/app/api/webhooks/revenuecat/route");

    const res = await POST(
      postRequest({ event: { id: "evt_1", type: "INITIAL_PURCHASE", app_user_id: "user-1", store: "PLAY_STORE", period_type: "NORMAL" } })
    );

    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.received).toBe(false);
    expect(entitlementUpdates).toHaveLength(0);
  });

  it("acknowledges a TEST event without touching any entitlement", async () => {
    const { db, entitlementUpdates } = fakeDb({ entitlementRow: { workspace_id: "ws-1", module: "adults" } });
    (createServiceClient as jest.Mock).mockReturnValue(db);
    const { POST } = await import("@/app/api/webhooks/revenuecat/route");

    const res = await POST(postRequest({ event: { id: "evt_1", type: "TEST", app_user_id: "user-1", store: "APP_STORE" } }));
    const json = await res.json();
    expect(json.result).toBe("ignored");
    expect(entitlementUpdates).toHaveLength(0);
  });
});

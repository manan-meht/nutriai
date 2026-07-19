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

function fakeDb(opts: { entitlementRow?: { workspace_id: string; module: string } | null; existingEvent?: { processed_at: string | null } | null }) {
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
              const key = `${row.provider}:${row.provider_event_id}`;
              if (webhookEvents.has(key)) return { error: { message: "duplicate" } };
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
            update: (patch: any) => {
              entitlementUpdates.push(patch);
              return { eq: () => ({ eq: () => Promise.resolve({ error: null }) }) };
            },
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
          product_id: "family_monthly",
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

  it("ignores an event when no matching adults entitlement exists for the app_user_id", async () => {
    const { db, entitlementUpdates } = fakeDb({ entitlementRow: null });
    (createServiceClient as jest.Mock).mockReturnValue(db);
    const { POST } = await import("@/app/api/webhooks/revenuecat/route");

    const res = await POST(
      postRequest({ event: { id: "evt_1", type: "RENEWAL", app_user_id: "unknown-user", store: "APP_STORE" } })
    );
    const json = await res.json();
    expect(json.result).toBe("ignored");
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

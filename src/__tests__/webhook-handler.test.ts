import type { PaymentProvider, ProviderSubscriptionSnapshot } from "@/lib/billing/provider";

function makeFakeServiceClient(existingEvents: Map<string, { processed_at: string | null }>) {
  return {
    from: (table: string) => {
      if (table !== "payment_webhook_events") throw new Error(`unexpected table ${table}`);
      return {
        select: () => ({
          eq: (_col: string, provider: string) => ({
            eq: (_col2: string, eventId: string) => ({
              maybeSingle: async () => {
                const key = `${provider}:${eventId}`;
                const existing = existingEvents.get(key);
                return { data: existing ? { id: key, processed_at: existing.processed_at } : null };
              },
            }),
          }),
        }),
        insert: async (row: any) => {
          const key = `${row.provider}:${row.provider_event_id}`;
          if (existingEvents.has(key)) return { error: { message: "duplicate key" } };
          existingEvents.set(key, { processed_at: null });
          return { error: null };
        },
        update: (patch: any) => ({
          eq: (_col: string, provider: string) => ({
            eq: (_col2: string, eventId: string) => {
              const key = `${provider}:${eventId}`;
              const existing = existingEvents.get(key);
              if (existing) existingEvents.set(key, { ...existing, processed_at: patch.processed_at });
              return Promise.resolve({ error: null });
            },
          }),
        }),
      };
    },
  };
}

function makeFakeProvider(opts: {
  verifyResult: { valid: boolean; eventId?: string; eventType?: string; payload?: unknown };
  subscriptionSnapshot?: ProviderSubscriptionSnapshot | null;
}): PaymentProvider {
  return {
    name: "stripe",
    createOrRetrieveCustomer: jest.fn(),
    createCheckoutSession: jest.fn(),
    retrieveSubscription: jest.fn().mockResolvedValue(opts.subscriptionSnapshot ?? null),
    findLatestSubscriptionForCustomer: jest.fn().mockResolvedValue(opts.subscriptionSnapshot ?? null),
    cancelSubscription: jest.fn(),
    reactivateSubscription: jest.fn(),
    openBillingPortal: jest.fn(),
    verifyWebhookSignature: jest.fn().mockResolvedValue(opts.verifyResult),
  };
}

const baseSnapshot: ProviderSubscriptionSnapshot = {
  providerSubscriptionId: "sub_123",
  providerCustomerId: "cus_123",
  status: "active",
  currentPeriodStart: "2026-01-01T00:00:00.000Z",
  currentPeriodEnd: "2026-02-01T00:00:00.000Z",
  cancelAtPeriodEnd: false,
  cancelledAt: null,
  trialStart: null,
  trialEnd: null,
};

describe("processProviderWebhook", () => {
  afterEach(() => jest.resetModules());

  it("rejects an invalid/unverifiable signature without touching the database", async () => {
    jest.resetModules();
    const events = new Map();
    jest.doMock("@/lib/supabase/server", () => ({ createServiceClient: () => makeFakeServiceClient(events) }));
    jest.doMock("@/lib/entitlements/entitlements", () => ({
      findEntitlementByProviderSubscriptionId: jest.fn(),
      findEntitlementByProviderCustomerId: jest.fn(),
      applyProviderSubscriptionSnapshot: jest.fn(),
    }));
    const { processProviderWebhook } = await import("@/lib/billing/webhook-handler");

    const provider = makeFakeProvider({ verifyResult: { valid: false } });
    const outcome = await processProviderWebhook(provider, "stripe", "{}", "bad-signature");

    expect(outcome).toEqual({ result: "invalid_signature" });
    expect(events.size).toBe(0);
  });

  it("processes a valid event exactly once, applying the entitlement snapshot for the matching workspace/module", async () => {
    jest.resetModules();
    const events = new Map();
    const applySnapshot = jest.fn().mockResolvedValue(undefined);
    jest.doMock("@/lib/supabase/server", () => ({ createServiceClient: () => makeFakeServiceClient(events) }));
    jest.doMock("@/lib/entitlements/entitlements", () => ({
      findEntitlementByProviderSubscriptionId: jest.fn().mockResolvedValue({ workspaceId: "ws-family-1", module: "adults" }),
      findEntitlementByProviderCustomerId: jest.fn(),
      applyProviderSubscriptionSnapshot: applySnapshot,
    }));
    const { processProviderWebhook } = await import("@/lib/billing/webhook-handler");

    const payload = { data: { object: { object: "subscription", id: "sub_123", customer: "cus_123" } } };
    const provider = makeFakeProvider({
      verifyResult: { valid: true, eventId: "evt_1", eventType: "customer.subscription.updated", payload },
      subscriptionSnapshot: baseSnapshot,
    });

    const outcome = await processProviderWebhook(provider, "stripe", JSON.stringify(payload), "sig");

    expect(outcome).toEqual({ result: "processed" });
    expect(applySnapshot).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId: "ws-family-1",
      module: "adults",
      provider: "stripe",
      snapshot: baseSnapshot,
    }));
  });

  it("does not reprocess a duplicate (retried) webhook event", async () => {
    jest.resetModules();
    const events = new Map();
    const applySnapshot = jest.fn().mockResolvedValue(undefined);
    jest.doMock("@/lib/supabase/server", () => ({ createServiceClient: () => makeFakeServiceClient(events) }));
    jest.doMock("@/lib/entitlements/entitlements", () => ({
      findEntitlementByProviderSubscriptionId: jest.fn().mockResolvedValue({ workspaceId: "ws-family-1", module: "adults" }),
      findEntitlementByProviderCustomerId: jest.fn(),
      applyProviderSubscriptionSnapshot: applySnapshot,
    }));
    const { processProviderWebhook } = await import("@/lib/billing/webhook-handler");

    const payload = { data: { object: { object: "subscription", id: "sub_123", customer: "cus_123" } } };
    const provider = makeFakeProvider({
      verifyResult: { valid: true, eventId: "evt_dup", eventType: "customer.subscription.updated", payload },
      subscriptionSnapshot: baseSnapshot,
    });

    const first = await processProviderWebhook(provider, "stripe", JSON.stringify(payload), "sig");
    const second = await processProviderWebhook(provider, "stripe", JSON.stringify(payload), "sig");

    expect(first).toEqual({ result: "processed" });
    expect(second).toEqual({ result: "duplicate" });
    expect(applySnapshot).toHaveBeenCalledTimes(1); // not re-applied on the retry
  });

  it("a Family (adults) webhook event only ever updates the adults entitlement, never gym", async () => {
    jest.resetModules();
    const events = new Map();
    const applySnapshot = jest.fn().mockResolvedValue(undefined);
    jest.doMock("@/lib/supabase/server", () => ({ createServiceClient: () => makeFakeServiceClient(events) }));
    jest.doMock("@/lib/entitlements/entitlements", () => ({
      findEntitlementByProviderSubscriptionId: jest.fn().mockResolvedValue({ workspaceId: "ws-1", module: "adults" }),
      findEntitlementByProviderCustomerId: jest.fn(),
      applyProviderSubscriptionSnapshot: applySnapshot,
    }));
    const { processProviderWebhook } = await import("@/lib/billing/webhook-handler");

    const payload = { data: { object: { object: "subscription", id: "sub_family", customer: "cus_1" } } };
    const provider = makeFakeProvider({
      verifyResult: { valid: true, eventId: "evt_family", eventType: "customer.subscription.updated", payload },
      subscriptionSnapshot: { ...baseSnapshot, providerSubscriptionId: "sub_family" },
    });

    await processProviderWebhook(provider, "stripe", JSON.stringify(payload), "sig");

    const call = applySnapshot.mock.calls[0][0];
    expect(call.module).toBe("adults");
    expect(call.module).not.toBe("gym");
  });

  it("ignores a valid event when no matching entitlement can be found (no data corruption)", async () => {
    jest.resetModules();
    const events = new Map();
    const applySnapshot = jest.fn();
    jest.doMock("@/lib/supabase/server", () => ({ createServiceClient: () => makeFakeServiceClient(events) }));
    jest.doMock("@/lib/entitlements/entitlements", () => ({
      findEntitlementByProviderSubscriptionId: jest.fn().mockResolvedValue(null),
      findEntitlementByProviderCustomerId: jest.fn().mockResolvedValue(null),
      applyProviderSubscriptionSnapshot: applySnapshot,
    }));
    const { processProviderWebhook } = await import("@/lib/billing/webhook-handler");

    const payload = { data: { object: { object: "subscription", id: "sub_orphan", customer: "cus_orphan" } } };
    const provider = makeFakeProvider({
      verifyResult: { valid: true, eventId: "evt_orphan", eventType: "customer.subscription.updated", payload },
    });

    const outcome = await processProviderWebhook(provider, "stripe", JSON.stringify(payload), "sig");

    expect(outcome).toEqual({ result: "ignored", reason: expect.any(String) });
    expect(applySnapshot).not.toHaveBeenCalled();
  });
});

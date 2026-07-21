import { buildSnapshotFromRevenueCatEvent, mapRevenueCatEventToStatus, providerForStore, type RevenueCatEvent } from "@/lib/billing/revenuecat";

function event(overrides: Partial<RevenueCatEvent> & Pick<RevenueCatEvent, "type" | "store">): RevenueCatEvent {
  return {
    id: "evt_1",
    app_user_id: "user-1",
    ...overrides,
  };
}

describe("providerForStore", () => {
  it("maps APP_STORE/MAC_APP_STORE to apple and PLAY_STORE to google_play", () => {
    expect(providerForStore("APP_STORE")).toBe("apple");
    expect(providerForStore("MAC_APP_STORE")).toBe("apple");
    expect(providerForStore("PLAY_STORE")).toBe("google_play");
  });

  it("returns null for stores outside this rollout's scope", () => {
    expect(providerForStore("AMAZON")).toBeNull();
    expect(providerForStore("STRIPE")).toBeNull();
    expect(providerForStore("PROMOTIONAL")).toBeNull();
  });
});

describe("mapRevenueCatEventToStatus", () => {
  it("maps a normal-period purchase/renewal to active", () => {
    expect(mapRevenueCatEventToStatus(event({ type: "INITIAL_PURCHASE", store: "PLAY_STORE", period_type: "NORMAL" }))).toBe("active");
    expect(mapRevenueCatEventToStatus(event({ type: "RENEWAL", store: "APP_STORE", period_type: "NORMAL" }))).toBe("active");
  });

  it("maps a trial-period purchase to trialing", () => {
    expect(mapRevenueCatEventToStatus(event({ type: "INITIAL_PURCHASE", store: "PLAY_STORE", period_type: "TRIAL" }))).toBe("trialing");
  });

  it("maps CANCELLATION to cancel_at_period_end", () => {
    expect(mapRevenueCatEventToStatus(event({ type: "CANCELLATION", store: "APP_STORE" }))).toBe("cancel_at_period_end");
  });

  it("maps EXPIRATION to expired", () => {
    expect(mapRevenueCatEventToStatus(event({ type: "EXPIRATION", store: "APP_STORE" }))).toBe("expired");
  });

  it("maps BILLING_ISSUE to grace_period", () => {
    expect(mapRevenueCatEventToStatus(event({ type: "BILLING_ISSUE", store: "PLAY_STORE" }))).toBe("grace_period");
  });

  it("does not act on TEST events", () => {
    expect(mapRevenueCatEventToStatus(event({ type: "TEST", store: "APP_STORE" }))).toBeNull();
  });
});

describe("buildSnapshotFromRevenueCatEvent", () => {
  it("builds a snapshot using the app_user_id as providerCustomerId and original_transaction_id as providerSubscriptionId", () => {
    const snapshot = buildSnapshotFromRevenueCatEvent(
      event({
        type: "RENEWAL",
        store: "PLAY_STORE",
        app_user_id: "user-42",
        original_transaction_id: "txn-original-1",
        purchased_at_ms: 1700000000000,
        expiration_at_ms: 1702592000000,
        period_type: "NORMAL",
      })
    );
    expect(snapshot).toEqual({
      providerSubscriptionId: "txn-original-1",
      providerCustomerId: "user-42",
      status: "active",
      currentPeriodStart: new Date(1700000000000).toISOString(),
      currentPeriodEnd: new Date(1702592000000).toISOString(),
      cancelAtPeriodEnd: false,
      cancelledAt: null,
      trialStart: null,
      trialEnd: null,
    });
  });

  it("returns null for event types that aren't acted on (e.g. TEST)", () => {
    expect(buildSnapshotFromRevenueCatEvent(event({ type: "TEST", store: "APP_STORE" }))).toBeNull();
  });

  it("marks cancelAtPeriodEnd and cancelledAt for CANCELLATION", () => {
    const snapshot = buildSnapshotFromRevenueCatEvent(
      event({ type: "CANCELLATION", store: "APP_STORE", event_timestamp_ms: 1700000000000 })
    );
    expect(snapshot?.status).toBe("cancel_at_period_end");
    expect(snapshot?.cancelAtPeriodEnd).toBe(true);
    expect(snapshot?.cancelledAt).toBe(new Date(1700000000000).toISOString());
  });
});

// Mock @supabase/supabase-js before importing the module under test, so
// the service client never makes a real network call to Supabase.
//
// mockEq resolves the token lookup (from().select().eq()). The other
// builders below only need to be thenable no-ops for the send path, except
// deletes and the receipt sweep's select, which the prune tests inspect.
const mockEq = jest.fn();
const mockSelect = jest.fn(() => ({ eq: mockEq, not: mockNot }));
const deletedTokens: string[][] = [];
const updates: { patch: any; tokens?: string[] }[] = [];

const mockNot = jest.fn(() => ({
  lt: () => ({ limit: async () => mockReceiptRows() }),
}));
let mockReceiptRows: () => { data: any[] | null; error: any } = () => ({ data: [], error: null });

const mockFrom = jest.fn(() => ({
  select: mockSelect,
  delete: () => ({
    in: async (_col: string, tokens: string[]) => {
      deletedTokens.push(tokens);
      return { error: null };
    },
  }),
  update: (patch: any) => ({
    eq: () => ({ eq: async () => { updates.push({ patch }); return { error: null }; } }),
    in: async (_col: string, tokens: string[]) => {
      updates.push({ patch, tokens });
      return { error: null };
    },
  }),
}));

jest.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ from: mockFrom }),
}));

import { sendPushNotificationToProfile, pruneDeadPushTokens } from "@/lib/notifications/push";

describe("sendPushNotificationToProfile", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    deletedTokens.length = 0;
    updates.length = 0;
    mockReceiptRows = () => ({ data: [], error: null });
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("returns 0 and never calls Expo's push API when the profile has no registered devices", async () => {
    mockEq.mockResolvedValue({ data: [], error: null });
    const fetchSpy = jest.fn();
    global.fetch = fetchSpy as any;

    const count = await sendPushNotificationToProfile("profile-1", { title: "t", body: "b" });

    expect(count).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("sends one message per registered device token to Expo's push API", async () => {
    mockEq.mockResolvedValue({
      data: [{ expo_push_token: "ExponentPushToken[aaa]" }, { expo_push_token: "ExponentPushToken[bbb]" }],
      error: null,
    });
    const fetchSpy = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    global.fetch = fetchSpy as any;

    const count = await sendPushNotificationToProfile("profile-1", {
      title: "Meal logged",
      body: "Alex just logged a lunch.",
      data: { type: "meal_logged" },
    });

    expect(count).toBe(2);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://exp.host/--/api/v2/push/send");
    const body = JSON.parse(init.body);
    expect(body).toHaveLength(2);
    expect(body[0]).toMatchObject({ to: "ExponentPushToken[aaa]", title: "Meal logged", body: "Alex just logged a lunch." });
  });

  it("attaches richContent.image and mutableContent when an imageUrl is supplied", async () => {
    mockEq.mockResolvedValue({ data: [{ expo_push_token: "ExponentPushToken[aaa]" }], error: null });
    const fetchSpy = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    global.fetch = fetchSpy as any;

    await sendPushNotificationToProfile("profile-1", {
      title: "Your daughter logged a lunch",
      body: "Dal, rice, salad · ~480–600 kcal · 22–28g protein",
      imageUrl: "https://example.supabase.co/storage/v1/object/sign/meal-photos/x.jpg?token=abc",
      data: { type: "meal_logged" },
    });

    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(body[0].richContent).toEqual({
      image: "https://example.supabase.co/storage/v1/object/sign/meal-photos/x.jpg?token=abc",
    });
    expect(body[0].mutableContent).toBe(true);
  });

  it("omits richContent entirely when no imageUrl is supplied", async () => {
    mockEq.mockResolvedValue({ data: [{ expo_push_token: "ExponentPushToken[aaa]" }], error: null });
    const fetchSpy = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    global.fetch = fetchSpy as any;

    await sendPushNotificationToProfile("profile-1", { title: "t", body: "b" });

    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(body[0]).not.toHaveProperty("richContent");
    expect(body[0]).not.toHaveProperty("mutableContent");
  });

  it("returns 0 and swallows the error when the token lookup fails", async () => {
    mockEq.mockResolvedValue({ data: null, error: { message: "db error" } });
    const fetchSpy = jest.fn();
    global.fetch = fetchSpy as any;

    const count = await sendPushNotificationToProfile("profile-1", { title: "t", body: "b" });

    expect(count).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns 0 and swallows the error when Expo's push API returns a non-OK response", async () => {
    mockEq.mockResolvedValue({ data: [{ expo_push_token: "ExponentPushToken[aaa]" }], error: null });
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500, text: async () => "server error" }) as any;

    const count = await sendPushNotificationToProfile("profile-1", { title: "t", body: "b" });

    expect(count).toBe(0);
  });

  it("never throws, even if fetch itself rejects", async () => {
    mockEq.mockResolvedValue({ data: [{ expo_push_token: "ExponentPushToken[aaa]" }], error: null });
    global.fetch = jest.fn().mockRejectedValue(new Error("network down")) as any;

    await expect(sendPushNotificationToProfile("profile-1", { title: "t", body: "b" })).resolves.toBe(0);
  });

  it("deletes a token Expo rejects outright as DeviceNotRegistered", async () => {
    mockEq.mockResolvedValue({
      data: [{ expo_push_token: "ExponentPushToken[dead]" }, { expo_push_token: "ExponentPushToken[live]" }],
      error: null,
    });
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { status: "error", details: { error: "DeviceNotRegistered" } },
          { status: "ok", id: "ticket-live" },
        ],
      }),
    }) as any;

    const count = await sendPushNotificationToProfile("profile-1", { title: "t", body: "b" });

    expect(deletedTokens).toEqual([["ExponentPushToken[dead]"]]);
    // The dead one doesn't count as delivered — the old code returned the
    // full message count regardless, which is what made this invisible.
    expect(count).toBe(1);
  });

  it("records the ticket id against each token so the receipt can be resolved later", async () => {
    mockEq.mockResolvedValue({ data: [{ expo_push_token: "ExponentPushToken[aaa]" }], error: null });
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ status: "ok", id: "ticket-1" }] }),
    }) as any;

    await sendPushNotificationToProfile("profile-1", { title: "t", body: "b" });

    expect(updates).toHaveLength(1);
    expect(updates[0].patch.last_ticket_id).toBe("ticket-1");
    expect(updates[0].patch.last_sent_at).toEqual(expect.any(String));
  });
});

describe("pruneDeadPushTokens", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    deletedTokens.length = 0;
    updates.length = 0;
    mockReceiptRows = () => ({ data: [], error: null });
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("removes tokens whose receipt says the device is no longer registered", async () => {
    // The exact failure a caregiver hit: every token accepted at send time
    // (ticket "ok"), then reported DeviceNotRegistered by FCM afterwards.
    mockReceiptRows = () => ({
      data: [
        { expo_push_token: "ExponentPushToken[dead]", last_ticket_id: "t-dead" },
        { expo_push_token: "ExponentPushToken[live]", last_ticket_id: "t-live" },
      ],
      error: null,
    });
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          "t-dead": { status: "error", details: { error: "DeviceNotRegistered" } },
          "t-live": { status: "ok" },
        },
      }),
    }) as any;

    const result = await pruneDeadPushTokens();

    expect(result).toEqual({ checked: 2, removed: 1 });
    expect(deletedTokens).toEqual([["ExponentPushToken[dead]"]]);
    // The surviving token has its ticket cleared so it isn't re-checked.
    expect(updates.at(-1)).toMatchObject({
      patch: { last_ticket_id: null },
      tokens: ["ExponentPushToken[live]"],
    });
  });

  it("leaves a token alone when its receipt isn't ready yet", async () => {
    mockReceiptRows = () => ({
      data: [{ expo_push_token: "ExponentPushToken[aaa]", last_ticket_id: "t-1" }],
      error: null,
    });
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ data: {} }) }) as any;

    const result = await pruneDeadPushTokens();

    expect(result).toEqual({ checked: 1, removed: 0 });
    expect(deletedTokens).toEqual([]);
    expect(updates).toEqual([]);
  });

  it("does not delete tokens for a delivery error that isn't DeviceNotRegistered", async () => {
    mockReceiptRows = () => ({
      data: [{ expo_push_token: "ExponentPushToken[aaa]", last_ticket_id: "t-1" }],
      error: null,
    });
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { "t-1": { status: "error", details: { error: "MessageTooBig" } } } }),
    }) as any;

    const result = await pruneDeadPushTokens();

    expect(result).toEqual({ checked: 1, removed: 0 });
    expect(deletedTokens).toEqual([]);
  });

  it("never throws when Expo's receipts endpoint fails", async () => {
    mockReceiptRows = () => ({
      data: [{ expo_push_token: "ExponentPushToken[aaa]", last_ticket_id: "t-1" }],
      error: null,
    });
    global.fetch = jest.fn().mockRejectedValue(new Error("network down")) as any;

    await expect(pruneDeadPushTokens()).resolves.toEqual({ checked: 0, removed: 0 });
  });
});

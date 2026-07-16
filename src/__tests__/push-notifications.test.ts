// Mock @supabase/supabase-js before importing the module under test, so
// sendPushNotificationToProfile's service client never makes a real
// network call to Supabase.
const mockEq = jest.fn();
const mockSelect = jest.fn(() => ({ eq: mockEq }));
const mockFrom = jest.fn(() => ({ select: mockSelect }));

jest.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ from: mockFrom }),
}));

import { sendPushNotificationToProfile } from "@/lib/notifications/push";

describe("sendPushNotificationToProfile", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
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
});

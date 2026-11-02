// Covers the stale-clarification half of this merged cron route (see
// send-meal-reminders/route.ts's module doc — resolve-stale-clarifications
// was folded in here to avoid a second standalone route file, which
// previously pushed the Worker bundle over Cloudflare Pages' 25 MiB limit).
// The meal-reminders half isn't covered here since it predates this file
// and isn't what changed.

jest.mock("@/lib/supabase/server", () => ({ createServiceClient: jest.fn() }));
jest.mock("@/lib/notifications/push", () => ({
  sendPushNotificationToProfile: jest.fn(async () => 1),
  pruneDeadPushTokens: jest.fn(async () => ({ checked: 0, removed: 0 })),
}));
jest.mock("@/lib/whatsapp/client", () => ({
  sendTextMessage: jest.fn(),
  sendTemplateMessage: jest.fn(),
  normalizePhone: jest.fn((n: string) => n),
}));
// Nutrition Guidance: the flag on and the gate open, so the reminder path
// asks the (stubbed) loader. It returns null unless a test sets
// mockGuidance, which keeps every other test here on ordinary reminders.
jest.mock("@/lib/billing/feature-flags", () =>
  Object.defineProperty({ ...jest.requireActual("@/lib/billing/feature-flags") }, "GUIDANCE_ENABLED", {
    value: true,
    enumerable: true,
  })
);
jest.mock("@/lib/guidance/release", () => ({
  loadReleaseState: jest.fn(async () => ({ canActivate: true, isPreviewOnly: true, blockers: [], policyVersion: "v1", policyStatus: "unreviewed" })),
}));
let mockGuidance: unknown = null;
jest.mock("@/lib/guidance/whatsapp", () => ({
  ...jest.requireActual("@/lib/guidance/whatsapp"),
  loadWhatsAppGuidance: jest.fn(async () => mockGuidance),
}));

import { createServiceClient } from "@/lib/supabase/server";
import { sendTemplateMessage, sendTextMessage } from "@/lib/whatsapp/client";
import { sendPushNotificationToProfile } from "@/lib/notifications/push";
import { NextRequest } from "next/server";

const pendingMeal = {
  status: "awaiting_clarification",
  summary: "rice and dal",
  meal_type: "lunch",
  foods: [{ name: "rice", quantity: "1 cup" }],
  total_calories_min: 300,
  total_calories_max: 400,
  total_protein_min: 10,
  total_protein_max: 15,
  total_carbs_min: 40,
  total_carbs_max: 50,
  total_fat_min: 5,
  total_fat_max: 10,
  total_fiber_min: 2,
  total_fiber_max: 4,
  clarification_question: "White rice or brown rice?",
};

const defaultContactRow = {
  id: "contact-1",
  full_name: "Kamlesh Mehta",
  caregiver_id: "caregiver-1",
  relationship: "parent",
  relationship_type: "family_caregiver",
  gender: "female",
  timezone: "Asia/Kolkata",
};

function fakeDb(
  staleConversations: any[],
  {
    contactRow = defaultContactRow,
    workspacePlan = "family",
    stuckConversations = [] as any[],
    reminderContacts = [] as any[],
  }: { contactRow?: any; workspacePlan?: string; stuckConversations?: any[]; reminderContacts?: any[] } = {}
) {
  const mealLogs: any[] = [];
  const updatedConversations: any[] = [];

  const db = {
    from(table: string) {
      if (table === "adults_contacts") {
        // Only the reminders query (filtered on reminders_enabled) sees the
        // reminder contacts; the weekly-wins sweep stays empty.
        let remindersQuery = false;
        const chain: any = {
          eq: (col: string) => {
            if (col === "reminders_enabled") remindersQuery = true;
            return chain;
          },
          is: () => Promise.resolve({ data: remindersQuery ? reminderContacts : [] }),
          // The real row, not just a timezone: the caregiver comes from
          // HERE (caregiver_id), which is both the meal's trainer_id and
          // the push recipient. The previous fixture returned only a
          // timezone, which is why nothing caught the sweep reading a
          // nonexistent whatsapp_conversations.trainer_id instead.
          maybeSingle: async () => ({ data: { ...contactRow } }),
        };
        return { select: () => chain };
      }
      if (table === "gym_clients") {
        const chain: any = {
          eq: () => chain,
          is: () => Promise.resolve({ data: [] }),
          maybeSingle: async () => ({ data: { trainer_id: "gym-trainer-1" } }),
        };
        return { select: () => chain };
      }
      if (table === "workspaces") {
        const chain: any = {
          eq: () => chain,
          maybeSingle: async () => ({ data: { plan: workspacePlan } }),
        };
        return { select: () => chain };
      }
      if (table === "whatsapp_conversations") {
        return {
          // eq()'s VALUE is honoured so the two sweeps can be told apart:
          // the stale-clarification pass filters on "awaiting_clarification"
          // and the stuck-lock pass on "processing". lt() filters for real,
          // so a conversation inside the threshold is genuinely excluded
          // rather than excluded by a mock that ignores cutoffs.
          select: () => ({
            eq: (_col: string, val: string) => ({
              lt: async (ltCol: string, cutoff: string) => {
                const pool = val === "processing" ? stuckConversations : staleConversations;
                return {
                  data: pool.filter((c: any) => !c[ltCol] || new Date(c[ltCol]) < new Date(cutoff)),
                  error: null,
                };
              },
            }),
          }),
          // Awaitable after one .eq() (the stale pass) or two (the stuck-lock
          // pass, which also guards on state).
          update: (patch: any) => {
            let id: string | null = null;
            const chain: any = {
              eq(col: string, val: string) {
                if (col === "id") id = val;
                return chain;
              },
              then(onOk: any, onErr: any) {
                updatedConversations.push({ id, patch });
                return Promise.resolve({ data: null, error: null }).then(onOk, onErr);
              },
            };
            return chain;
          },
        };
      }
      if (table === "meal_logs") {
        return {
          insert: (row: any) => ({
            select: () => ({
              single: async () => {
                const id = `meal-${mealLogs.length + 1}`;
                mealLogs.push({ id, ...row });
                return { data: { id }, error: null };
              },
            }),
          }),
        };
      }
      if (table === "profiles") {
        return { select: () => ({ in: async () => ({ data: [] }) }) };
      }
      if (table === "meal_reminder_sends") {
        return { insert: async () => ({ error: null }) };
      }
      if (table === "entitlements") {
        // No trialing/card-backed entitlements in this test's fixture data
        // — the trial-reminders task (folded into this route, see its own
        // module doc) is exercised by its own test elsewhere; this just
        // needs to no-op cleanly here.
        const chain: any = {
          eq: () => chain,
          not: () => chain,
          is: () => chain,
          gte: () => chain,
          lte: () => Promise.resolve({ data: [] }),
        };
        return { select: () => chain };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };

  return { db, mealLogs, updatedConversations };
}

describe("POST /api/cron/send-meal-reminders — stale clarification resolution", () => {
  // The sweep re-derives a stale meal's label from the CURRENT clock (see
  // resolveStaleMealLabel), so asserting on it is only meaningful with time
  // pinned. Without this the "logged a lunch" assertion below passes in the
  // morning and fails in the evening — it was written at midday and started
  // failing the same week. 07:00 UTC is 12:30 in the fixture contact's
  // Asia/Kolkata, i.e. unambiguously lunch.
  //
  // Timers themselves are left real: the route awaits promises, and faking
  // setTimeout here would hang them.
  beforeEach(() => {
    process.env.CRON_SECRET = "test-secret";
    jest.clearAllMocks();
    jest.useFakeTimers({
      doNotFake: ["setTimeout", "setInterval", "setImmediate", "clearTimeout", "clearInterval", "clearImmediate", "nextTick", "queueMicrotask"],
      now: new Date("2026-09-06T07:00:00.000Z"),
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("rejects requests without the correct bearer secret", async () => {
    (createServiceClient as jest.Mock).mockReturnValue(fakeDb([]).db);
    const mod = await import("@/app/api/cron/send-meal-reminders/route");
    const res = await mod.POST(new NextRequest("https://x/api/cron/send-meal-reminders", { method: "POST" }));
    expect(res.status).toBe(401);
  });

  it("saves a stale awaiting_clarification meal as a best guess and releases the lock", async () => {
    const conv = {
      id: "conv-1",
      adults_contact_id: "contact-1",
      client_id: null,
      workspace_id: "ws-1",
      // Deliberately no trainer_id: whatsapp_conversations has no such
      // column. The sweep used to read conv.trainer_id and silently write
      // undefined.
      whatsapp_number: "919999999999",
      pending_meal: pendingMeal,
    };
    const { db, mealLogs, updatedConversations } = fakeDb([conv]);
    (createServiceClient as jest.Mock).mockReturnValue(db);
    const mod = await import("@/app/api/cron/send-meal-reminders/route");

    const res = await mod.POST(
      new NextRequest("https://x/api/cron/send-meal-reminders", {
        method: "POST",
        headers: { Authorization: "Bearer test-secret" },
      })
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.staleClarifications).toEqual({ checked: 1, resolved: 1, skipped: 0 });

    expect(mealLogs).toHaveLength(1);
    expect(mealLogs[0].adults_contact_id).toBe("contact-1");
    expect(mealLogs[0].ai_summary).toBe("rice and dal");
    // Resolved from adults_contacts.caregiver_id, never from the conversation.
    expect(mealLogs[0].trainer_id).toBe("caregiver-1");
    expect(sendTextMessage).toHaveBeenCalledWith("919999999999", expect.stringContaining("rice and dal"));

    expect(updatedConversations).toHaveLength(1);
    expect(updatedConversations[0].patch.state).toBe("idle");
    expect(updatedConversations[0].patch.pending_meal.status).toBe("saved");
  });

  it("skips conversations with no pending_meal without erroring", async () => {
    const conv = { id: "conv-2", adults_contact_id: "contact-2", pending_meal: null };
    const { db, mealLogs } = fakeDb([conv]);
    (createServiceClient as jest.Mock).mockReturnValue(db);
    const mod = await import("@/app/api/cron/send-meal-reminders/route");

    const res = await mod.POST(
      new NextRequest("https://x/api/cron/send-meal-reminders", {
        method: "POST",
        headers: { Authorization: "Bearer test-secret" },
      })
    );

    const body = await res.json();
    expect(body.staleClarifications).toEqual({ checked: 1, resolved: 0, skipped: 1 });
    expect(mealLogs).toHaveLength(0);
  });

  it("push-notifies the caregiver about a meal it saved on their behalf", async () => {
    // The regression this file exists to prevent. The sweep saved the meal
    // and WhatsApped the person who ate it, so it *looked* finished — but
    // the caregiver watching from the app was never told, making every
    // unanswered-clarification meal invisible to them.
    const conv = {
      id: "conv-1",
      adults_contact_id: "contact-1",
      client_id: null,
      workspace_id: "ws-1",
      whatsapp_number: "919999999999",
      pending_meal: pendingMeal,
    };
    const { db } = fakeDb([conv]);
    (createServiceClient as jest.Mock).mockReturnValue(db);
    const mod = await import("@/app/api/cron/send-meal-reminders/route");

    await mod.POST(
      new NextRequest("https://x/api/cron/send-meal-reminders", {
        method: "POST",
        headers: { Authorization: "Bearer test-secret" },
      })
    );

    expect(sendPushNotificationToProfile).toHaveBeenCalledTimes(1);
    const [profileId, payload] = (sendPushNotificationToProfile as jest.Mock).mock.calls[0];
    expect(profileId).toBe("caregiver-1");
    expect(payload.title).toBe("Your mother logged a lunch");
    expect(payload.body).toContain("rice");
    expect(payload.data).toMatchObject({ type: "meal_logged", adultsContactId: "contact-1" });
  });

  it("does not notify when the workspace is not on the family plan", async () => {
    const conv = {
      id: "conv-1",
      adults_contact_id: "contact-1",
      client_id: null,
      workspace_id: "ws-1",
      whatsapp_number: "919999999999",
      pending_meal: pendingMeal,
    };
    const { db, mealLogs } = fakeDb([conv], { workspacePlan: "self" });
    (createServiceClient as jest.Mock).mockReturnValue(db);
    const mod = await import("@/app/api/cron/send-meal-reminders/route");

    await mod.POST(
      new NextRequest("https://x/api/cron/send-meal-reminders", {
        method: "POST",
        headers: { Authorization: "Bearer test-secret" },
      })
    );

    // Still saved — only the push is gated.
    expect(mealLogs).toHaveLength(1);
    expect(sendPushNotificationToProfile).not.toHaveBeenCalled();
  });

  it("does not notify a 'self' contact about their own upload", async () => {
    const conv = {
      id: "conv-1",
      adults_contact_id: "contact-1",
      client_id: null,
      workspace_id: "ws-1",
      whatsapp_number: "919999999999",
      pending_meal: pendingMeal,
    };
    const { db } = fakeDb([conv], {
      contactRow: { ...defaultContactRow, relationship_type: "self" },
    });
    (createServiceClient as jest.Mock).mockReturnValue(db);
    const mod = await import("@/app/api/cron/send-meal-reminders/route");

    await mod.POST(
      new NextRequest("https://x/api/cron/send-meal-reminders", {
        method: "POST",
        headers: { Authorization: "Bearer test-secret" },
      })
    );

    expect(sendPushNotificationToProfile).not.toHaveBeenCalled();
  });
});

describe("POST /api/cron/send-meal-reminders — stuck conversation locks", () => {
  const post = () =>
    import("@/app/api/cron/send-meal-reminders/route").then((mod) =>
      mod.POST(
        new NextRequest("https://x/api/cron/send-meal-reminders", {
          method: "POST",
          headers: { Authorization: "Bearer test-secret" },
        })
      )
    );

  beforeEach(() => {
    process.env.CRON_SECRET = "test-secret";
    jest.clearAllMocks();
    jest.useFakeTimers({
      doNotFake: ["setTimeout", "setInterval", "setImmediate", "clearTimeout", "clearInterval", "clearImmediate", "nextTick", "queueMicrotask"],
      now: new Date("2026-09-06T07:00:00.000Z"),
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("releases a conversation stranded in the processing lock", async () => {
    // The production incident: "processing" is the lock, not a resting
    // state, and the meal branch only accepts idle/awaiting_correction — so
    // a conversation left here silently ignores every photo sent to it.
    const { db, updatedConversations } = fakeDb([], {
      stuckConversations: [
        { id: "conv-stuck", whatsapp_number: "917715007159", updated_at: "2026-09-06T06:00:00.000Z" },
      ],
    });
    (createServiceClient as jest.Mock).mockReturnValue(db);

    const res = await post();
    const body = await res.json();

    expect(body.stuckLocks).toEqual({ released: 1 });
    const release = updatedConversations.find((u) => u.id === "conv-stuck");
    expect(release).toBeDefined();
    expect(release.patch.state).toBe("idle");
  });

  it("leaves a lock alone while a request could still legitimately hold it", async () => {
    // 60s before "now" — past the handler's own LOCK_STALE_MS but far
    // inside this sweep's threshold. Releasing here could yank the lock out
    // from under a request that is genuinely mid-analysis.
    const { db, updatedConversations } = fakeDb([], {
      stuckConversations: [
        { id: "conv-inflight", whatsapp_number: "911111111111", updated_at: "2026-09-06T06:59:00.000Z" },
      ],
    });
    (createServiceClient as jest.Mock).mockReturnValue(db);

    const res = await post();
    const body = await res.json();

    expect(body.stuckLocks).toEqual({ released: 0 });
    expect(updatedConversations.find((u) => u.id === "conv-inflight")).toBeUndefined();
  });

  it("does not clear pending_meal, so a recent save can still be undone", async () => {
    const { db, updatedConversations } = fakeDb([], {
      stuckConversations: [
        { id: "conv-stuck", whatsapp_number: "917715007159", updated_at: "2026-09-06T06:00:00.000Z" },
      ],
    });
    (createServiceClient as jest.Mock).mockReturnValue(db);

    await post();

    const release = updatedConversations.find((u) => u.id === "conv-stuck");
    expect(release.patch).not.toHaveProperty("pending_meal");
  });

  it("reports nothing released when no conversation is stuck", async () => {
    const { db } = fakeDb([]);
    (createServiceClient as jest.Mock).mockReturnValue(db);

    const res = await post();
    const body = await res.json();

    expect(body.stuckLocks).toEqual({ released: 0 });
  });
});

describe("POST /api/cron/send-meal-reminders — reminders in Nutrition Guidance mode", () => {
  // 02:30 UTC is 08:00 in Kolkata: the breakfast reminder is due.
  beforeEach(() => {
    process.env.CRON_SECRET = "test-secret";
    delete process.env.WHATSAPP_REMINDER_TEMPLATE_NAME;
    jest.clearAllMocks();
    jest.useFakeTimers({
      doNotFake: ["setTimeout", "setInterval", "setImmediate", "clearTimeout", "clearInterval", "clearImmediate", "nextTick", "queueMicrotask"],
      now: new Date("2026-09-09T02:30:00.000Z"),
    });
  });
  afterEach(() => {
    jest.useRealTimers();
    mockGuidance = null;
    delete process.env.WHATSAPP_REMINDER_TEMPLATE_NAME;
  });

  const reminderContact = {
    id: "contact-1",
    workspace_id: "ws-1",
    caregiver_id: "caregiver-1",
    full_name: "Kamlesh Mehta",
    whatsapp_number: "919800000000",
    timezone: "Asia/Kolkata",
    reminders_enabled: true,
    reminder_times: ["08:00"],
    todays_focus_enabled: true,
  };
  const guidance = {
    date: "2026-09-09",
    timezone: "Asia/Kolkata",
    target: { caloriesKcal: 1890, proteinG: 95, carbsG: 230, fatG: 63, fiberG: 30 },
    mealsToday: [],
  };

  async function run() {
    const { db } = fakeDb([], { reminderContacts: [reminderContact] });
    (createServiceClient as jest.Mock).mockReturnValue(db);
    const { POST } = await import("@/app/api/cron/send-meal-reminders/route");
    await POST(new NextRequest("http://localhost/api/cron/send-meal-reminders", {
      method: "POST",
      headers: { authorization: "Bearer test-secret" },
    }));
  }

  it("says what's left for today instead of coaching", async () => {
    mockGuidance = guidance;
    await run();
    expect(sendTextMessage).toHaveBeenCalledTimes(1);
    const text = (sendTextMessage as jest.Mock).mock.calls[0][1] as string;
    expect(text).toContain("it's breakfast time.");
    expect(text).toContain("Left for today: 1,890 kcal · 95 g protein · 230 g carbs · 63 g fat · 30 g fiber");
  });

  it("puts the balance in the template's second slot, on one line", async () => {
    process.env.WHATSAPP_REMINDER_TEMPLATE_NAME = "tistra_meal_reminder";
    mockGuidance = guidance;
    await run();
    expect(sendTemplateMessage).toHaveBeenCalledTimes(1);
    const params = (sendTemplateMessage as jest.Mock).mock.calls[0][3] as string[];
    expect(params[1]).toMatch(/^Left for today: 1,890 kcal/);
    // Meta rejects template parameters that contain line breaks.
    expect(params[1]).not.toMatch(/\n/);
  });

  it("sends the ordinary reminder when Guidance isn't in effect", async () => {
    await run();
    expect(sendTextMessage).toHaveBeenCalledTimes(1);
    expect((sendTextMessage as jest.Mock).mock.calls[0][1]).not.toContain("Left for today");
  });
});

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

import { createServiceClient } from "@/lib/supabase/server";
import { sendTextMessage } from "@/lib/whatsapp/client";
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
  { contactRow = defaultContactRow, workspacePlan = "family" }: { contactRow?: any; workspacePlan?: string } = {}
) {
  const mealLogs: any[] = [];
  const updatedConversations: any[] = [];

  const db = {
    from(table: string) {
      if (table === "adults_contacts") {
        const chain: any = {
          eq: () => chain,
          is: () => Promise.resolve({ data: [] }),
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
          select: () => ({
            eq: () => ({
              lt: async () => ({ data: staleConversations }),
            }),
          }),
          update: (patch: any) => ({
            eq: async (_col: string, id: string) => {
              updatedConversations.push({ id, patch });
              return { data: null, error: null };
            },
          }),
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
  beforeEach(() => {
    process.env.CRON_SECRET = "test-secret";
    jest.clearAllMocks();
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

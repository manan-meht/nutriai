jest.mock("@/lib/supabase/server", () => ({ createServiceClient: jest.fn() }));
jest.mock("@/lib/whatsapp/client", () => ({ sendTextMessage: jest.fn() }));

import { createServiceClient } from "@/lib/supabase/server";
import { sendTextMessage } from "@/lib/whatsapp/client";
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

function fakeDb(staleConversations: any[]) {
  const mealLogs: any[] = [];
  const updatedConversations: any[] = [];

  const db = {
    from(table: string) {
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
      if (table === "adults_contacts") {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { timezone: "Asia/Kolkata" } }) }) }) };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };

  return { db, mealLogs, updatedConversations };
}

describe("POST /api/cron/resolve-stale-clarifications", () => {
  beforeEach(() => {
    process.env.CRON_SECRET = "test-secret";
    jest.clearAllMocks();
  });

  it("rejects requests without the correct bearer secret", async () => {
    const { route } = await loadRoute(fakeDb([]).db);
    const res = await route(new NextRequest("https://x/api/cron/resolve-stale-clarifications", { method: "POST" }));
    expect(res.status).toBe(401);
  });

  it("saves a stale awaiting_clarification meal as a best guess and releases the lock", async () => {
    const conv = {
      id: "conv-1",
      adults_contact_id: "contact-1",
      client_id: null,
      workspace_id: "ws-1",
      trainer_id: "trainer-1",
      whatsapp_number: "919999999999",
      pending_meal: pendingMeal,
    };
    const { db, mealLogs, updatedConversations } = fakeDb([conv]);
    const { route } = await loadRoute(db);

    const res = await route(
      new NextRequest("https://x/api/cron/resolve-stale-clarifications", {
        method: "POST",
        headers: { Authorization: "Bearer test-secret" },
      })
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ checked: 1, resolved: 1, skipped: 0 });

    expect(mealLogs).toHaveLength(1);
    expect(mealLogs[0].adults_contact_id).toBe("contact-1");
    expect(mealLogs[0].ai_summary).toBe("rice and dal");

    expect(sendTextMessage).toHaveBeenCalledWith("919999999999", expect.stringContaining("rice and dal"));

    expect(updatedConversations).toHaveLength(1);
    expect(updatedConversations[0].patch.state).toBe("idle");
    expect(updatedConversations[0].patch.pending_meal.status).toBe("saved");
  });

  it("skips conversations with no pending_meal without erroring", async () => {
    const conv = { id: "conv-2", adults_contact_id: "contact-2", pending_meal: null };
    const { db, mealLogs } = fakeDb([conv]);
    const { route } = await loadRoute(db);

    const res = await route(
      new NextRequest("https://x/api/cron/resolve-stale-clarifications", {
        method: "POST",
        headers: { Authorization: "Bearer test-secret" },
      })
    );

    const body = await res.json();
    expect(body).toEqual({ checked: 1, resolved: 0, skipped: 1 });
    expect(mealLogs).toHaveLength(0);
  });
});

async function loadRoute(db: unknown) {
  (createServiceClient as jest.Mock).mockReturnValue(db);
  const mod = await import("@/app/api/cron/resolve-stale-clarifications/route");
  return { route: mod.POST };
}

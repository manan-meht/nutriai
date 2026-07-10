// Regression tests for the conversation-state race condition: two messages
// arriving close together (e.g. two photos sent back-to-back) previously
// raced on reading/writing whatsapp_conversations, which could leave the
// row in the wrong state and misroute a later "Yes" into the food-analysis
// branch. handleIncomingMessage now claims a compare-and-swap lock before
// touching state, and every exit path releases it.

jest.mock("@/lib/whatsapp/client", () => ({
  sendTextMessage: jest.fn().mockResolvedValue(undefined),
  normalizePhone: (p: string) => p.replace(/\D/g, ""),
}));

jest.mock("@/lib/ai/food-analyzer", () => ({
  analyzeFood: jest.fn(),
  answerNutritionQuestion: jest.fn().mockResolvedValue("answer"),
  buildEstimateMessage: jest.fn().mockReturnValue("confirm"),
  buildClarificationMessage: jest.fn().mockReturnValue("clarify"),
  buildContradictionCheckMessage: jest.fn().mockReturnValue("contradiction"),
  buildSavedMessage: jest.fn().mockReturnValue("success"),
  buildAutoSaveMessage: jest.fn().mockReturnValue("auto-saved"),
  buildHighImpactClarificationMessage: jest.fn().mockReturnValue("clarify-ambiguity"),
  buildLowConfidenceClarificationMessage: jest.fn().mockReturnValue("clarify-low-confidence"),
  buildCorrectionUpdateMessage: jest.fn().mockReturnValue("correction-updated"),
  computeSaveDecision: jest.fn().mockReturnValue({
    confidenceLevel: "high", hasHighImpactAmbiguity: false,
    shouldAutoSave: true, shouldAskClarification: false,
  }),
  pickDiscardAck: jest.fn().mockReturnValue("discarded"),
  pickUndoAck: jest.fn().mockReturnValue("removed"),
  resolveMealLabel: (mealType: string) => mealType,
  isDrinkMealType: () => false,
  formatMealLabel: (mealType: string) => mealType,
}));

jest.mock("@/lib/entitlements/entitlements", () => ({
  getEntitlementSnapshot: jest.fn().mockResolvedValue({
    status: "trialing", trialStartAt: null, trialEndAt: null, trialDaysRemaining: 10, isReadOnly: false,
  }),
}));

// The real whatsapp_conversations table (confirmed via information_schema,
// after migration 0006 added adults_contact_id) has exactly these columns —
// no product_type, which a prior version of the handler wrote, causing
// every write for an adults contact to fail silently (Postgres rejects
// unknown columns; the original client_id-only FK also rejected adults
// contact IDs, per migration 0006's own description).
const REAL_WHATSAPP_CONVERSATIONS_COLUMNS = new Set([
  "id", "client_id", "adults_contact_id", "workspace_id", "whatsapp_number",
  "state", "pending_meal", "last_message_at", "updated_at",
]);

function assertOnlyRealColumns(row: Record<string, unknown>) {
  for (const key of Object.keys(row)) {
    if (!REAL_WHATSAPP_CONVERSATIONS_COLUMNS.has(key)) {
      throw new Error(`Attempted to write non-existent whatsapp_conversations column: "${key}"`);
    }
  }
}

// In-memory fake for the two tables handleIncomingMessage touches:
// adults_contacts (read-only lookup) and whatsapp_conversations (the row
// under contention). Mirrors just enough of the Supabase query builder
// surface for this handler's exact call shapes.
function makeFakeSupabase(contact: any) {
  let conversationRow: any = null;

  function conversationsTable() {
    return {
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: conversationRow ? { ...conversationRow } : null }),
        }),
      }),
      insert: (row: any) => {
        assertOnlyRealColumns(row);
        return {
          select: () => ({
            maybeSingle: async () => {
              if (conversationRow) return { data: null, error: null }; // simulate unique-constraint race loss
              conversationRow = { ...row };
              return { data: { ...conversationRow }, error: null };
            },
          }),
        };
      },
      update: (patch: any) => {
        assertOnlyRealColumns(patch);
        return {
          eq: (_col1: string, _val1: string) => ({
            eq: (col2: string, val2: any) => ({
              eq: (col3: string, val3: any) => ({
                select: () => ({
                  maybeSingle: async () => {
                    if (!conversationRow) return { data: null };
                    const matches = conversationRow[col2] === val2 && conversationRow[col3] === val3;
                    if (!matches) return { data: null }; // CAS failed — someone else updated first
                    conversationRow = { ...conversationRow, ...patch };
                    return { data: { ...conversationRow } };
                  },
                }),
              }),
            }),
          }),
        };
      },
      upsert: (row: any) => {
        assertOnlyRealColumns(row);
        conversationRow = { ...conversationRow, ...row };
        return Promise.resolve({ data: conversationRow, error: null });
      },
    };
  }

  return {
    from: (table: string) => {
      if (table === "adults_contacts") {
        return {
          select: () => ({
            order: async () => ({ data: [contact] }),
          }),
        };
      }
      if (table === "gym_clients") {
        return { select: () => ({ order: async () => ({ data: [] }) }) };
      }
      if (table === "whatsapp_conversations") return conversationsTable();
      if (table === "meal_logs") {
        return {
          insert: () => ({
            select: () => ({
              single: async () => ({ data: { id: "meal-log-1" }, error: null }),
            }),
          }),
        };
      }
      if (table === "meal_submissions") {
        return {
          insert: () => ({
            select: () => ({
              single: async () => ({ data: { id: "submission-1" }, error: null }),
            }),
          }),
        };
      }
      if (table === "ai_meal_classifications") return { insert: async () => ({ error: null }) };
      throw new Error(`unexpected table ${table}`);
    },
    storage: {
      from: () => ({
        upload: async () => ({ error: null }),
        getPublicUrl: () => ({ data: { publicUrl: "https://example.supabase.co/storage/meal-photos/test.jpg" } }),
      }),
    },
  };
}

const contact = {
  id: "contact-1",
  full_name: "Sonam Bhutia",
  whatsapp_number: "911234567890",
  workspace_id: "ws-1",
  caregiver_id: "owner-1",
  invite_sent_at: null,
  invite_accepted_at: null,
  adults_contact_goals: [],
};

describe("handleIncomingMessage — conversation lock prevents concurrent-message races", () => {
  afterEach(() => jest.resetModules());

  it("a second message arriving while the first is still analyzing is told to wait, not processed concurrently", async () => {
    jest.resetModules();
    const fakeDb = makeFakeSupabase(contact);
    jest.doMock("@supabase/supabase-js", () => ({ createClient: () => fakeDb }));

    const { analyzeFood } = await import("@/lib/ai/food-analyzer");
    const { sendTextMessage } = await import("@/lib/whatsapp/client");

    // First analysis call hangs until we manually resolve it, simulating a
    // slow AI call still in flight when the second photo arrives.
    let resolveFirstAnalysis: (v: any) => void;
    (analyzeFood as jest.Mock).mockImplementationOnce(
      () => new Promise((resolve) => { resolveFirstAnalysis = resolve; })
    );

    const { handleIncomingMessage } = await import("@/lib/whatsapp/conversation-handler");

    const firstCall = handleIncomingMessage(
      { from: "911234567890", type: "image", mediaMimeType: "image/jpeg" },
      new Uint8Array([1, 2, 3])
    );

    // Give the first call time to claim the lock before the second arrives.
    await new Promise((r) => setImmediate(r));

    await handleIncomingMessage(
      { from: "911234567890", type: "image", mediaMimeType: "image/jpeg" },
      new Uint8Array([4, 5, 6])
    );

    // The second message should have been told to wait, not analyzed.
    expect(sendTextMessage).toHaveBeenCalledWith(
      "911234567890",
      expect.stringMatching(/still working|still processing/i)
    );
    expect(analyzeFood).toHaveBeenCalledTimes(1);

    // Let the first call finish so it doesn't leak into other tests.
    resolveFirstAnalysis!({
      meal_type: "lunch", foods: [{ name: "Chicken", quantity: "1 piece" }],
      total_calories_min: 300, total_calories_max: 350,
      total_protein_min: 35, total_protein_max: 40,
      total_carbs_min: 0, total_carbs_max: 0,
      total_fat_min: 0, total_fat_max: 0,
      summary: "chicken",
    });
    await firstCall;
  });

  it("after the lock is released, a subsequent 'Yes' is correctly routed to save the pending meal, not re-analyzed as text", async () => {
    jest.resetModules();
    const fakeDb = makeFakeSupabase(contact);
    jest.doMock("@supabase/supabase-js", () => ({ createClient: () => fakeDb }));

    const { analyzeFood } = await import("@/lib/ai/food-analyzer");
    (analyzeFood as jest.Mock).mockResolvedValue({
      meal_type: "lunch", foods: [{ name: "Chicken", quantity: "1 piece" }],
      total_calories_min: 300, total_calories_max: 350,
      total_protein_min: 35, total_protein_max: 40,
      total_carbs_min: 0, total_carbs_max: 0,
      total_fat_min: 0, total_fat_max: 0,
      summary: "chicken",
    });

    const { handleIncomingMessage } = await import("@/lib/whatsapp/conversation-handler");

    await handleIncomingMessage(
      { from: "911234567890", type: "image", mediaMimeType: "image/jpeg" },
      new Uint8Array([1, 2, 3])
    );

    // analyzeFood must NOT be called again for a plain "Yes" — if the lock
    // failed to release correctly (the original bug), "Yes" would fall
    // through to the idle/awaiting_correction branch and get re-analyzed
    // as if it were meal-description text.
    (analyzeFood as jest.Mock).mockClear();

    await handleIncomingMessage({ from: "911234567890", type: "text", text: "Yes" });

    expect(analyzeFood).not.toHaveBeenCalled();
  });
});

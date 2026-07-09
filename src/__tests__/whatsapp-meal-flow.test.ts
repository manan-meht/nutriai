// Covers the "understand, estimate, confirm, then save" rewrite of the
// WhatsApp meal-logging flow (see src/lib/whatsapp/conversation-handler.ts
// and src/lib/ai/food-analyzer.ts): pending-meal confirmation, zero-macro
// clarification, correction updates, cancel, and duplicate-save prevention
// after a post-save correction.

jest.mock("@/lib/whatsapp/client", () => ({
  sendTextMessage: jest.fn().mockResolvedValue(undefined),
  normalizePhone: (p: string) => p.replace(/\D/g, ""),
}));

jest.mock("@/lib/ai/food-analyzer");

jest.mock("@/lib/entitlements/entitlements", () => ({
  getEntitlementSnapshot: jest.fn().mockResolvedValue({
    status: "trialing", trialStartAt: null, trialEndAt: null, trialDaysRemaining: 10, isReadOnly: false,
  }),
}));

const REAL_WHATSAPP_CONVERSATIONS_COLUMNS = new Set([
  "id", "client_id", "adults_contact_id", "workspace_id", "whatsapp_number",
  "state", "pending_meal", "last_message_at", "updated_at", "last_greeted_at",
]);

function assertOnlyRealColumns(row: Record<string, unknown>) {
  for (const key of Object.keys(row)) {
    if (!REAL_WHATSAPP_CONVERSATIONS_COLUMNS.has(key)) {
      throw new Error(`Attempted to write non-existent whatsapp_conversations column: "${key}"`);
    }
  }
}

function makeFakeSupabase(contact: any) {
  let conversationRow: any = null;
  const mealLogs: any[] = [];

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
              if (conversationRow) return { data: null, error: null };
              conversationRow = { id: "conv-1", ...row };
              return { data: { ...conversationRow }, error: null };
            },
          }),
        };
      },
      update: (patch: any) => {
        assertOnlyRealColumns(patch);
        return {
          eq: (_c1: string, _v1: string) => ({
            eq: (col2: string, val2: any) => ({
              eq: (col3: string, val3: any) => ({
                select: () => ({
                  maybeSingle: async () => {
                    if (!conversationRow) return { data: null };
                    const matches = conversationRow[col2] === val2 && conversationRow[col3] === val3;
                    if (!matches) return { data: null };
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

  function mealLogsTable() {
    return {
      insert: (row: any) => {
        const id = `meal-${mealLogs.length + 1}`;
        mealLogs.push({ id, ...row });
        return {
          select: () => ({
            single: async () => ({ data: { id }, error: null }),
          }),
        };
      },
      update: (patch: any) => ({
        eq: (_col: string, id: string) => {
          const idx = mealLogs.findIndex((m) => m.id === id);
          if (idx >= 0) mealLogs[idx] = { ...mealLogs[idx], ...patch };
          return Promise.resolve({ error: null });
        },
      }),
      select: () => ({
        eq: () => ({
          gte: async () => ({ data: mealLogs, error: null }),
        }),
      }),
    };
  }

  return {
    _mealLogs: mealLogs,
    from: (table: string) => {
      if (table === "adults_contacts") {
        return { select: () => ({ order: async () => ({ data: [contact] }) }) };
      }
      if (table === "gym_clients") {
        return { select: () => ({ order: async () => ({ data: [] }) }) };
      }
      if (table === "whatsapp_conversations") return conversationsTable();
      if (table === "meal_logs") return mealLogsTable();
      if (table === "meal_submissions") {
        return { insert: () => ({ select: () => ({ single: async () => ({ data: { id: "sub-1" }, error: null }) }) }) };
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

function zeroMacroAnalysis(overrides: Record<string, unknown> = {}) {
  return {
    meal_type: "other", foods: [{ name: "Unclear item", quantity: "1 serving" }],
    total_calories_min: 0, total_calories_max: 0,
    total_protein_min: 0, total_protein_max: 0,
    total_carbs_min: 0, total_carbs_max: 0,
    total_fat_min: 0, total_fat_max: 0,
    summary: "unclear", confidence: "low", is_zero_calorie_item: false,
    ...overrides,
  };
}

function realFoodAnalysis(overrides: Record<string, unknown> = {}) {
  return {
    meal_type: "lunch", foods: [{ name: "Rice", quantity: "1 cup" }, { name: "Chicken curry", quantity: "1 katori" }],
    total_calories_min: 400, total_calories_max: 500,
    total_protein_min: 25, total_protein_max: 30,
    total_carbs_min: 0, total_carbs_max: 0,
    total_fat_min: 0, total_fat_max: 0,
    summary: "rice and chicken curry", confidence: "high", is_zero_calorie_item: false,
    ...overrides,
  };
}

describe("handleIncomingMessage — pending meal confirm/correct/save flow", () => {
  afterEach(() => jest.resetModules());

  it("never lets a 0 kcal / 0g protein analysis go straight to a save prompt — asks for clarification instead", async () => {
    jest.resetModules();
    const fakeDb = makeFakeSupabase(contact);
    jest.doMock("@supabase/supabase-js", () => ({ createClient: () => fakeDb }));

    const foodAnalyzer = await import("@/lib/ai/food-analyzer");
    (foodAnalyzer.analyzeFood as jest.Mock).mockResolvedValue(zeroMacroAnalysis());
    (foodAnalyzer.buildClarificationMessage as jest.Mock).mockReturnValue("I couldn't identify this clearly. Is this tea, coffee, soup, or something else?");
    (foodAnalyzer.resolveMealLabel as jest.Mock).mockImplementation((t: string) => t);
    (foodAnalyzer.formatMealLabel as jest.Mock).mockImplementation((t: string) => t);

    const { sendTextMessage } = await import("@/lib/whatsapp/client");
    const { handleIncomingMessage } = await import("@/lib/whatsapp/conversation-handler");

    await handleIncomingMessage(
      { from: "911234567890", type: "image", mediaMimeType: "image/jpeg" },
      new Uint8Array([1, 2, 3])
    );

    expect(sendTextMessage).toHaveBeenCalledWith(
      "911234567890",
      expect.stringContaining("couldn't identify this clearly")
    );
    // Never told the user to reply Yes off a 0/0 estimate.
    expect(sendTextMessage).not.toHaveBeenCalledWith("911234567890", expect.stringContaining("Reply *Yes*"));
    expect(fakeDb._mealLogs.length).toBe(0);
  });

  it("allows a genuinely zero-calorie item (e.g. black tea) through to confirmation", async () => {
    jest.resetModules();
    const fakeDb = makeFakeSupabase(contact);
    jest.doMock("@supabase/supabase-js", () => ({ createClient: () => fakeDb }));

    const foodAnalyzer = await import("@/lib/ai/food-analyzer");
    (foodAnalyzer.analyzeFood as jest.Mock).mockResolvedValue(zeroMacroAnalysis({ is_zero_calorie_item: true, meal_type: "tea", summary: "black tea" }));
    (foodAnalyzer.buildEstimateMessage as jest.Mock).mockReturnValue("Reply *Yes* to save, or tell me what to change.");
    (foodAnalyzer.resolveMealLabel as jest.Mock).mockImplementation((t: string) => t);
    (foodAnalyzer.formatMealLabel as jest.Mock).mockImplementation((t: string) => t);

    const { sendTextMessage } = await import("@/lib/whatsapp/client");
    const { handleIncomingMessage } = await import("@/lib/whatsapp/conversation-handler");

    await handleIncomingMessage(
      { from: "911234567890", type: "image", mediaMimeType: "image/jpeg" },
      new Uint8Array([1, 2, 3])
    );

    expect(sendTextMessage).toHaveBeenCalledWith("911234567890", expect.stringContaining("Reply *Yes*"));
    expect(fakeDb._mealLogs.length).toBe(0); // not saved yet — only confirmed after Yes
  });

  it("a correction after a save updates the existing meal_logs row instead of creating a second one", async () => {
    jest.resetModules();
    const fakeDb = makeFakeSupabase(contact);
    jest.doMock("@supabase/supabase-js", () => ({ createClient: () => fakeDb }));

    const foodAnalyzer = await import("@/lib/ai/food-analyzer");
    (foodAnalyzer.analyzeFood as jest.Mock).mockResolvedValue(realFoodAnalysis());
    (foodAnalyzer.buildEstimateMessage as jest.Mock).mockReturnValue("Reply *Yes* to save, or tell me what to change.");
    (foodAnalyzer.buildSavedMessage as jest.Mock).mockReturnValue("Saved as lunch.");
    (foodAnalyzer.resolveMealLabel as jest.Mock).mockImplementation((t: string) => t);
    (foodAnalyzer.formatMealLabel as jest.Mock).mockImplementation((t: string) => t);

    const { handleIncomingMessage } = await import("@/lib/whatsapp/conversation-handler");

    // 1. Photo -> estimate
    await handleIncomingMessage(
      { from: "911234567890", type: "image", mediaMimeType: "image/jpeg" },
      new Uint8Array([1, 2, 3])
    );
    // 2. Yes -> saved
    await handleIncomingMessage({ from: "911234567890", type: "text", text: "Yes" });
    expect(fakeDb._mealLogs.length).toBe(1);

    // 3. Correction after save -> should update the same row, not insert a new one
    (foodAnalyzer.analyzeFood as jest.Mock).mockResolvedValue(realFoodAnalysis({
      total_calories_min: 300, total_calories_max: 350, total_protein_min: 20, total_protein_max: 24,
    }));
    const { sendTextMessage } = await import("@/lib/whatsapp/client");
    (sendTextMessage as jest.Mock).mockClear();

    await handleIncomingMessage({ from: "911234567890", type: "text", text: "Actually rice was half cup." });

    expect(fakeDb._mealLogs.length).toBe(1); // still just one row
    expect(sendTextMessage).toHaveBeenCalledWith(
      "911234567890",
      expect.stringContaining("updated the saved")
    );
  });

  it("a new photo arriving while a previous estimate is still awaiting Yes is analyzed fresh, not silently ignored", async () => {
    jest.resetModules();
    const fakeDb = makeFakeSupabase(contact);
    jest.doMock("@supabase/supabase-js", () => ({ createClient: () => fakeDb }));

    const foodAnalyzer = await import("@/lib/ai/food-analyzer");
    (foodAnalyzer.analyzeFood as jest.Mock).mockResolvedValueOnce(realFoodAnalysis({ summary: "first meal" }));
    (foodAnalyzer.buildEstimateMessage as jest.Mock).mockReturnValue("Reply *Yes* to save, or tell me what to change.");
    (foodAnalyzer.resolveMealLabel as jest.Mock).mockImplementation((t: string) => t);
    (foodAnalyzer.formatMealLabel as jest.Mock).mockImplementation((t: string) => t);

    const { handleIncomingMessage } = await import("@/lib/whatsapp/conversation-handler");

    // First photo -> awaiting_confirmation with a pending (unconfirmed) estimate.
    await handleIncomingMessage(
      { from: "911234567890", type: "image", mediaMimeType: "image/jpeg" },
      new Uint8Array([1, 2, 3])
    );

    // A second, different photo arrives before the user ever replies Yes to the first.
    (foodAnalyzer.analyzeFood as jest.Mock).mockResolvedValueOnce(realFoodAnalysis({ summary: "second meal", meal_type: "dinner" }));
    await handleIncomingMessage(
      { from: "911234567890", type: "image", mediaMimeType: "image/jpeg" },
      new Uint8Array([4, 5, 6])
    );

    // The new photo must have been analyzed (not silently dropped/ignored).
    expect(foodAnalyzer.analyzeFood).toHaveBeenCalledTimes(2);
    expect(fakeDb._mealLogs.length).toBe(0); // still nothing saved — second estimate awaits its own Yes
  });

  it("'cancel' discards a pending meal without saving anything", async () => {
    jest.resetModules();
    const fakeDb = makeFakeSupabase(contact);
    jest.doMock("@supabase/supabase-js", () => ({ createClient: () => fakeDb }));

    const foodAnalyzer = await import("@/lib/ai/food-analyzer");
    (foodAnalyzer.analyzeFood as jest.Mock).mockResolvedValue(realFoodAnalysis());
    (foodAnalyzer.buildEstimateMessage as jest.Mock).mockReturnValue("Reply *Yes* to save, or tell me what to change.");
    (foodAnalyzer.resolveMealLabel as jest.Mock).mockImplementation((t: string) => t);
    (foodAnalyzer.formatMealLabel as jest.Mock).mockImplementation((t: string) => t);

    const { sendTextMessage } = await import("@/lib/whatsapp/client");
    const { handleIncomingMessage } = await import("@/lib/whatsapp/conversation-handler");

    await handleIncomingMessage(
      { from: "911234567890", type: "image", mediaMimeType: "image/jpeg" },
      new Uint8Array([1, 2, 3])
    );
    await handleIncomingMessage({ from: "911234567890", type: "text", text: "cancel" });

    expect(fakeDb._mealLogs.length).toBe(0);
    expect(sendTextMessage).toHaveBeenCalledWith("911234567890", expect.stringContaining("discarded"));
  });

  it("a hypothetical question is answered without saving or modifying the pending meal", async () => {
    jest.resetModules();
    const fakeDb = makeFakeSupabase(contact);
    jest.doMock("@supabase/supabase-js", () => ({ createClient: () => fakeDb }));

    const foodAnalyzer = await import("@/lib/ai/food-analyzer");
    (foodAnalyzer.analyzeFood as jest.Mock).mockResolvedValue(realFoodAnalysis());
    (foodAnalyzer.buildEstimateMessage as jest.Mock).mockReturnValue("Reply *Yes* to save, or tell me what to change.");
    (foodAnalyzer.answerNutritionQuestion as jest.Mock).mockResolvedValue(
      "If the rice was replaced with 1 cup cooked pasta, this meal would be roughly 500-600 kcal."
    );
    (foodAnalyzer.resolveMealLabel as jest.Mock).mockImplementation((t: string) => t);
    (foodAnalyzer.formatMealLabel as jest.Mock).mockImplementation((t: string) => t);

    const { sendTextMessage } = await import("@/lib/whatsapp/client");
    const { handleIncomingMessage } = await import("@/lib/whatsapp/conversation-handler");

    await handleIncomingMessage(
      { from: "911234567890", type: "image", mediaMimeType: "image/jpeg" },
      new Uint8Array([1, 2, 3])
    );
    await handleIncomingMessage({ from: "911234567890", type: "text", text: "If this was pasta then what would be my calories?" });

    expect(fakeDb._mealLogs.length).toBe(0); // question never saves anything
    expect(sendTextMessage).toHaveBeenCalledWith("911234567890", expect.stringContaining("500-600 kcal"));
    expect(sendTextMessage).toHaveBeenCalledWith("911234567890", expect.stringContaining("was this just a question"));

    // The pending meal from the photo should still be confirmable afterward.
    (sendTextMessage as jest.Mock).mockClear();
    (foodAnalyzer.buildSavedMessage as jest.Mock).mockReturnValue("Saved as lunch.");
    await handleIncomingMessage({ from: "911234567890", type: "text", text: "Yes" });
    expect(fakeDb._mealLogs.length).toBe(1);
  });
});

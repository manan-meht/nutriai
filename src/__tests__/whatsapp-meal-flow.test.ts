// Covers the confidence-based auto-save WhatsApp meal-logging flow (see
// src/lib/whatsapp/conversation-handler.ts and src/lib/ai/food-analyzer.ts):
// high/medium confidence auto-saves immediately (no "Reply Yes" needed),
// high-impact food-identity ambiguity pauses for a targeted clarification,
// corrections after auto-save update the same row (never a duplicate), and
// Undo/skip/don't-record remove a just-auto-saved meal.

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
      delete: () => ({
        eq: (_col: string, id: string) => {
          const idx = mealLogs.findIndex((m) => m.id === id);
          if (idx >= 0) mealLogs.splice(idx, 1);
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

const HIGH_CONFIDENCE_DECISION = {
  confidenceLevel: "high" as const, hasHighImpactAmbiguity: false,
  shouldAutoSave: true, shouldAskClarification: false,
};
const MEDIUM_CONFIDENCE_DECISION = {
  confidenceLevel: "medium" as const, hasHighImpactAmbiguity: false,
  shouldAutoSave: true, shouldAskClarification: false,
};
function highImpactAmbiguityDecision(question: string) {
  return {
    confidenceLevel: "low" as const, hasHighImpactAmbiguity: true,
    highImpactAmbiguityReason: "tofu vs paneer vs chicken changes protein significantly",
    clarificationQuestion: question,
    shouldAutoSave: false, shouldAskClarification: true,
  };
}

/** Wires up the common mocks every test needs, and returns the imported
 * modules so each test can further configure per-test return values. */
async function setup(contactOverrides: Record<string, unknown> = {}) {
  jest.resetModules();
  const fakeDb = makeFakeSupabase({ ...contact, ...contactOverrides });
  jest.doMock("@supabase/supabase-js", () => ({ createClient: () => fakeDb }));

  const foodAnalyzer = await import("@/lib/ai/food-analyzer");
  (foodAnalyzer.resolveMealLabel as jest.Mock).mockImplementation((t: string) => t);
  (foodAnalyzer.formatMealLabel as jest.Mock).mockImplementation((t: string) => t);
  (foodAnalyzer.computeSaveDecision as jest.Mock).mockReturnValue(HIGH_CONFIDENCE_DECISION);
  (foodAnalyzer.buildAutoSaveMessage as jest.Mock).mockReturnValue("Logged lunch ✅\n\nNeed to fix anything? Just reply with a correction, or say Undo to remove this log.");
  (foodAnalyzer.buildCorrectionUpdateMessage as jest.Mock).mockReturnValue("Thanks for the correction — I've updated the log.");
  (foodAnalyzer.pickDiscardAck as jest.Mock).mockReturnValue("Got it — nothing saved.");
  (foodAnalyzer.pickUndoAck as jest.Mock).mockReturnValue("Got it — I removed that log.");

  const { sendTextMessage } = await import("@/lib/whatsapp/client");
  const { handleIncomingMessage } = await import("@/lib/whatsapp/conversation-handler");

  return { fakeDb, foodAnalyzer, sendTextMessage, handleIncomingMessage };
}

const photoMsg = { from: "911234567890", type: "image" as const, mediaMimeType: "image/jpeg" };
const photoBuffer = new Uint8Array([1, 2, 3]);

describe("handleIncomingMessage — confidence-based auto-save flow", () => {
  afterEach(() => jest.resetModules());

  it("Test A: a high-confidence meal is auto-saved immediately, with no 'Reply Yes' prompt", async () => {
    const { fakeDb, foodAnalyzer, sendTextMessage, handleIncomingMessage } = await setup();
    (foodAnalyzer.analyzeFood as jest.Mock).mockResolvedValue(realFoodAnalysis());
    (foodAnalyzer.computeSaveDecision as jest.Mock).mockReturnValue(HIGH_CONFIDENCE_DECISION);
    (foodAnalyzer.buildAutoSaveMessage as jest.Mock).mockReturnValue(
      "Logged lunch ✅\n\nI found:\n- Rice\n\nEstimated: 27g protein · 480 kcal.\n\nNeed to fix anything? Just reply with a correction, or say Undo to remove this log."
    );

    await handleIncomingMessage(photoMsg, photoBuffer);

    expect(fakeDb._mealLogs.length).toBe(1);
    expect(sendTextMessage).toHaveBeenCalledWith("911234567890", expect.stringContaining("Logged lunch ✅"));
    expect(sendTextMessage).not.toHaveBeenCalledWith("911234567890", expect.stringContaining("Reply Yes"));
  });

  it("Test B: a medium-confidence meal is auto-saved with correction-invite wording", async () => {
    const { fakeDb, foodAnalyzer, sendTextMessage, handleIncomingMessage } = await setup();
    (foodAnalyzer.analyzeFood as jest.Mock).mockResolvedValue(realFoodAnalysis({ confidence: "medium" }));
    (foodAnalyzer.computeSaveDecision as jest.Mock).mockReturnValue(MEDIUM_CONFIDENCE_DECISION);
    (foodAnalyzer.buildAutoSaveMessage as jest.Mock).mockReturnValue(
      "Logged this estimate as lunch ✅\n\nI'm estimating:\n- Chicken curry — small portion\n\nEstimated: 30g protein · 680 kcal.\n\nIf anything is off, reply with a correction, or say Undo to remove this log."
    );

    await handleIncomingMessage(photoMsg, photoBuffer);

    expect(fakeDb._mealLogs.length).toBe(1);
    expect(sendTextMessage).toHaveBeenCalledWith("911234567890", expect.stringContaining("Logged this estimate as lunch ✅"));
    expect(sendTextMessage).not.toHaveBeenCalledWith("911234567890", expect.stringContaining("Reply Yes"));
  });

  it("Test C: high-impact food-identity ambiguity is not auto-saved — asks a targeted clarification", async () => {
    const { fakeDb, foodAnalyzer, sendTextMessage, handleIncomingMessage } = await setup();
    const ambiguousAnalysis = realFoodAnalysis({
      foods: [
        { name: "Rice", quantity: "1 cup" },
        { name: "Mixed vegetable curry", quantity: "1/2 cup" },
        { name: "Cubed item", quantity: "1/2 cup", is_ambiguous: true },
      ],
      has_high_impact_ambiguity: true,
      clarification_question: "Is the top-left cubed item tofu, paneer, or chicken?",
    });
    (foodAnalyzer.analyzeFood as jest.Mock).mockResolvedValue(ambiguousAnalysis);
    (foodAnalyzer.computeSaveDecision as jest.Mock).mockReturnValue(
      highImpactAmbiguityDecision("Is the top-left cubed item tofu, paneer, or chicken?")
    );
    (foodAnalyzer.buildHighImpactClarificationMessage as jest.Mock).mockReturnValue(
      "I can estimate this, but one item changes the nutrition a lot: is the top-left cubed item tofu, paneer, or chicken?\n\nI also see Rice, Mixed vegetable curry.\n\nReply with the item name and I'll log it."
    );

    await handleIncomingMessage(photoMsg, photoBuffer);

    expect(fakeDb._mealLogs.length).toBe(0);
    expect(sendTextMessage).toHaveBeenCalledWith(
      "911234567890",
      expect.stringContaining("tofu, paneer, or chicken")
    );
  });

  it("Test D: answering the clarification logs the meal using the resolved item", async () => {
    const { fakeDb, foodAnalyzer, sendTextMessage, handleIncomingMessage } = await setup();
    (foodAnalyzer.analyzeFood as jest.Mock).mockResolvedValueOnce(realFoodAnalysis({
      has_high_impact_ambiguity: true,
      clarification_question: "Is the top-left cubed item tofu, paneer, or chicken?",
    }));
    (foodAnalyzer.computeSaveDecision as jest.Mock).mockReturnValueOnce(
      highImpactAmbiguityDecision("Is the top-left cubed item tofu, paneer, or chicken?")
    );
    (foodAnalyzer.buildHighImpactClarificationMessage as jest.Mock).mockReturnValue("Is it tofu, paneer, or chicken?");

    await handleIncomingMessage(photoMsg, photoBuffer);
    expect(fakeDb._mealLogs.length).toBe(0);

    // User answers with the specific item — this resolves the ambiguity.
    (foodAnalyzer.analyzeFood as jest.Mock).mockResolvedValueOnce(realFoodAnalysis({
      foods: [{ name: "Paneer", quantity: "small portion" }],
      has_high_impact_ambiguity: false,
    }));
    (foodAnalyzer.computeSaveDecision as jest.Mock).mockReturnValueOnce(HIGH_CONFIDENCE_DECISION);
    (foodAnalyzer.buildAutoSaveMessage as jest.Mock).mockReturnValue("Thanks — I've logged this as lunch ✅");

    await handleIncomingMessage({ from: "911234567890", type: "text", text: "Paneer" });

    expect(fakeDb._mealLogs.length).toBe(1);
    expect(sendTextMessage).toHaveBeenCalledWith("911234567890", expect.stringContaining("Thanks — I've logged this as lunch"));
  });

  it("Test E: 'Undo' after auto-save removes the meal that was just logged", async () => {
    const { fakeDb, foodAnalyzer, sendTextMessage, handleIncomingMessage } = await setup();
    (foodAnalyzer.analyzeFood as jest.Mock).mockResolvedValue(realFoodAnalysis());

    await handleIncomingMessage(photoMsg, photoBuffer);
    expect(fakeDb._mealLogs.length).toBe(1);

    (sendTextMessage as jest.Mock).mockClear();
    await handleIncomingMessage({ from: "911234567890", type: "text", text: "Undo" });

    expect(fakeDb._mealLogs.length).toBe(0);
    expect(sendTextMessage).toHaveBeenCalledWith("911234567890", expect.stringContaining("removed that log"));
  });

  it("Test F: 'No need to record this' after auto-save removes the meal, without re-estimating", async () => {
    const { fakeDb, foodAnalyzer, sendTextMessage, handleIncomingMessage } = await setup();
    (foodAnalyzer.analyzeFood as jest.Mock).mockResolvedValue(realFoodAnalysis());

    await handleIncomingMessage(photoMsg, photoBuffer);
    expect(fakeDb._mealLogs.length).toBe(1);

    (foodAnalyzer.analyzeFood as jest.Mock).mockClear();
    (sendTextMessage as jest.Mock).mockClear();
    await handleIncomingMessage({ from: "911234567890", type: "text", text: "No need to record this" });

    expect(foodAnalyzer.analyzeFood).not.toHaveBeenCalled();
    expect(fakeDb._mealLogs.length).toBe(0);
    expect(sendTextMessage).toHaveBeenCalledWith("911234567890", expect.stringContaining("removed that log"));
  });

  it("Test G: a correction after auto-save updates the same row — no duplicate meal", async () => {
    const { fakeDb, foodAnalyzer, sendTextMessage, handleIncomingMessage } = await setup();
    (foodAnalyzer.analyzeFood as jest.Mock).mockResolvedValue(realFoodAnalysis());

    await handleIncomingMessage(photoMsg, photoBuffer);
    expect(fakeDb._mealLogs.length).toBe(1);

    (foodAnalyzer.analyzeFood as jest.Mock).mockResolvedValue(realFoodAnalysis({
      total_calories_min: 300, total_calories_max: 350, total_protein_min: 20, total_protein_max: 24,
    }));
    (sendTextMessage as jest.Mock).mockClear();

    await handleIncomingMessage({ from: "911234567890", type: "text", text: "Rice was half cup." });

    expect(fakeDb._mealLogs.length).toBe(1); // still just one row
    expect(sendTextMessage).toHaveBeenCalledWith("911234567890", expect.stringContaining("updated the log"));
  });

  it("Test H: a correction phrased with a leading 'No' updates the meal to the corrected food, without removing it", async () => {
    const { fakeDb, foodAnalyzer, sendTextMessage, handleIncomingMessage } = await setup();
    (foodAnalyzer.analyzeFood as jest.Mock).mockResolvedValue(realFoodAnalysis());

    await handleIncomingMessage(photoMsg, photoBuffer);
    expect(fakeDb._mealLogs.length).toBe(1);

    (foodAnalyzer.analyzeFood as jest.Mock).mockResolvedValue(realFoodAnalysis({
      foods: [{ name: "Rice", quantity: "1 cup" }, { name: "Fish curry", quantity: "1 katori" }],
    }));
    (sendTextMessage as jest.Mock).mockClear();

    await handleIncomingMessage({ from: "911234567890", type: "text", text: "No, this is fish, not chicken." });

    expect(fakeDb._mealLogs.length).toBe(1); // updated, not removed, not duplicated
    expect(sendTextMessage).toHaveBeenCalledWith("911234567890", expect.stringContaining("updated the log"));
  });

  it("never lets a 0 kcal / 0g protein analysis auto-save — asks for clarification instead", async () => {
    const { fakeDb, foodAnalyzer, sendTextMessage, handleIncomingMessage } = await setup();
    (foodAnalyzer.analyzeFood as jest.Mock).mockResolvedValue(zeroMacroAnalysis());
    (foodAnalyzer.buildClarificationMessage as jest.Mock).mockReturnValue("I couldn't identify this clearly. Is this tea, coffee, soup, or something else?");

    await handleIncomingMessage(photoMsg, photoBuffer);

    expect(sendTextMessage).toHaveBeenCalledWith(
      "911234567890",
      expect.stringContaining("couldn't identify this clearly")
    );
    expect(fakeDb._mealLogs.length).toBe(0);
  });

  it("allows a genuinely zero-calorie item (e.g. black tea) to auto-save", async () => {
    const { fakeDb, foodAnalyzer, sendTextMessage, handleIncomingMessage } = await setup();
    (foodAnalyzer.analyzeFood as jest.Mock).mockResolvedValue(zeroMacroAnalysis({ is_zero_calorie_item: true, meal_type: "tea", summary: "black tea", confidence: "high" }));
    (foodAnalyzer.buildAutoSaveMessage as jest.Mock).mockReturnValue("Logged tea ✅");

    await handleIncomingMessage(photoMsg, photoBuffer);

    expect(sendTextMessage).toHaveBeenCalledWith("911234567890", expect.stringContaining("Logged tea"));
    expect(fakeDb._mealLogs.length).toBe(1);
  });

  it("a new photo arriving while a previous ambiguity is still awaiting clarification saves the earlier meal as a best guess, then analyzes the new photo fresh", async () => {
    const { fakeDb, foodAnalyzer, sendTextMessage, handleIncomingMessage } = await setup();
    (foodAnalyzer.analyzeFood as jest.Mock).mockResolvedValueOnce(realFoodAnalysis({
      summary: "first meal", has_high_impact_ambiguity: true, clarification_question: "Tofu, paneer, or chicken?",
    }));
    (foodAnalyzer.computeSaveDecision as jest.Mock).mockReturnValueOnce(highImpactAmbiguityDecision("Tofu, paneer, or chicken?"));
    (foodAnalyzer.buildHighImpactClarificationMessage as jest.Mock).mockReturnValue("Tofu, paneer, or chicken?");

    await handleIncomingMessage(photoMsg, photoBuffer);
    expect(fakeDb._mealLogs.length).toBe(0);

    // A second, different photo arrives before the user ever answers the clarification.
    (foodAnalyzer.analyzeFood as jest.Mock).mockResolvedValueOnce(realFoodAnalysis({ summary: "second meal", meal_type: "dinner" }));
    (foodAnalyzer.computeSaveDecision as jest.Mock).mockReturnValueOnce(HIGH_CONFIDENCE_DECISION);
    await handleIncomingMessage(photoMsg, new Uint8Array([4, 5, 6]));

    expect(foodAnalyzer.analyzeFood).toHaveBeenCalledTimes(2);
    // the stale first meal is force-saved with its best-guess values, and the
    // second (unambiguous) photo is also auto-saved — neither is lost.
    expect(fakeDb._mealLogs.length).toBe(2);
    expect(fakeDb._mealLogs[0].ai_summary).toBe("first meal");
    expect(fakeDb._mealLogs[1].ai_summary).toBe("second meal");
    expect(sendTextMessage).toHaveBeenCalledWith("911234567890", expect.stringContaining("first meal"));
  });

  it("'skip' while awaiting clarification discards the pending (unsaved) meal", async () => {
    const { fakeDb, foodAnalyzer, sendTextMessage, handleIncomingMessage } = await setup();
    (foodAnalyzer.analyzeFood as jest.Mock).mockResolvedValue(realFoodAnalysis({
      has_high_impact_ambiguity: true, clarification_question: "Tofu, paneer, or chicken?",
    }));
    (foodAnalyzer.computeSaveDecision as jest.Mock).mockReturnValue(highImpactAmbiguityDecision("Tofu, paneer, or chicken?"));
    (foodAnalyzer.buildHighImpactClarificationMessage as jest.Mock).mockReturnValue("Tofu, paneer, or chicken?");

    await handleIncomingMessage(photoMsg, photoBuffer);
    await handleIncomingMessage({ from: "911234567890", type: "text", text: "skip" });

    expect(fakeDb._mealLogs.length).toBe(0);
    expect(sendTextMessage).toHaveBeenCalledWith("911234567890", expect.stringContaining("nothing saved"));
  });

  it("a hypothetical question is answered without saving, discarding, or modifying anything", async () => {
    const { fakeDb, foodAnalyzer, sendTextMessage, handleIncomingMessage } = await setup();
    (foodAnalyzer.analyzeFood as jest.Mock).mockResolvedValue(realFoodAnalysis());
    (foodAnalyzer.answerNutritionQuestion as jest.Mock).mockResolvedValue(
      "If the rice was replaced with 1 cup cooked pasta, this meal would be roughly 500-600 kcal."
    );

    await handleIncomingMessage(photoMsg, photoBuffer);
    expect(fakeDb._mealLogs.length).toBe(1); // auto-saved on the photo itself

    await handleIncomingMessage({ from: "911234567890", type: "text", text: "If this was pasta then what would be my calories?" });

    expect(fakeDb._mealLogs.length).toBe(1); // unchanged — the question didn't touch the saved meal
    expect(sendTextMessage).toHaveBeenCalledWith("911234567890", expect.stringContaining("500-600 kcal"));
    expect(sendTextMessage).toHaveBeenCalledWith("911234567890", expect.stringContaining("was this just a question"));
  });
});

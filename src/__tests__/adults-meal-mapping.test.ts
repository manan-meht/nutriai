import { getContactDetails } from "@nutriai/nutrition-core";

// Regression test for the meal-photo outage (Aug 2026).
//
// The family-loop reactions lookup was inserted into the middle of an
// existing two-promise Promise.all without renaming the destructured
// results, so `signedImageUrls` actually held the reactions map and
// `myReactions` held the URL array. Every meal photo in the family app and
// the web dashboard came back undefined, and no reaction ever showed as
// selected. Nothing failed loudly: the rows are `any`, so indexing an
// object by number and an array by uuid are both legal, and both just
// return undefined.
//
// So this test exercises the real mapping end to end against fakes, rather
// than asserting on the shape of the code.

const CONTACT_ID = "contact-1";
const USER_ID = "user-1";

const MEAL_ROWS = [
  { id: "meal-a", adults_contact_id: CONTACT_ID, meal_type: "lunch", logged_at: "2026-08-18T07:52:00Z", image_url: "contact-1/a.jpg", ai_summary: "Rice with egg curry", total_protein_min: 18, total_protein_max: 20, total_calories_min: 560, total_calories_max: 586 },
  { id: "meal-b", adults_contact_id: CONTACT_ID, meal_type: "breakfast", logged_at: "2026-08-18T03:37:00Z", image_url: "contact-1/b.jpg", ai_summary: "Butter tea and egg", total_protein_min: 11, total_protein_max: 13, total_calories_min: 500, total_calories_max: 536 },
  { id: "meal-c", adults_contact_id: CONTACT_ID, meal_type: "dinner", logged_at: "2026-08-17T14:05:00Z", image_url: null, ai_summary: "Dal and rice", total_protein_min: 20, total_protein_max: 22, total_calories_min: 480, total_calories_max: 520 },
];

/** Fake PostgREST: enough of the builder chain for the queries this
 * function makes, keyed by table. Every filter method returns the builder;
 * awaiting it yields the table's rows. */
const CHAIN_METHODS = ["select", "eq", "neq", "in", "is", "not", "gte", "lte", "gt", "lt", "ilike", "order", "limit", "range"];

function fakeClient(tables: Record<string, unknown[]>, opts: { user?: boolean } = {}) {
  const make = (table: string) => {
    const rows = tables[table] ?? [];
    const builder: any = {
      single: async () => ({ data: rows[0] ?? null, error: null }),
      maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
      then: (resolve: (v: unknown) => unknown) => resolve({ data: rows, error: null }),
    };
    for (const m of CHAIN_METHODS) builder[m] = () => builder;
    return builder;
  };

  return {
    from: (table: string) => make(table),
    auth: { getUser: async () => ({ data: { user: opts.user === false ? null : { id: USER_ID } } }) },
    storage: {
      from: () => ({
        createSignedUrl: async (path: string) => ({
          data: { signedUrl: `https://signed.test/${path}?token=abc` },
          error: null,
        }),
      }),
    },
  } as any;
}

function clients() {
  const rls = fakeClient({
    adults_contacts: [{ id: CONTACT_ID, full_name: "Samdup", caregiver_id: USER_ID, goals: [] }],
    meal_logs: MEAL_ROWS,
  });
  const admin = fakeClient({
    meal_reactions: [{ meal_log_id: "meal-a", emoji: "👍" }],
    meal_submissions: [],
    whatsapp_conversations: [],
  });
  return { rls, admin };
}

describe("adults contact details meal mapping", () => {
  it("returns a signed photo URL for every meal that has a photo", async () => {
    const { rls, admin } = clients();
    const details = await getContactDetails(CONTACT_ID, rls, admin, 30);

    expect(details).not.toBeNull();
    const byId = Object.fromEntries(details!.meals.map((m) => [m.id, m]));
    expect(byId["meal-a"].imageUrl).toBe("https://signed.test/contact-1/a.jpg?token=abc");
    expect(byId["meal-b"].imageUrl).toBe("https://signed.test/contact-1/b.jpg?token=abc");
  });

  it("leaves a photoless meal without a URL rather than borrowing another meal's", async () => {
    const { rls, admin } = clients();
    const details = await getContactDetails(CONTACT_ID, rls, admin, 30);
    const mealC = details!.meals.find((m) => m.id === "meal-c");
    expect(mealC!.imageUrl).toBeUndefined();
  });

  it("keeps photo URLs aligned with their own meal", async () => {
    const { rls, admin } = clients();
    const details = await getContactDetails(CONTACT_ID, rls, admin, 30);
    for (const meal of details!.meals) {
      if (!meal.imageUrl) continue;
      // The signed URL must contain this meal's own stored path.
      const expected = MEAL_ROWS.find((r) => r.id === meal.id)!.image_url;
      expect(meal.imageUrl).toContain(expected);
    }
  });

  it("reports the caregiver's own reaction on the meal they reacted to", async () => {
    const { rls, admin } = clients();
    const details = await getContactDetails(CONTACT_ID, rls, admin, 30);
    const byId = Object.fromEntries(details!.meals.map((m) => [m.id, m]));
    expect(byId["meal-a"].myReaction).toBe("👍");
    expect(byId["meal-b"].myReaction).toBeUndefined();
  });
});

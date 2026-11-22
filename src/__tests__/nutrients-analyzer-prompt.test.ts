// The micronutrient flag must not change what production sends to the
// meal analyzer. With GUIDANCE_MICRONUTRIENTS_ENABLED off, the prompt is
// checked byte for byte against a fingerprint of the analyzer's own prompt.
// With it on, the only difference is the extra section asking for grams,
// raw or cooked, and ingredients, and never for nutrient values.
//
// The fingerprint was first taken before the micronutrient feature existed
// (commit b6088d6) and retaken for prompt v3 (counted pieces, dish classes,
// egg preparation, shared bowls, kitchen scales and airy snacks; see
// src/lib/ai/portion-reference.ts), a deliberate change to the base prompt. Retake it only for a deliberate change like
// that, never to make a micronutrient change pass.

import { createHash } from "crypto";

const captured: string[] = [];
jest.mock("@google/generative-ai", () => ({
  GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
    getGenerativeModel: () => ({
      generateContent: async (parts: Array<{ text?: string }>) => {
        captured.push(parts.map((p) => p.text ?? "").join(""));
        return {
          response: {
            text: () =>
              JSON.stringify({
                foods: [{ name: "Dal", quantity: "1 katori", calories_min: 150, calories_max: 200, protein_min: 8, protein_max: 10, carbs_min: 20, carbs_max: 25, fat_min: 3, fat_max: 5, fiber_min: 4, fiber_max: 6 }],
                meal_type: "lunch",
                total_calories_min: 150,
                total_calories_max: 200,
                total_protein_min: 8,
                total_protein_max: 10,
                total_carbs_min: 20,
                total_carbs_max: 25,
                total_fat_min: 3,
                total_fat_max: 5,
                total_fiber_min: 4,
                total_fiber_max: 6,
                summary: "Dal",
                confidence: "high",
                is_zero_calorie_item: false,
              }),
          },
        };
      },
    }),
  })),
}));

import { analyzeFood, MICRONUTRIENT_PROMPT_SECTION } from "@/lib/ai/food-analyzer";

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

/** sha256 of the prompt analyzeFood sends at prompt v3, for each input below. */
const BASELINE: Record<string, string> = {
  photoIndia: "acbe641cd6b936eac65360b39875f9e203087caf8d8ac1acabe9d27c9a79a451",
  textSingapore: "e12f7a619751f61048651ecbcbe5a9c54a80d8629eb727fa686c7878b33a6ac7",
  correction: "391b550a4526a8e69ad68eb41904f84fe44feeb0f83522ad3c9d86540aeecafe",
};

const INPUTS = {
  photoIndia: { imageBuffer: new Uint8Array([1, 2, 3]), timezone: "Asia/Kolkata" },
  textSingapore: { text: "chicken rice and soup", timezone: "Asia/Singapore" },
  correction: { text: "it was paneer", correctionContext: "Tofu curry with rice", timezone: "Asia/Kolkata" },
};

async function promptFor(input: Parameters<typeof analyzeFood>[0]): Promise<string> {
  captured.length = 0;
  await analyzeFood(input);
  return captured[0];
}

describe("analyzer prompt and the micronutrient flag", () => {
  const original = process.env.GUIDANCE_MICRONUTRIENTS_ENABLED;
  // analyzeFood races the model against a 25 s timeout; fake timers keep
  // that timer from holding the test process open.
  beforeEach(() => jest.useFakeTimers({ doNotFake: ["nextTick", "setImmediate", "queueMicrotask"] }));
  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    if (original === undefined) delete process.env.GUIDANCE_MICRONUTRIENTS_ENABLED;
    else process.env.GUIDANCE_MICRONUTRIENTS_ENABLED = original;
  });

  it("is byte-for-byte unchanged when the flag is off", async () => {
    delete process.env.GUIDANCE_MICRONUTRIENTS_ENABLED;
    const hashes: Record<string, string> = {};
    for (const [k, input] of Object.entries(INPUTS)) hashes[k] = sha(await promptFor(input));
    expect(hashes).toEqual(BASELINE);
  });

  it("adds only the grams-and-ingredients section, and only when the flag is on and the caller asks for it", async () => {
    delete process.env.GUIDANCE_MICRONUTRIENTS_ENABLED;
    const off = await promptFor(INPUTS.photoIndia);
    // Flag off: asking changes nothing.
    expect(await promptFor({ ...INPUTS.photoIndia, micronutrientFields: true })).toBe(off);
    process.env.GUIDANCE_MICRONUTRIENTS_ENABLED = "true";
    // Flag on, but this person isn't in Guidance: the prompt is unchanged.
    expect(await promptFor(INPUTS.photoIndia)).toBe(off);
    expect(await promptFor({ ...INPUTS.photoIndia, micronutrientFields: false })).toBe(off);
    const on = await promptFor({ ...INPUTS.photoIndia, micronutrientFields: true });
    expect(on).not.toBe(off);
    expect(on.replace(MICRONUTRIENT_PROMPT_SECTION, "")).toBe(off);
    expect(MICRONUTRIENT_PROMPT_SECTION).toMatch(/edible_grams/);
    expect(MICRONUTRIENT_PROMPT_SECTION).toMatch(/ingredients/);
    // The model is asked for identities and weights, never nutrient values.
    expect(MICRONUTRIENT_PROMPT_SECTION).toMatch(/Do not estimate vitamins or minerals/);
  });

  it("passes the new fields through to the saved foods only when present", async () => {
    process.env.GUIDANCE_MICRONUTRIENTS_ENABLED = "true";
    const result = await analyzeFood(INPUTS.photoIndia);
    // The mocked model returned no extra fields: nothing is invented.
    expect(result.foods[0]).not.toHaveProperty("edible_grams");
    expect(result.foods[0]).not.toHaveProperty("ingredients");
  });
});

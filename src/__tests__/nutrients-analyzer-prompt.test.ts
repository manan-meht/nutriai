// The micronutrient flag must not change what production sends to the
// meal analyzer. With GUIDANCE_MICRONUTRIENTS_ENABLED off, the prompt is
// checked byte for byte against a fingerprint of the analyzer's own prompt.
// With it on, the only difference is the extra section asking for grams,
// raw or cooked, and ingredients, and never for nutrient values.
//
// The fingerprint was first taken before the micronutrient feature existed
// (commit b6088d6) and retaken for prompt v3 (counted pieces, dish classes
// and egg preparation; see src/lib/ai/portion-reference.ts), a deliberate
// change to the base prompt. Retake it only for a deliberate change like
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
  photoIndia: "48894f0aaf3ff30402524bfc0cd78a37240ec4a86e976e8d954871b6261429e7",
  textSingapore: "622140e38d44da56547022590c96f906d100d7dffa3b8aad00a34cfc692524fa",
  correction: "0e4d3a650e4ec6be262dd7543eb15c4b766242b8cd0ba39c2a61672983ba260b",
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

// The micronutrient flag must not change what production sends to the
// meal analyzer. With GUIDANCE_MICRONUTRIENTS_ENABLED off, the prompt is
// checked byte for byte against a fingerprint taken from the analyzer
// before this feature existed (commit b6088d6). With it on, the only
// difference is the extra section asking for grams, raw or cooked, and
// ingredients, and never for nutrient values.

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

/** sha256 of the prompt analyzeFood sent at b6088d6, for each input below. */
const BASELINE: Record<string, string> = {
  photoIndia: "01b8c699aaca250d5f1274f4efef78e36f7caf0522baa2aebc158bb03dcaad7a",
  textSingapore: "825b7209ab1be1e75401d1573a07673c158e66679b00c36285f6a3a6bfa7b3ab",
  correction: "cc6efbe7e9ba66690167bca50250e7b4a8486dd8341ae1e5a1ccc99607af5137",
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

  it("adds only the grams-and-ingredients section when the flag is on", async () => {
    delete process.env.GUIDANCE_MICRONUTRIENTS_ENABLED;
    const off = await promptFor(INPUTS.photoIndia);
    process.env.GUIDANCE_MICRONUTRIENTS_ENABLED = "true";
    const on = await promptFor(INPUTS.photoIndia);
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

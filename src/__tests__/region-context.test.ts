import fs from "fs";
import path from "path";
import { regionContextForTimezone, regionPromptSection } from "@/lib/ai/region-context";
import { buildLowConfidenceClarificationMessage, buildMealRecommendation, statedMealType } from "@/lib/ai/food-analyzer";

// The analyzer's prompt used to open with "specialized in Indian food" and
// carried nothing about where the person lives. A Singapore user reported
// hawker, Chinese and Japanese meals going unrecognised. The contact's
// timezone is the one signal we hold about that, and it now selects the
// dish vocabulary the prompt, the nudges and the clarification example use.

const src = (p: string) => fs.readFileSync(path.join(__dirname, "..", p), "utf-8");

describe("region from timezone", () => {
  it("picks Singapore's hawker vocabulary for Asia/Singapore", () => {
    const ctx = regionContextForTimezone("Asia/Singapore");
    expect(ctx.name).toBe("Singapore/Malaysia");
    expect(ctx.cuisineNote).toMatch(/laksa/);
    expect(ctx.cuisineNote).toMatch(/chicken rice/);
    expect(ctx.cuisineNote).toMatch(/cai fan/);
  });

  it("keeps Indian food as the default for India and for an unknown timezone", () => {
    expect(regionContextForTimezone("Asia/Kolkata").name).toBe("South Asia");
    expect(regionContextForTimezone(undefined).name).toBe("South Asia");
    expect(regionContextForTimezone(null).name).toBe("South Asia");
    expect(regionContextForTimezone("Asia/Yerevan").name).toBe("South Asia");
  });

  it("maps the other markets", () => {
    expect(regionContextForTimezone("Asia/Bangkok").name).toBe("Thailand");
    expect(regionContextForTimezone("Asia/Manila").name).toBe("Philippines");
    expect(regionContextForTimezone("Asia/Tokyo").name).toBe("East Asia");
    expect(regionContextForTimezone("Asia/Dubai").name).toBe("Gulf");
    expect(regionContextForTimezone("Europe/London").name).toBe("Western/mixed");
    expect(regionContextForTimezone("America/New_York").name).toBe("Western/mixed");
  });

  it("writes a prompt section that names the region and warns both ways", () => {
    const section = regionPromptSection("Asia/Singapore");
    expect(section).toMatch(/^REGION — the person lives in the Singapore\/Malaysia region \(timezone Asia\/Singapore\)/);
    // Adding local cuisine must not become a new bias in the other direction.
    expect(section).toMatch(/do not assume an Indian dish/);
    expect(section).toMatch(/do not assume a local dish when it clearly is/);
  });
});

describe("the region reaches the person", () => {
  it("is appended to the vision prompt, whose opener no longer says Indian-only", () => {
    const t = src("lib/ai/food-analyzer.ts");
    expect(t).toMatch(/regionPromptSection\(input\.timezone\)/);
    expect(t).not.toMatch(/specialized in Indian food\./);
  });

  it("is passed from the WhatsApp handler on every analysis", () => {
    const t = src("lib/whatsapp/conversation-handler.ts");
    expect(t).toMatch(/analyzeFood\(\{ \.\.\.input, timezone: contactTimezone \}\)/);
    // No call may bypass the wrapper, or that path silently loses the region.
    expect(t.match(/\banalyzeFood\(\{/g) ?? []).toHaveLength(1);
    expect(t).toMatch(/buildLowConfidenceClarificationMessage\(decision, contactTimezone\)/);
  });

  it("names local protein foods in the nudge", () => {
    const lightMeal = {
      foods: [{ name: "White rice", quantity: "1 bowl" }],
      summary: "A bowl of white rice",
      confidence: "high",
      meal_type: "lunch",
    } as never;
    expect(buildMealRecommendation(lightMeal, "lunch", null, "Asia/Singapore")).toMatch(/tofu, fish, eggs, chicken, tempeh, edamame/);
    expect(buildMealRecommendation(lightMeal, "lunch", null, "Asia/Kolkata")).toMatch(/dal, eggs, paneer, chicken, fish/);
  });

  it("asks for a description with a local example", () => {
    const decision = { clarificationQuestion: null } as never;
    expect(buildLowConfidenceClarificationMessage(decision, "Asia/Singapore")).toMatch(/chicken rice with soup/);
    expect(buildLowConfidenceClarificationMessage(decision)).toMatch(/rice, dal, and sabzi/);
  });

  it("still understands a typed meal name, which the auto-save now invites", () => {
    expect(statedMealType("Lunch, laksa")).toBe("lunch");
    expect(src("lib/ai/food-analyzer.ts")).toMatch(/or the right meal, e\.g\. \*\$\{otherMeal\}\*/);
  });
});

import {
  screenForGuidance,
  bmi,
  MINIMUM_SUPPORTED_AGE,
  UNDERWEIGHT_BMI,
  type ScreeningAnswers,
} from "@/lib/guidance/screening";

// The existing target engine has no age branch, computes no BMI and has no
// calorie floor: a 14-year-old on "lose fat" comes out of it with a ~1,350
// kcal target and nothing flagging it. This gate is what stops that reaching
// anybody, so each case below is a profile that must not be given automated
// restrictive targets.

const supported: ScreeningAnswers = {
  ageYears: 42,
  heightCm: 170,
  weightKg: 70,
  metabolicEquationSex: "female",
  isPregnantOrBreastfeeding: false,
  hasEatingDisorderHistory: false,
  conditionsOrMedications: "",
};

describe("profiles the standard policy supports", () => {
  it("passes a complete adult profile with nothing flagged", () => {
    const r = screenForGuidance(supported);
    expect(r.outcome).toBe("supported");
    expect(r.reasons).toEqual([]);
  });
});

describe("profiles that need a human", () => {
  it("refers a minor", () => {
    const r = screenForGuidance({ ...supported, ageYears: 14 });
    expect(r.outcome).toBe("needs_professional_review");
    expect(r.reasons).toContain("under_18");
  });

  it("treats the boundary age as supported", () => {
    expect(screenForGuidance({ ...supported, ageYears: MINIMUM_SUPPORTED_AGE }).outcome).toBe("supported");
    expect(screenForGuidance({ ...supported, ageYears: MINIMUM_SUPPORTED_AGE - 1 }).outcome).toBe("needs_professional_review");
  });

  it("refers pregnancy or breastfeeding", () => {
    const r = screenForGuidance({ ...supported, isPregnantOrBreastfeeding: true });
    expect(r.reasons).toContain("pregnant_or_breastfeeding");
  });

  it("refers a disclosed eating-disorder history", () => {
    const r = screenForGuidance({ ...supported, hasEatingDisorderHistory: true });
    expect(r.reasons).toContain("eating_disorder_concern");
  });

  it("refers an underweight profile", () => {
    // 45 kg at 170 cm is a BMI of 15.6.
    const r = screenForGuidance({ ...supported, weightKg: 45 });
    expect(r.reasons).toContain("underweight");
  });

  it("does not refer a profile just above the underweight threshold", () => {
    // 54 kg at 170 cm is 18.69.
    expect(screenForGuidance({ ...supported, weightKg: 54 }).outcome).toBe("supported");
  });

  it("refers a disclosed condition, reusing the chat handoff's vocabulary", () => {
    for (const text of ["I have type 2 diabetes", "on blood pressure medication", "kidney issues"]) {
      const r = screenForGuidance({ ...supported, conditionsOrMedications: text });
      expect(r.reasons).toContain("medical_oversight_needed");
    }
  });

  it("does not refer ordinary free text", () => {
    expect(screenForGuidance({ ...supported, conditionsOrMedications: "none, I feel fine" }).outcome).toBe("supported");
  });

  it("collects every reason rather than stopping at the first", () => {
    const r = screenForGuidance({
      ...supported,
      ageYears: 15,
      weightKg: 40,
      isPregnantOrBreastfeeding: true,
    });
    expect(r.reasons).toEqual(expect.arrayContaining(["under_18", "underweight", "pregnant_or_breastfeeding"]));
  });
});

describe("it fails closed", () => {
  it("does not read an unanswered risk question as a 'no'", () => {
    const r = screenForGuidance({ ...supported, isPregnantOrBreastfeeding: null });
    expect(r.outcome).toBe("needs_professional_review");
    expect(r.reasons).toContain("incomplete_answers");
  });

  it("refuses when the measurements a target needs are missing", () => {
    // The engine would otherwise substitute 70 kg and a 2000 kcal
    // maintenance fallback and emit a confident-looking number.
    // metabolicEquationSex included: without it the engine falls back to a
    // flat 2000 kcal maintenance and still emits a confident-looking target.
    for (const missing of [{ weightKg: null }, { heightCm: null }, { ageYears: null }, { metabolicEquationSex: null }] as const) {
      const r = screenForGuidance({ ...supported, ...missing });
      expect(r.outcome).toBe("needs_professional_review");
      expect(r.reasons).toContain("incomplete_answers");
    }
  });

  it("refers an empty profile rather than defaulting it to supported", () => {
    expect(screenForGuidance({}).outcome).toBe("needs_professional_review");
  });
});

describe("the message", () => {
  it("says tracking continues when someone is referred", () => {
    const r = screenForGuidance({ ...supported, isPregnantOrBreastfeeding: true });
    expect(r.message).toMatch(/keep logging meals/i);
    // Never implies something is wrong with the person.
    expect(r.message).not.toMatch(/cannot use|not allowed|unfortunately|sorry/i);
  });

  it("asks for details rather than referring when only answers are missing", () => {
    const r = screenForGuidance({ ...supported, hasEatingDisorderHistory: null });
    expect(r.message).toMatch(/few more details/i);
  });
});

describe("bmi", () => {
  it("computes from kg and cm", () => {
    expect(Math.round(bmi(70, 170)! * 10) / 10).toBe(24.2);
  });

  it("refuses nonsense rather than returning Infinity", () => {
    expect(bmi(70, 0)).toBeNull();
    expect(bmi(0, 170)).toBeNull();
    expect(bmi(-5, 170)).toBeNull();
  });

  it("uses the WHO underweight threshold", () => {
    expect(UNDERWEIGHT_BMI).toBe(18.5);
  });
});

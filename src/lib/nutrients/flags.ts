// Feature flags for the micronutrient pipeline. Server-side only (not
// NEXT_PUBLIC_*), read at call time so tests can switch them.
//
// Both default OFF. With GUIDANCE_MICRONUTRIENTS_ENABLED off, the meal
// analyzer's prompt and every meal-save path behave exactly as before this
// feature existed (src/__tests__/nutrients-pipeline.test.ts checks the
// prompt byte for byte), and nothing is written to the new tables.

/** Micronutrient estimation: the analyzer's extra fields, and the estimate
 * written after every meal save, correction and reanalysis. */
export function micronutrientsEnabled(): boolean {
  return process.env.GUIDANCE_MICRONUTRIENTS_ENABLED === "true";
}

/** The "likely low intake" status. Off until a qualified reviewer has set
 * nutrient-specific rules; even when on, it's only ever emitted for a
 * nutrient with a configured rule, and none are configured
 * (ASSESSMENT_CONFIG.likelyLowRules in assessment.ts). */
export function likelyLowEnabled(): boolean {
  return process.env.GUIDANCE_LIKELY_LOW_ENABLED === "true";
}

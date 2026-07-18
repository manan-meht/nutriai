/** Safety guard for Food Balance Recommendation copy — general wellness/
 * habit coaching only, never disease-specific or prescriptive. This is a
 * defensive check over hand-authored templates (see personalize.ts and
 * generate.ts), not a filter on LLM free-text — nothing in this feature
 * lets a model write recommendation copy directly, so this exists to
 * catch a careless future template edit, not to sanitize live model
 * output. */
const BANNED_PHRASES: RegExp[] = [
  /\blower\s+(your\s+)?blood\s+sugar\b/i,
  /\breduce\s+(your\s+)?ldl\b/i,
  /\btreat\s+hypertension\b/i,
  /\b(for|with)\s+kidney\s+disease\b/i,
  /\bavoid\s+carbs?\s+because\s+of\s+diabetes\b/i,
  /\bprevent(s|ing)?\s+heart\s+disease\b/i,
  /\bcures?\s+inflammation\b/i,
  /\byou\s+(need|must)\b/i,
  /\byou\s+are\s+deficient\b/i,
  /\bthis\s+will\s+(fix|cure|treat|prevent)\b/i,
  /\bdiagnos(e|is|ing)\b/i,
];

export function violatesSafetyRules(text: string): boolean {
  return BANNED_PHRASES.some((pattern) => pattern.test(text));
}

/** Validates every text field of a recommendation-shaped object. Returns
 * true only if all present fields are clean. Callers should fall back to
 * a generic, pre-approved template rather than showing anything that
 * fails this — see generate.ts's SAFE_FALLBACK. */
export function isRecommendationSafe(fields: { title?: string; description?: string; action?: string; whyThisHelps?: string }): boolean {
  return Object.values(fields).every((text) => !text || !violatesSafetyRules(text));
}

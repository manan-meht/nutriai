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
  // Compensatory-eating / restriction language — added for the "Today's
  // Focus" morning recommendation feature (see todays-focus.ts), whose
  // spec explicitly bans exactly this framing after a high-calorie day.
  /\byou\s+failed\b/i,
  /\byou\s+(were|are)\s+bad\b/i,
  /\bexceeded\s+your\s+allowance\b/i,
  /\byou\s+need\s+to\s+compensate\b/i,
  /\bburn\s+off\s+yesterday'?s\s+food\b/i,
  /\beat\s+less\s+today\s+because\b/i,
  /\bmake\s+up\s+for\s+yesterday'?s\s+deficit\b/i,
  /\bskip\s+(a\s+meal|breakfast|lunch|dinner)\b/i,
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

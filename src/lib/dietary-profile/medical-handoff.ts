/** Tistra gives general food-balance guidance, never disease-specific
 * advice — this is the boundary that enforces that. Detects when a
 * user's own message mentions a medical condition/situation so the
 * response can add a safe handoff instead of attempting condition-
 * specific recommendations. Matches on the user's own wording, not on
 * anything inferred from their meals — this module never guesses at a
 * medical condition from what someone eats or doesn't eat (rule 9). */
const CONDITION_KEYWORDS: RegExp[] = [
  /\bdiabet(es|ic)\b/i,
  /\b(kidney|renal)\b/i,
  /\b(hypertension|high blood pressure|bp\b)/i,
  /\b(heart disease|cardiac|cardiovascular)\b/i,
  /\bpregnan(t|cy)\b/i,
  /\b(eating disorder|anorexi|bulimi|binge.?eating)\b/i,
  /\bcancer\b/i,
  /\b(liver disease|cirrhosis|hepatitis)\b/i,
  /\bmedication\b/i,
  /\b(lab (result|report)s?|blood (test|work|report))\b/i,
];

export function mentionsMedicalCondition(text: string): boolean {
  return CONDITION_KEYWORDS.some((pattern) => pattern.test(text));
}

export const MEDICAL_HANDOFF_MESSAGE =
  "Because this may involve a medical condition, Tistra can share general food-balance ideas, but a doctor or registered dietitian should help set your specific targets.";

/** Appends the safe handoff to a response only when the user's own
 * message mentioned a medical condition — never proactively, so ordinary
 * food-balance replies stay uncluttered. */
export function withMedicalHandoffIfNeeded(response: string, userText: string): string {
  if (!mentionsMedicalCondition(userText)) return response;
  return `${response}\n\n${MEDICAL_HANDOFF_MESSAGE}`;
}

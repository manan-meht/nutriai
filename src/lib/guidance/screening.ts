import { mentionsMedicalCondition } from "@/lib/dietary-profile/medical-handoff";

// Who the standard target policy may be applied to, and who needs a human.
//
// The existing engine (packages/health-scoring calculateMacroTargets) will
// cheerfully produce a 15% deficit for a 14-year-old, someone who is
// pregnant, or someone already underweight. It has no age branch, computes
// no BMI, and has no calorie floor — a low-RMR profile on weight_loss comes
// out near 1,350 kcal with nothing flagging it. That is fine for the Food
// Balance Score, which grades what you ate, and not fine for Guidance,
// which tells you what to eat.
//
// So this gate runs BEFORE any target is produced. An unsupported profile
// gets ordinary tracking and a referral — never an automated restrictive
// target, and never a silently softened one, because a quietly adjusted
// deficit still answers a question that should not have been answered
// automatically.
//
// Deliberately fail-closed: an answer we do not have is not an answer of
// "no". Nothing here infers a condition from what someone eats; it reads
// only what they told us, which is the same rule medical-handoff.ts states.

export type ScreeningOutcome = "supported" | "needs_professional_review";

export type ScreeningReason =
  | "under_18"
  | "pregnant_or_breastfeeding"
  | "underweight"
  | "eating_disorder_concern"
  | "medical_oversight_needed"
  | "incomplete_answers";

/** What the person told us at setup. Every field is optional because an
 * unanswered question must not read as a cleared one — see `incomplete`. */
export interface ScreeningAnswers {
  ageYears?: number | null;
  heightCm?: number | null;
  weightKg?: number | null;
  /** Mifflin-St Jeor needs this and the engine has no sensible default for
   * it. Deliberately not inferrable from the gender field — see energy.ts. */
  metabolicEquationSex?: "male" | "female" | null;
  isPregnantOrBreastfeeding?: boolean | null;
  hasEatingDisorderHistory?: boolean | null;
  /** Free text, in their own words. Matched, never parsed for meaning. */
  conditionsOrMedications?: string | null;
}

export interface ScreeningResult {
  outcome: ScreeningOutcome;
  reasons: ScreeningReason[];
  /** Shown to the person, never to a family viewer. */
  message: string;
}

/** Below this, an adult energy equation is the wrong tool: Mifflin-St Jeor
 * is derived from adults, and growth changes the requirement entirely. */
export const MINIMUM_SUPPORTED_AGE = 18;

/** WHO's underweight threshold. Used only to route to a human — never to
 * set, cap or adjust a target, which is exactly the judgement being
 * deferred. */
export const UNDERWEIGHT_BMI = 18.5;

export function bmi(weightKg: number, heightCm: number): number | null {
  if (!(weightKg > 0) || !(heightCm > 0)) return null;
  const metres = heightCm / 100;
  return weightKg / (metres * metres);
}

export function screenForGuidance(answers: ScreeningAnswers): ScreeningResult {
  const reasons: ScreeningReason[] = [];

  // Age, height and weight are all required to produce a target at all, so
  // their absence is a screening failure rather than a silent default. The
  // existing engine substitutes 70 kg and 2000 kcal when they are missing;
  // that is acceptable for a score and not for a plan.
  // metabolicEquationSex belongs with the measurements: without it
  // calculateMaintenanceEstimate returns null and the engine substitutes a
  // flat 2000 kcal, which still reaches the screen looking calculated.
  // Found by running this against a real contact whose column was null —
  // the engine set isProfileIncomplete AND emitted 2100 kcal, and nothing
  // anywhere acted on the flag.
  const missingCore =
    answers.ageYears == null ||
    answers.heightCm == null ||
    answers.weightKg == null ||
    answers.metabolicEquationSex == null;
  const unansweredRisk =
    answers.isPregnantOrBreastfeeding == null || answers.hasEatingDisorderHistory == null;
  if (missingCore || unansweredRisk) reasons.push("incomplete_answers");

  if (answers.ageYears != null && answers.ageYears < MINIMUM_SUPPORTED_AGE) {
    reasons.push("under_18");
  }

  if (answers.isPregnantOrBreastfeeding === true) {
    reasons.push("pregnant_or_breastfeeding");
  }

  if (answers.hasEatingDisorderHistory === true) {
    reasons.push("eating_disorder_concern");
  }

  if (answers.weightKg != null && answers.heightCm != null) {
    const index = bmi(answers.weightKg, answers.heightCm);
    if (index != null && index < UNDERWEIGHT_BMI) reasons.push("underweight");
  }

  // Reuses the chat handoff's keyword list rather than inventing a second
  // one, so the two surfaces cannot drift into disagreeing about what
  // counts as a medical mention.
  if (answers.conditionsOrMedications && mentionsMedicalCondition(answers.conditionsOrMedications)) {
    reasons.push("medical_oversight_needed");
  }

  const outcome: ScreeningOutcome = reasons.length === 0 ? "supported" : "needs_professional_review";

  return { outcome, reasons, message: messageFor(outcome, reasons) };
}

/** Warm, specific, and never implying something is wrong with the person.
 * The referral is about what Tistra should not decide automatically, not
 * about them. */
function messageFor(outcome: ScreeningOutcome, reasons: ScreeningReason[]): string {
  if (outcome === "supported") {
    return "We can set up starting targets for you.";
  }
  if (reasons.includes("incomplete_answers") && reasons.length === 1) {
    return "We need a few more details before we can suggest targets. You can keep logging meals as usual in the meantime.";
  }
  return (
    "Tistra isn't the right place to set calorie targets for your situation — a doctor or registered dietitian should. " +
    "You can keep logging meals and seeing your Food Balance Score as usual, and we'll show what you've eaten without setting targets."
  );
}

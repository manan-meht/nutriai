// Who may switch Guidance on, off, and read what it collected.
//
// The rule the brief is emphatic about: Guidance must be enabled by the
// person whose nutrition is being tracked, and paying for or viewing
// someone's profile does not grant permission. In this product those are
// easy to confuse, because the person who owns the account usually is not
// the person being tracked — a daughter adds her mother, pays for the
// plan, sees every meal, and has every legitimate reason to think she can
// set up targets for her. She cannot. Setting someone a calorie target is
// a decision about their body, and the account relationship says nothing
// about whether they agreed to it.
//
// So ownership is necessary for nothing here. The question is only ever
// "is the actor the tracked person?", which has three affirmative answers
// in this codebase, and `ActivatedVia` names them.
//
// Deliberately pure: no database, no cookies, no Supabase client. The
// caller loads the contact's facts and passes them in, so the rule can be
// read in one screen and tested without a fake. The I/O lives in
// activation.ts.

export type ActivatedVia = "self_account" | "end_user_session" | "whatsapp";

export type GuidanceActor =
  /** Signed in to the caregiver account (Supabase Auth). Only the tracked
   * person when the contact is their own 'self' profile. */
  | { kind: "caregiver"; profileId: string }
  /** Authenticated as the tracked person on /my-progress, via WhatsApp OTP
   * or an access code (end_user_sessions). */
  | { kind: "end_user_session"; contactId: string }
  /** Replied in their own WhatsApp thread. For a contact who has only ever
   * had a WhatsApp number, this is the only channel they have. */
  | { kind: "whatsapp"; contactId: string };

/** What the server must load about the contact before deciding. */
export interface GuidanceContactFacts {
  contactId: string;
  /** adults_contacts.caregiver_id — the account that added them. */
  caregiverId: string | null;
  /** 'self' means the caregiver is tracking themselves, so the account
   * holder and the tracked person are the same human. */
  relationshipType: "self" | "family_caregiver";
}

export type DenialReason =
  /** The actor owns this contact but is not the person being tracked. The
   * one denial that is not an error on the caller's part — it is the rule. */
  | "not_the_tracked_person"
  /** The actor has no relationship to this contact at all. */
  | "not_your_contact"
  /** A session or thread for a different contact than the one named. */
  | "wrong_contact";

export type AuthorizationResult =
  | { allowed: true; activatedVia: ActivatedVia }
  | { allowed: false; reason: DenialReason; message: string };

const NOT_THE_TRACKED_PERSON_MESSAGE =
  "Only the person being tracked can turn on Nutrition Guidance. Ask them to open their own progress page, " +
  "or reply to Tistra on WhatsApp, and they can set it up in a couple of minutes.";

const NOT_YOURS_MESSAGE = "You don't have access to this person's nutrition settings.";

/**
 * May this actor turn Guidance ON for this contact — and if so, which
 * consent channel gets recorded on the row?
 */
export function authorizeGuidanceActivation(
  actor: GuidanceActor,
  facts: GuidanceContactFacts
): AuthorizationResult {
  switch (actor.kind) {
    case "caregiver": {
      // Ownership is checked first only so that a stranger gets "no
      // access" rather than a message explaining whose consent is needed.
      const owns = facts.caregiverId != null && facts.caregiverId === actor.profileId;
      if (!owns) {
        return { allowed: false, reason: "not_your_contact", message: NOT_YOURS_MESSAGE };
      }
      // The whole rule, in one branch: owning the contact and paying for
      // the plan is not consent from the person being tracked.
      if (facts.relationshipType !== "self") {
        return {
          allowed: false,
          reason: "not_the_tracked_person",
          message: NOT_THE_TRACKED_PERSON_MESSAGE,
        };
      }
      return { allowed: true, activatedVia: "self_account" };
    }

    case "end_user_session": {
      if (actor.contactId !== facts.contactId) {
        return { allowed: false, reason: "wrong_contact", message: NOT_YOURS_MESSAGE };
      }
      return { allowed: true, activatedVia: "end_user_session" };
    }

    case "whatsapp": {
      if (actor.contactId !== facts.contactId) {
        return { allowed: false, reason: "wrong_contact", message: NOT_YOURS_MESSAGE };
      }
      return { allowed: true, activatedVia: "whatsapp" };
    }
  }
}

/**
 * May this actor change the targets themselves?
 *
 * Identical to activation, and deliberately a separate function rather
 * than a comment saying "same as activation": a revised target is a new
 * consent decision, not an edit to a setting, and the day someone adds a
 * "caregiver can adjust targets" feature this is where it would have to be
 * argued for rather than quietly inherited.
 */
export function authorizeTargetChange(
  actor: GuidanceActor,
  facts: GuidanceContactFacts
): AuthorizationResult {
  return authorizeGuidanceActivation(actor, facts);
}

/**
 * May this actor switch Guidance back OFF?
 *
 * Looser than activation, on purpose. Returning to Tracking strictly
 * reduces what the system does — it stops automated nutrition advice and
 * hides the targets, and preserves every meal, preference and target row.
 * A caregiver who becomes worried about advice their mother is receiving
 * should be able to stop it arriving without first getting her to log in,
 * so the owning caregiver may deactivate even though they could never have
 * activated.
 *
 * This is not a control vector worth guarding: the tracked person can turn
 * it straight back on themselves, which is exactly the asymmetry wanted —
 * stopping is available to both, starting only to them.
 */
export function authorizeGuidanceDeactivation(
  actor: GuidanceActor,
  facts: GuidanceContactFacts
): AuthorizationResult {
  if (actor.kind === "caregiver") {
    const owns = facts.caregiverId != null && facts.caregiverId === actor.profileId;
    if (!owns) return { allowed: false, reason: "not_your_contact", message: NOT_YOURS_MESSAGE };
    return { allowed: true, activatedVia: facts.relationshipType === "self" ? "self_account" : "end_user_session" };
  }
  return authorizeGuidanceActivation(actor, facts);
}

/**
 * May this actor read the suitability-screening answers?
 *
 * Never a caregiver, including the one paying for the account and
 * including on their own family member's contact. These answers are
 * pregnancy, eating-disorder history, and conditions and medications in
 * the person's own words — the most sensitive thing the product holds, and
 * collected only to decide whether to compute a target.
 *
 * The brief asks that they not be exposed to family viewers "by default";
 * there is no path here that opts in, because no screen needs one. The
 * schema enforces the same thing from the other side by keeping them in
 * their own table, so a caregiver query cannot select them by accident.
 */
export function canReadScreeningAnswers(actor: GuidanceActor, facts: GuidanceContactFacts): boolean {
  if (actor.kind === "caregiver") {
    return facts.relationshipType === "self" && facts.caregiverId === actor.profileId;
  }
  return actor.contactId === facts.contactId;
}

// Who may switch Guidance on, off, and read what it collected.
//
// The rule, as decided on 2026-10-27: the person being tracked may turn
// Guidance on, and so may the account holder who tracks them, a family
// caregiver or a coach. 0068 shipped with the narrower rule that only the
// tracked person could. The product reality is that most of them never open
// the app: a parent who only messages the WhatsApp bot, or a gym client
// whose coach logs for them. Under the old rule Guidance was unreachable for
// exactly the people it is for.
//
// What that decision does not change is the record. `ActivatedVia` says
// who actually decided: 'caregiver' and 'coach' are never stored as the
// person's own consent. Anything later that needs the person's own
// agreement (a stricter policy, a regulator's question, the person asking
// "who set this?") can tell the two apart. And the tracked person keeps
// the last word in one direction: they can always switch it off themselves.
//
// Ownership is what grants the on-behalf path, so a stranger, or an
// account holder looking at someone else's contact, still gets nothing.
//
// Deliberately pure: no database, no cookies, no Supabase client. The
// caller loads the contact's facts and passes them in, so the rule can be
// read in one screen and tested without a fake. The I/O lives in
// activation.ts.

/** The person who decided. The first three are the tracked person; the
 * last two are the account holder acting for them. */
export type ActivatedVia = "self_account" | "end_user_session" | "whatsapp" | "caregiver" | "coach";

/** Which table the tracked person lives in: adults_contacts for the family
 * product, gym_clients for coaching. Same values as the end-user session's
 * ContactType. */
export type GuidanceContactType = "adults" | "gym";

export type GuidanceActor =
  /** Signed in to a Tistra account (Supabase Auth): a family caregiver, a
   * coach, or someone tracking themselves. The name predates coaches. */
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
  contactType: GuidanceContactType;
  /** The account that tracks them: adults_contacts.caregiver_id, or
   * gym_clients.trainer_id. */
  caregiverId: string | null;
  /** 'self' means the account holder is tracking themselves, so the
   * account holder and the tracked person are the same human. Coach clients
   * are always 'coach_client'. */
  relationshipType: "self" | "family_caregiver" | "coach_client";
}

export type DenialReason =
  /** The actor has no relationship to this contact at all. */
  | "not_your_contact"
  /** A session or thread for a different contact than the one named. */
  | "wrong_contact";

export type AuthorizationResult =
  | { allowed: true; activatedVia: ActivatedVia }
  | { allowed: false; reason: DenialReason; message: string };

const NOT_YOURS_MESSAGE = "You don't have access to this person's nutrition settings.";

/** Who the owning account holder is, in consent terms. */
function ownerChannel(facts: GuidanceContactFacts): ActivatedVia {
  if (facts.relationshipType === "self") return "self_account";
  return facts.relationshipType === "coach_client" ? "coach" : "caregiver";
}

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
      const owns = facts.caregiverId != null && facts.caregiverId === actor.profileId;
      if (!owns) {
        return { allowed: false, reason: "not_your_contact", message: NOT_YOURS_MESSAGE };
      }
      // The account holder acts for the person they track, and the row says
      // so: 'caregiver' or 'coach', never the person's own channel.
      return { allowed: true, activatedVia: ownerChannel(facts) };
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
 * consent decision, not an edit to a setting, and the day the two rules
 * need to differ this is where it would have to be argued for rather than
 * quietly inherited.
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
 * Today this matches activation: the tracked person and the owning account
 * holder may both stop it. It stays a separate function because the two
 * rules exist for different reasons. Stopping strictly reduces what the
 * system does: it ends automated nutrition advice and hides the targets,
 * and keeps every meal, preference and target row. So it is the one
 * permission that must never be narrowed for the tracked person, whoever
 * turned Guidance on.
 */
export function authorizeGuidanceDeactivation(
  actor: GuidanceActor,
  facts: GuidanceContactFacts
): AuthorizationResult {
  return authorizeGuidanceActivation(actor, facts);
}

/**
 * May this actor read the suitability-screening answers back?
 *
 * The tracked person, and someone tracking themselves. Never a caregiver
 * or coach for someone else, even one who typed the answers in on that
 * person's behalf. The person may later answer for themselves, and those
 * answers (pregnancy, eating-disorder history, conditions and medications
 * in their own words) are the most sensitive thing the product holds. No
 * screen reads them back today; this keeps it so if one ever does.
 *
 * The schema enforces the same thing from the other side by keeping them
 * in their own table, so a caregiver query cannot select them by accident.
 */
export function canReadScreeningAnswers(actor: GuidanceActor, facts: GuidanceContactFacts): boolean {
  if (actor.kind === "caregiver") {
    return facts.relationshipType === "self" && facts.caregiverId === actor.profileId;
  }
  return actor.contactId === facts.contactId;
}

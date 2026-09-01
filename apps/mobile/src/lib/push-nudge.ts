/** Decides when to tell a caregiver they are missing meal updates.
 *
 * Deliberately dependency-free (no React, no Expo, no "@/" imports) so the
 * repo's root jest config can exercise it directly — the mobile package has
 * no test runner of its own, and the cadence rules below are exactly the
 * kind of off-by-one-prone logic that should not ship untested.
 *
 * Background: 13 of 20 family-plan caregivers had no push token at all and
 * no way to discover that. Android reports a never-requested notification
 * permission as "denied", so the priming card's `status === 'undetermined'`
 * check never matched and the permission was never requested. Those
 * accounts were silently missing every meal notification. This nudge is the
 * safety net — it only speaks up when there is something real being missed.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** How often the nudge is allowed to reappear. */
export const NUDGE_INTERVAL_MS = 7 * DAY_MS;

export interface NudgeContact {
  fullName: string;
  relationshipType: string;
  /** Rolling 7-day window ending today; always computed server-side (see
   * packages/nutrition-core/src/adults.ts). */
  last7DaysMealCount?: number;
  /** Lifetime count, used only as a fallback when the rolling window is
   * absent, so a missing field can never silently disable the nudge. */
  mealCount: number;
}

/** True when this contact is someone ELSE the caregiver follows, and that
 * person is actually logging meals — the two halves of "there is something
 * to miss". A "self" contact is the caregiver's own logging, which needs no
 * notification, and a dormant contact generates nothing to be notified
 * about, so nagging about either would be noise. */
export function isTrackedLovedOne(contact: NudgeContact): boolean {
  if (contact.relationshipType === "self") return false;
  const rolling = contact.last7DaysMealCount;
  return rolling === undefined ? contact.mealCount > 0 : rolling > 0;
}

/** First names of the loved ones actively logging, for the card's copy —
 * "Kamlesh" reads as a person, "1 contact" reads as a database row. */
export function trackedLovedOneNames(contacts: NudgeContact[]): string[] {
  return contacts.filter(isTrackedLovedOne).map((c) => c.fullName.split(" ")[0]);
}

/** Whether two instants fall on the same local calendar day. */
export function isSameLocalDay(a: number, b: number): boolean {
  const da = new Date(a);
  const db = new Date(b);
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  );
}

/**
 * The cadence: visible for one day, once a week.
 *
 * - never shown before -> show (and the caller records `now`)
 * - already shown earlier TODAY -> keep showing, so the nudge survives an
 *   app restart within its day rather than vanishing on the first relaunch
 * - otherwise -> stay hidden until a full interval has passed
 *
 * `lastShownAt` is also what "Not now" writes, which is why dismissing
 * inside the visible day still hides it: the caller sets it to `now`, and
 * the same-day branch is only reached on a LATER mount, by which point the
 * dismissal has already re-based the interval.
 */
export function shouldShowWeeklyNudge(lastShownAt: number | null, now: number): boolean {
  if (lastShownAt === null) return true;
  if (!Number.isFinite(lastShownAt)) return true;
  if (isSameLocalDay(lastShownAt, now)) return true;
  return now - lastShownAt >= NUDGE_INTERVAL_MS;
}

/** Parses the stored value, tolerating the absent/corrupt cases rather than
 * throwing inside a render effect. */
export function parseLastShownAt(raw: string | null): number | null {
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/** The card's body copy. Names the people involved, because "you're missing
 * updates" is abstract until it says whose. */
export function missingUpdatesMessage(names: string[]): string {
  if (names.length === 0) return "You're missing meal updates from your loved ones.";
  if (names.length === 1) return `You're missing meal updates from ${names[0]}.`;
  if (names.length === 2) return `You're missing meal updates from ${names[0]} and ${names[1]}.`;
  return `You're missing meal updates from ${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}.`;
}

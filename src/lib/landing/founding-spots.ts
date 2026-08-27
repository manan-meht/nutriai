import { createServiceClient } from "@/lib/supabase/server";
import { COACH_MARKET } from "./coach-market";

/** How many Founding Coach places are left.
 *
 * The scarcity is real and that is the whole point: we can only personally
 * onboard and fund promotion for so many coaches at once. Nothing here
 * invents a number, and there is deliberately no countdown timer — a fake
 * deadline is the fastest way to lose a professional's trust.
 */

export const TOTAL_FOUNDING_COACH_SPOTS = COACH_MARKET.foundingCoachLimit;

/** Set to a number to state the count manually; leave null to read the real
 * one from the database. Null is the honest default — an override that
 * someone forgets to update becomes a lie the moment a coach joins. */
export const FOUNDING_COACHES_JOINED: number | null = null;

export interface FoundingSpots {
  total: number;
  joined: number;
  remaining: number;
  /** False once the places are gone, so the page can stop advertising them
   * rather than showing "0 spots remaining" next to a Claim button. */
  available: boolean;
}

export function spotsFrom(joined: number, total = TOTAL_FOUNDING_COACH_SPOTS): FoundingSpots {
  const safeJoined = Math.max(0, Math.min(joined, total));
  const remaining = total - safeJoined;
  return { total, joined: safeJoined, remaining, available: remaining > 0 };
}

/** Live count of coaches who have claimed a place.
 *
 * A place is taken when someone creates a real coach profile, published or
 * not — they are in the group being onboarded from that moment, which is
 * the thing the limit actually constrains. Demo profiles are excluded.
 *
 * Never throws. This renders inside a Google Ads landing page; a failed
 * count must degrade to "no number shown", not to a 500. */
export async function foundingSpots(): Promise<FoundingSpots> {
  if (FOUNDING_COACHES_JOINED != null) return spotsFrom(FOUNDING_COACHES_JOINED);

  try {
    const admin = createServiceClient();
    const { count, error } = await admin
      .from("coach_profiles")
      .select("id", { count: "exact", head: true })
      .eq("is_demo", false);
    if (error || count == null) return spotsFrom(0);
    return spotsFrom(count);
  } catch {
    return spotsFrom(0);
  }
}

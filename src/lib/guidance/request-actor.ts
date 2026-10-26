import { END_USER_DASHBOARD_ENABLED, PARENT_DASHBOARD_ACCESS_ENABLED } from "@/lib/billing/feature-flags";
import { hasAcceptedConsent } from "@/lib/end-user/dashboard-service";
import { getEndUserSession } from "@/lib/end-user/session";
import { createClient } from "@/lib/supabase/server";

import type { GuidanceActor } from "./authorization";

// Who is making this request, as authorization.ts needs to know it.
//
// The surface only says which credential to look for. It arrives from the
// browser like every other server-action argument, so it decides nothing
// by itself: "account" still needs a signed-in Supabase user, and
// "my_progress" still needs a valid end-user session cookie. Whether that
// actor may act on the contact named is authorization.ts's question, asked
// inside activation.ts — this module never answers it.

export type GuidanceSurface = "account" | "my_progress";

export async function resolveGuidanceActor(surface: unknown): Promise<GuidanceActor | null> {
  if (surface === "account") {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    return user ? { kind: "caregiver", profileId: user.id } : null;
  }

  if (surface === "my_progress") {
    // The same gates /my-progress/dashboard applies before showing anything.
    if (!END_USER_DASHBOARD_ENABLED && !PARENT_DASHBOARD_ACCESS_ENABLED) return null;
    const session = await getEndUserSession();
    // Guidance hangs off adults_contacts. A gym client's session names a
    // gym_clients row, which has no Guidance at all.
    if (!session || session.contactType !== "adults") return null;
    if (!(await hasAcceptedConsent(session.contactId))) return null;
    return { kind: "end_user_session", contactId: session.contactId };
  }

  return null;
}

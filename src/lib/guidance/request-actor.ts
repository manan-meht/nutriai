import { END_USER_DASHBOARD_ENABLED, PARENT_DASHBOARD_ACCESS_ENABLED } from "@/lib/billing/feature-flags";
import { hasAcceptedConsent } from "@/lib/end-user/dashboard-service";
import { getEndUserSession } from "@/lib/end-user/session";
import { createClient } from "@/lib/supabase/server";

import type { GuidanceActor, GuidanceContactType } from "./authorization";

// Who is making this request, as authorization.ts needs to know it.
//
// The surface says which credential to look for, and which table the
// contact id names:
//
//   account      a signed-in account holder, for a family contact (adults)
//   coach        a signed-in account holder, for a coach client (gym)
//   my_progress  the tracked person's own end-user session (adults)
//
// It arrives from the browser like every other server-action argument, so
// it decides nothing by itself: "account" and "coach" still need a
// signed-in Supabase user, and "my_progress" still needs a valid session
// cookie. Choosing "coach" for a family contact's id finds no gym client,
// and ends in not_found. Whether the actor may act on the contact named is
// authorization.ts's question, asked inside activation.ts. This module
// never answers it.

export type GuidanceSurface = "account" | "coach" | "my_progress";

export interface GuidanceRequest {
  actor: GuidanceActor;
  contactType: GuidanceContactType;
}

export async function resolveGuidanceActor(surface: unknown): Promise<GuidanceRequest | null> {
  if (surface === "account" || surface === "coach") {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    return { actor: { kind: "caregiver", profileId: user.id }, contactType: surface === "coach" ? "gym" : "adults" };
  }

  if (surface === "my_progress") {
    // The same gates /my-progress/dashboard applies before showing anything.
    if (!END_USER_DASHBOARD_ENABLED && !PARENT_DASHBOARD_ACCESS_ENABLED) return null;
    const session = await getEndUserSession();
    // Family contacts only. A coach client's session would name a
    // gym_clients row; their coach turns Guidance on for them, and no
    // /my-progress screen offers it to them yet.
    if (!session || session.contactType !== "adults") return null;
    if (!(await hasAcceptedConsent(session.contactId))) return null;
    return { actor: { kind: "end_user_session", contactId: session.contactId }, contactType: "adults" };
  }

  return null;
}

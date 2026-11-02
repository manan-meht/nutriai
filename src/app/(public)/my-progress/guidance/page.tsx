export const dynamic = "force-dynamic";

import { notFound, redirect } from "next/navigation";

import { confirmGuidanceAction, proposeGuidanceAction, returnToTrackingAction } from "@/app/actions/guidance";
import { GuidancePanel } from "@/components/guidance/GuidancePanel";
import { resolveGuidanceActor } from "@/lib/guidance/request-actor";
import { loadGuidanceView } from "@/lib/guidance/view";
import { createServiceClient } from "@/lib/supabase/server";

// Guidance for the tracked person on their own /my-progress session. Their
// caregiver can also set it up for them; either way, this is where they can
// see it and switch it off themselves.
export default async function MyProgressGuidancePage() {
  const request = await resolveGuidanceActor("my_progress");
  // No session, no consent yet, or a gym client's session: the dashboard
  // already knows how to handle each of those, so send them there.
  if (!request || request.actor.kind !== "end_user_session") redirect("/my-progress/dashboard");

  const { contactId } = request.actor;
  const view = await loadGuidanceView(createServiceClient(), { contactId, ...request });
  if (view.kind === "not_found") notFound();
  if (view.kind === "feature_off") redirect("/my-progress/dashboard");

  return (
    <GuidancePanel
      key={view.kind}
      view={view}
      backHref="/my-progress/dashboard"
      onPropose={proposeGuidanceAction.bind(null, "my_progress", contactId)}
      onConfirm={confirmGuidanceAction.bind(null, "my_progress", contactId)}
      onReturnToTracking={returnToTrackingAction.bind(null, "my_progress", contactId)}
    />
  );
}

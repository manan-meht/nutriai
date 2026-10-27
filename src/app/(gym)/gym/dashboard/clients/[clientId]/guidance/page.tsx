import { notFound, redirect } from "next/navigation";

import { confirmGuidanceAction, proposeGuidanceAction, returnToTrackingAction } from "@/app/actions/guidance";
import { GuidancePanel } from "@/components/guidance/GuidancePanel";
import { resolveGuidanceActor } from "@/lib/guidance/request-actor";
import { loadGuidanceView } from "@/lib/guidance/view";
import { createServiceClient } from "@/lib/supabase/server";

// Guidance for a coach client, set up by their coach (gym_clients, since
// 0069). Same panel as the family pages; the "coach" surface makes every
// lookup go to gym_clients and records the consent channel as 'coach'.
export default async function ClientGuidancePage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const request = await resolveGuidanceActor("coach");
  if (!request) redirect("/login?product=coach");

  const clientHref = `/gym/dashboard/clients/${clientId}`;
  const view = await loadGuidanceView(createServiceClient(), { contactId: clientId, ...request });
  if (view.kind === "not_found") notFound();
  if (view.kind === "feature_off") redirect(clientHref);

  return (
    <GuidancePanel
      key={view.kind}
      view={view}
      backHref={clientHref}
      onPropose={proposeGuidanceAction.bind(null, "coach", clientId)}
      onConfirm={confirmGuidanceAction.bind(null, "coach", clientId)}
      onReturnToTracking={returnToTrackingAction.bind(null, "coach", clientId)}
    />
  );
}

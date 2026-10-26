import { notFound, redirect } from "next/navigation";

import { confirmGuidanceAction, proposeGuidanceAction, returnToTrackingAction } from "@/app/actions/guidance";
import { GuidancePanel } from "@/components/guidance/GuidancePanel";
import { resolveGuidanceActor } from "@/lib/guidance/request-actor";
import { loadGuidanceView } from "@/lib/guidance/view";
import { createServiceClient } from "@/lib/supabase/server";

// Guidance for a contact on the account holder's dashboard. For their own
// 'self' contact this is the setup flow and their targets; for a family
// member it is the refusal, plus Return to Tracking if that person turned
// Guidance on — see lib/guidance/view.ts for which is which.
export default async function ContactGuidancePage({ params }: { params: Promise<{ contactId: string }> }) {
  const { contactId } = await params;
  const actor = await resolveGuidanceActor("account");
  if (!actor) redirect("/adults/login");

  const contactHref = `/adults/dashboard/contacts/${contactId}`;
  const view = await loadGuidanceView(createServiceClient(), { contactId, actor });
  if (view.kind === "not_found") notFound();
  if (view.kind === "feature_off") redirect(contactHref);

  return (
    <GuidancePanel
      // A different branch is a different screen: remount rather than carry
      // a half-finished setup form into the targets view after confirming.
      key={view.kind}
      view={view}
      backHref={contactHref}
      onPropose={proposeGuidanceAction.bind(null, "account", contactId)}
      onConfirm={confirmGuidanceAction.bind(null, "account", contactId)}
      onReturnToTracking={returnToTrackingAction.bind(null, "account", contactId)}
    />
  );
}

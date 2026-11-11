"use client";

import { useRouter } from "next/navigation";
import type { ClientDetails } from "@/app/(gym)/gym/dashboard/actions";
import { BiomarkerSection } from "./BiomarkerSection";
import { EditClientModal } from "./EditClientModal";
import { getOrCreateCoachClientInvite, regenerateCoachClientInvite, revokeCoachClientInvite, markCoachClientInviteLinkOpened } from "@/app/(gym)/gym/dashboard/actions";
import { ProfileDashboard } from "@/components/dashboard/ProfileDashboard";
import { adaptClientDetails } from "@/lib/dashboard/profile-dashboard-types";
import { COACH_THEME, COACH_COPY } from "@/lib/dashboard/profile-dashboard-presets";
import type { GuidanceActions } from "@/lib/guidance/bound-actions";
import type { GuidanceDashboard } from "@/lib/guidance/view";

/** Coach's view of one tracked client — a thin, role-specific wrapper
 * around the shared ProfileDashboard (see that file for the actual section
 * rendering, which used to be duplicated near-verbatim here and in
 * ContactDashboard.tsx). Only the theme/copy/invite-wiring/edit-modal and
 * the gym-only biomarkers section are product-specific. */
export function ClientDashboard({
  client,
  meals,
  workouts,
  biomarkers,
  guidance,
  guidanceActions,
  guidanceSwitch,
  guidanceCanTurnOff,
  guidanceHref,
  guidanceSetup,
}: ClientDetails & {
  /** Nutrition Guidance, when it's in effect — see ProfileDashboard. */
  guidance?: GuidanceDashboard | null;
  guidanceActions?: GuidanceActions;
  guidanceSwitch?: { setupHref: string; personName?: string };
  guidanceCanTurnOff?: boolean;
  guidanceHref?: string;
  guidanceSetup?: { href: string; personName: string };
}) {
  const router = useRouter();

  return (
    <ProfileDashboard
      role="coach"
      data={adaptClientDetails({ client, meals, workouts, biomarkers })}
      guidance={guidance}
      guidanceActions={guidanceActions}
      guidanceSwitch={guidanceSwitch}
      guidanceCanTurnOff={guidanceCanTurnOff}
      guidanceHref={guidanceHref}
      guidanceSetup={guidanceSetup}
      backHref="/gym/dashboard"
      theme={COACH_THEME}
      copy={COACH_COPY}
      invite={{
        load: () => getOrCreateCoachClientInvite(client.id),
        regenerate: () => regenerateCoachClientInvite(client.id),
        revoke: () => revokeCoachClientInvite(client.id),
        onLinkOpened: () => markCoachClientInviteLinkOpened(client.id),
      }}
      renderEditModal={({ onClose, onSaved }) => (
        <EditClientModal
          client={client}
          onClose={onClose}
          onSaved={() => {
            onSaved();
            router.refresh();
          }}
        />
      )}
      extraSections={
        <BiomarkerSection
          clientId={client.id}
          heightCm={client.heightCm}
          trackedBiomarkers={client.trackedBiomarkers}
          biomarkers={biomarkers}
        />
      }
    />
  );
}

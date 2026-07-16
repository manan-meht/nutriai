"use client";

import { useRouter } from "next/navigation";
import type { AdultsContactDetails } from "@/app/(adults)/adults/dashboard/actions";
import { EditContactModal } from "@/components/adults/dashboard/EditContactModal";
import { ProfileDashboard } from "@/components/dashboard/ProfileDashboard";
import { adaptAdultsContactDetails } from "@/lib/dashboard/profile-dashboard-types";
import { FAMILY_ADMIN_THEME, FAMILY_ADMIN_COPY } from "@/lib/dashboard/profile-dashboard-presets";

/** Plain fetch instead of a Server Action — Server Actions on this
 * deployment (Cloudflare Pages via @cloudflare/next-on-pages) intermittently
 * fail with "Server Action ... was not found on the server" because
 * different edge instances serving the same deployment can disagree on the
 * action's encryption key/manifest. A regular HTTP route sidesteps that
 * mechanism entirely. */
async function fetchInviteJson(url: string, init?: RequestInit): Promise<any> {
  try {
    const res = await fetch(url, init);
    const json = await res.json().catch(() => null);
    if (!json) return { error: "Couldn't reach the server. Please try again." };
    return json;
  } catch {
    return { error: "Couldn't reach the server. Please try again." };
  }
}

/** Family caregiver's view of one tracked contact — a thin, role-specific
 * wrapper around the shared ProfileDashboard (see that file for the actual
 * section rendering, which used to be duplicated near-verbatim here and in
 * ClientDashboard.tsx). Only the theme/copy/invite-wiring/edit-modal are
 * product-specific; everything else (insights, metrics, macro summary,
 * activity heatmap, recent meals, date-range selector) is shared. */
export function ContactDashboard({ contact, meals }: AdultsContactDetails) {
  const router = useRouter();

  return (
    <ProfileDashboard
      role="family_admin"
      data={adaptAdultsContactDetails({ contact, meals })}
      backHref="/adults/dashboard"
      theme={FAMILY_ADMIN_THEME}
      copy={FAMILY_ADMIN_COPY}
      invite={{
        load: () => fetchInviteJson(`/api/adults/contacts/${contact.id}?resource=invite`),
        regenerate: () => fetchInviteJson(`/api/adults/contacts/${contact.id}?resource=invite`, { method: "PATCH" }),
        revoke: () => fetchInviteJson(`/api/adults/contacts/${contact.id}?resource=invite`, { method: "DELETE" }),
        onLinkOpened: () => fetchInviteJson(`/api/adults/contacts/${contact.id}?resource=invite`, { method: "POST" }),
      }}
      renderEditModal={({ onClose, onSaved }) => (
        <EditContactModal
          contact={contact}
          onClose={onClose}
          onSaved={() => {
            onSaved();
            router.refresh();
          }}
        />
      )}
    />
  );
}

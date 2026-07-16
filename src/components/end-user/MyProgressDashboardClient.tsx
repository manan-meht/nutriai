"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { EndUserDashboard } from "@/lib/end-user/dashboard-service";
import type { TrustedDevice } from "@/lib/end-user/session";
import {
  pauseSharingAction,
  requestRemovalAction,
  signOutEndUserAction,
  listTrustedDevicesAction,
  signOutDeviceAction,
  signOutAllDevicesAction,
} from "@/app/(public)/my-progress/actions";
import { ProfileDashboard } from "@/components/dashboard/ProfileDashboard";
import { permissionsForRole } from "@/lib/dashboard/permissions";
import { PARTICIPANT_THEME, PARTICIPANT_COPY } from "@/lib/dashboard/profile-dashboard-presets";

// Participant's own view of their tracked profile — the dashboard content
// itself (insights, key metrics, macro summary, activity heatmap, recent
// meals) is the shared ProfileDashboard, same as the family_admin/coach
// views; this component wraps it with the account-management features
// unique to the tracked person themselves (pause sharing, request removal,
// trusted devices, sign out) that neither caregiver/coach role has.
export function MyProgressDashboardClient({ dashboard }: { dashboard: EndUserDashboard }) {
  const router = useRouter();
  const [paused, setPaused] = useState(dashboard.isPaused);
  const [removalRequested, setRemovalRequested] = useState(false);
  const [devices, setDevices] = useState<TrustedDevice[] | null>(null);
  const [showDevices, setShowDevices] = useState(false);

  async function loadDevices() {
    setShowDevices(true);
    setDevices(await listTrustedDevicesAction());
  }

  async function handleSignOutDevice(sessionId: string) {
    await signOutDeviceAction(sessionId);
    setDevices(await listTrustedDevicesAction());
  }

  async function handleSignOutAllDevices() {
    if (!confirm("Sign out of all devices? You'll need a new WhatsApp code to log back in anywhere.")) return;
    await signOutAllDevicesAction();
    router.push("/my-progress");
  }

  async function handleTogglePause() {
    const next = !paused;
    setPaused(next);
    await pauseSharingAction(next);
  }

  async function handleRequestRemoval() {
    if (!confirm("Ask to be removed as a contact? The person who added you will need to confirm this.")) return;
    await requestRemovalAction();
    setRemovalRequested(true);
  }

  async function handleSignOut() {
    await signOutEndUserAction();
    router.push("/my-progress");
  }

  return (
    <div className="min-h-screen bg-[var(--color-dashboard-surface)]">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-4 flex justify-end">
        <button onClick={handleSignOut} className="text-sm text-gray-400 underline">
          Sign out
        </button>
      </div>

      <ProfileDashboard
        role="participant"
        // No self-service profile-edit UI exists yet for the end-user OTP
        // session (unlike EditContactModal/EditClientModal for
        // caregivers/coaches) — override canManageGoal off until that's
        // built, rather than showing an Edit button that does nothing.
        permissions={{ ...permissionsForRole("participant"), canManageGoal: false }}
        data={dashboard.data}
        theme={PARTICIPANT_THEME}
        copy={PARTICIPANT_COPY}
      />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 pb-8 space-y-6">
        <section className="bg-white rounded-xl p-5 shadow-sm">
          <p className="text-sm font-medium text-neutral-900 mb-2">Who has access</p>
          {dashboard.accessList.length === 0 ? (
            <p className="text-sm text-neutral-400">No one else currently has access.</p>
          ) : (
            <ul className="text-sm text-neutral-600 space-y-1">
              {dashboard.accessList.map((entry, i) => (
                <li key={i}>{entry.label}</li>
              ))}
            </ul>
          )}
        </section>

        <section className="bg-white rounded-xl p-5 shadow-sm space-y-3">
          <button
            onClick={handleTogglePause}
            className="w-full rounded-lg border border-neutral-300 py-2.5 text-sm font-medium text-neutral-700"
          >
            {paused ? "Resume sharing" : "Pause sharing"}
          </button>
          <p className="text-xs text-neutral-400">
            {paused
              ? "New meals you log won't be shared until you resume."
              : "Pausing keeps your WhatsApp logging working — it just stops sharing new meals with the person above."}
          </p>
          <button
            onClick={handleRequestRemoval}
            disabled={removalRequested}
            className="w-full text-sm text-neutral-400 underline disabled:no-underline"
          >
            {removalRequested ? "Removal requested" : "Request to be removed"}
          </button>
        </section>

        <section className="bg-white rounded-xl p-5 shadow-sm">
          <p className="text-sm font-medium text-neutral-900 mb-1">Trusted devices</p>
          <p className="text-xs text-neutral-400 mb-3">This device can open your dashboard without a code.</p>
          {!showDevices ? (
            <button onClick={loadDevices} className="text-sm text-neutral-600 underline">
              Show trusted devices
            </button>
          ) : (
            <div className="space-y-3">
              <ul className="space-y-2">
                {(devices ?? []).map((d) => (
                  <li key={d.id} className="flex items-center justify-between text-sm text-neutral-600">
                    <span>
                      {d.deviceLabel ?? "Unnamed device"}
                      {d.isCurrent && <span className="text-neutral-400"> — this device</span>}
                    </span>
                    {!d.isCurrent && (
                      <button onClick={() => handleSignOutDevice(d.id)} className="text-xs text-neutral-400 underline">
                        Sign out
                      </button>
                    )}
                  </li>
                ))}
                {devices?.length === 0 && <li className="text-sm text-neutral-400">No trusted devices found.</li>}
              </ul>
              <button onClick={handleSignOutAllDevices} className="text-sm text-red-500 underline">
                Sign out of all devices
              </button>
            </div>
          )}
        </section>

        <p className="text-xs text-neutral-400 leading-relaxed px-1">
          Tistra Health is a tracking and awareness tool only. It does not provide medical advice, diagnosis,
          treatment, or personalized nutrition therapy. AI-generated summaries may be inaccurate or incomplete. For
          any health, diet, medical condition, medication, or nutrition concern, please consult a qualified
          healthcare professional, doctor, or registered dietitian.
        </p>
      </div>
    </div>
  );
}

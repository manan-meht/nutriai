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
import { classifyMeal, applyHumanCorrection, buildHabitDashboard } from "@nutriai/dashboard-core";
import {
  TrendCardGrid,
  MealTimelineSection,
  WeeklyFocusCard,
  HabitMomentumCard,
  FoodPatternSpectrumCard,
} from "@/components/shared/dashboard/HabitDashboardSections";

export function MyProgressDashboardClient({ dashboard }: { dashboard: EndUserDashboard }) {
  const router = useRouter();
  const [paused, setPaused] = useState(dashboard.isPaused);
  const classifiedMeals = dashboard.mealsForTrends.map((m) =>
    applyHumanCorrection(
      classifyMeal({ id: m.id, loggedAt: m.loggedAt, mealType: m.mealType, foods: m.foods, aiSummary: m.aiSummary }),
      m.humanCorrection
    )
  );
  const habitDashboard = buildHabitDashboard(classifiedMeals);
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
    <main className="min-h-screen bg-[var(--color-dashboard-surface)] px-4 py-8">
      <div className="max-w-md mx-auto space-y-6">
        <header className="flex items-center justify-between">
          <h1 className="text-lg font-semibold text-neutral-900">Hi {dashboard.contactName.split(" ")[0]} 👋</h1>
          <button onClick={handleSignOut} className="text-sm text-neutral-400 underline">
            Sign out
          </button>
        </header>

        <TrendCardGrid
          cards={[habitDashboard.proteinTrend, habitDashboard.balancedPlateTrend, habitDashboard.healthierDirectionTrend]}
        />

        <MealTimelineSection meals={classifiedMeals} />

        <WeeklyFocusCard focus={habitDashboard.weeklyFocus} />

        <div className="grid grid-cols-1 gap-4">
          <HabitMomentumCard momentum={habitDashboard.habitMomentum} />
          <FoodPatternSpectrumCard spectrum={habitDashboard.patternSpectrum} />
        </div>

        <section className="bg-white rounded-xl p-5 shadow-sm">
          <p className="text-sm font-medium text-neutral-900 mb-3">Recent meals</p>
          {dashboard.recentMeals.length === 0 && (
            <p className="text-sm text-neutral-400">No meals logged yet this week — just send a photo on WhatsApp anytime.</p>
          )}
          <ul className="space-y-3">
            {dashboard.recentMeals.map((meal) => (
              <li key={meal.id} className="flex items-start gap-3 text-sm text-neutral-700 border-b border-neutral-100 pb-2 last:border-0">
                {meal.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element -- external Supabase Storage URL, not a local asset
                  <img
                    src={meal.imageUrl}
                    alt={`${meal.mealType ?? "Meal"} photo`}
                    className="w-12 h-12 rounded-lg object-cover flex-shrink-0"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <span className="font-medium capitalize">{meal.mealType ?? "Meal"}</span>{" "}
                  <span className="text-neutral-400">
                    {new Date(meal.loggedAt).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}
                  </span>
                  <div className="text-neutral-500">
                    {meal.foods.map((f) => f.name).join(", ") || "—"}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>

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
    </main>
  );
}

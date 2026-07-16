"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { EntitlementSnapshot, EntitlementModule } from "@/lib/entitlements/entitlements";
import { devSetEntitlementState, type EntitlementPreset } from "@/app/actions/dev-billing";

const PRESETS: { preset: EntitlementPreset; label: string }[] = [
  { preset: "not_started", label: "Not started (no trial yet)" },
  { preset: "trialing_fresh", label: "Trial active — 14 days left" },
  { preset: "trialing_ending_soon", label: "Trial active — 1 day left" },
  { preset: "trialing_expired", label: "Trial expired (read-only)" },
  { preset: "active_monthly", label: "Active subscription — monthly" },
  { preset: "active_annual", label: "Active subscription — annual" },
  { preset: "past_due", label: "Past due (payment failed)" },
  { preset: "cancel_at_period_end", label: "Cancelling at period end" },
  { preset: "cancelled", label: "Cancelled (read-only)" },
];

function ModulePanel({ module, title, entitlement }: { module: EntitlementModule; title: string; entitlement: EntitlementSnapshot }) {
  const router = useRouter();
  const [pending, setPending] = useState<EntitlementPreset | null>(null);

  async function apply(preset: EntitlementPreset) {
    setPending(preset);
    try {
      await devSetEntitlementState(module, preset);
      router.refresh();
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-6">
      <h2 className="text-lg font-bold text-gray-900 mb-1">{title}</h2>
      <p className="text-xs text-gray-400 mb-4">
        Current: <span className="font-mono">{entitlement.status}</span>
        {entitlement.trialDaysRemaining !== null && ` · ${entitlement.trialDaysRemaining}d trial remaining`}
        {entitlement.isReadOnly && " · READ-ONLY"}
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {PRESETS.map(({ preset, label }) => (
          <button
            key={preset}
            onClick={() => apply(preset)}
            disabled={pending !== null}
            className="text-left text-sm rounded-xl border border-gray-200 px-3 py-2 hover:border-gray-400 disabled:opacity-50 transition-colors"
          >
            {pending === preset ? "Setting…" : label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function DevBillingClient({
  familyEntitlement, coachingEntitlement,
}: {
  familyEntitlement: EntitlementSnapshot;
  coachingEntitlement: EntitlementSnapshot;
}) {
  return (
    <div className="min-h-screen bg-gray-50 py-12 px-6">
      <div className="max-w-3xl mx-auto flex flex-col gap-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900 mb-1">Dev billing state harness</h1>
          <p className="text-sm text-gray-500">
            Dev/staging only — sets your own account&apos;s entitlement rows directly, bypassing any real payment
            provider. Not reachable in production.
          </p>
        </div>
        <ModulePanel module="adults" title="Family" entitlement={familyEntitlement} />
        <ModulePanel module="gym" title="Coaching" entitlement={coachingEntitlement} />
      </div>
    </div>
  );
}

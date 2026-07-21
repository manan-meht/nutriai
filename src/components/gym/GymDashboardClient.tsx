"use client";

import React, { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import type { GymClient } from "@/app/(gym)/gym/dashboard/actions";
import { removeClient } from "@/app/(gym)/gym/dashboard/actions";
import { createCheckoutSession } from "@/app/actions/checkout";
import { ClientCard } from "./ClientCard";
import { AddClientModal } from "./AddClientModal";
import { useRouter } from "next/navigation";
import { effectiveGymLimit, gymLimitReachedMessage } from "@/lib/limits";
import type { EntitlementSnapshot } from "@/lib/entitlements/entitlements";
import { GYM_LIMIT_ENFORCEMENT_ENABLED, BILLING_AVAILABLE } from "@/lib/billing/feature-flags";
import { FeedbackModal } from "@/components/feedback/FeedbackModal";
import { FeedbackIcon } from "@/components/feedback/FeedbackIcon";
import { BetaBillingBanner } from "@/components/billing/BetaBillingBanner";

interface GymDashboardClientProps {
  coachName: string;
  coachEmail: string;
  workspaceId: string;
  clients: GymClient[];
  removedClients: GymClient[];
  extraCapacity: number;
  entitlement: EntitlementSnapshot;
  pricing: { monthlyLabel: string; annualLabel: string };
  /** True for a brand-new workspace (no trial started yet, created after
   * this flow shipped) that must add a card via checkout before its first
   * trial starts — see requiresCardBeforeFirstTrial. Existing workspaces
   * already on the card-free trial are unaffected. */
  requiresCardBeforeTrial?: boolean;
}

export function GymDashboardClient({ coachName, coachEmail, workspaceId, clients, removedClients, extraCapacity, entitlement, pricing, requiresCardBeforeTrial }: GymDashboardClientProps) {
  const [showModal, setShowModal] = useState(false);
  const [showPrevious, setShowPrevious] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [startingCheckout, setStartingCheckout] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const feedbackLinkRef = React.useRef<HTMLButtonElement>(null);
  const router = useRouter();

  function handleAdded() {
    router.refresh();
  }

  // "Add client" opens the modal directly for everyone except a brand-new
  // workspace that must add a card first — those get redirected to Stripe
  // Checkout (a 14-day trial attached, first charge deferred to trial end)
  // instead of opening the form. See AdultsDashboardClient's identical
  // handleAddClick for the full rationale.
  async function handleAddClick() {
    if (!requiresCardBeforeTrial) {
      setShowModal(true);
      return;
    }
    setCheckoutError(null);
    setStartingCheckout(true);
    try {
      const result = await createCheckoutSession("gym", "monthly");
      window.location.href = result.url;
    } catch (err) {
      setCheckoutError(err instanceof Error ? err.message : "Couldn't start checkout. Please try again.");
      setStartingCheckout(false);
    }
  }

  async function handleRemove(client: GymClient) {
    if (!window.confirm(
      `Remove ${client.fullName}? Their data will be preserved, but this frees up an active slot only — you can't add a replacement until next calendar month (removing doesn't refund this month's add quota).`
    )) return;
    setRemovingId(client.id);
    try {
      await removeClient(client.id);
      router.refresh();
    } finally {
      setRemovingId(null);
    }
  }

  const activeCount = clients.length;
  const goalsSet = clients.filter((c) => c.goals.some((g) => g.status === "active")).length;
  const invitedCount = clients.filter((c) => c.inviteSentAt).length;
  const clientLimit = effectiveGymLimit(extraCapacity);
  const countLimitReached = GYM_LIMIT_ENFORCEMENT_ENABLED && activeCount >= clientLimit;
  const canAdd = !countLimitReached && !entitlement.isReadOnly;
  const isSubscriber = entitlement.status === "active" || entitlement.status === "past_due" || entitlement.status === "cancel_at_period_end";

  return (
    <div className="min-h-screen bg-gray-50">

      {/* Nav */}
      <header className="bg-white border-b border-gray-100 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center overflow-hidden">
              <Image src="/logos/logo-purple.png" alt="" width={32} height={32} className="w-full h-full object-contain" />
            </div>
            <span className="font-bold text-gray-900">Tistra Health</span>
          </Link>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-500 hidden sm:block">{coachEmail}</span>
            <Link href="/billing?module=gym" className="text-sm text-gray-500 hover:text-gray-800 font-medium">
              Billing
            </Link>
            <button
              ref={feedbackLinkRef}
              type="button"
              onClick={() => setShowFeedback(true)}
              className="text-sm text-gray-500 hover:text-gray-800 font-medium flex items-center gap-1.5"
            >
              <FeedbackIcon className="w-4 h-4" />
              <span className="hidden sm:inline">Send Feedback</span>
            </button>
            <form action="/auth/signout" method="post">
              <button type="submit" className="text-sm text-gray-500 hover:text-gray-800 font-medium">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-10">

        {/* Page header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 mb-1">
              {coachName ? `Welcome, ${coachName.split(" ")[0]}` : "Your dashboard"}
            </h1>
            <p className="text-gray-500 text-sm">
              {activeCount === 0
                ? "Add your first client to get started."
                : `${activeCount} client${activeCount !== 1 ? "s" : ""}`}
            </p>
          </div>
          {canAdd && (
            <button
              onClick={handleAddClick}
              disabled={startingCheckout}
              className="bg-purple-600 text-white font-semibold rounded-full px-5 py-2.5 text-sm hover:bg-purple-700 transition-colors shadow-sm flex items-center gap-2 disabled:opacity-50"
            >
              <span className="text-lg leading-none">+</span> {startingCheckout ? "Redirecting…" : "Add client"}
            </button>
          )}
        </div>

        {!BILLING_AVAILABLE ? (
          <>
            <BetaBillingBanner sourcePage="gym_dashboard" className="mb-8" />
            {countLimitReached && (
              <div className="mb-8 rounded-xl bg-purple-50 border border-purple-100 px-4 py-3 text-sm text-purple-800">
                {gymLimitReachedMessage(clientLimit)} <Link href="/pricing" className="underline font-medium">View plans</Link> to add more.
              </div>
            )}
          </>
        ) : (
          <>
            {entitlement.isReadOnly && (
              <div className="mb-8 rounded-xl bg-amber-50 border border-amber-100 px-4 py-3 text-sm text-amber-800">
                Your free trial has ended. Your existing clients and data are preserved and visible, but you can&apos;t invite
                new clients or generate new AI analyses until you <Link href="/billing?module=gym" className="underline font-medium">subscribe</Link>.
              </div>
            )}

            {!entitlement.isReadOnly && entitlement.status === "trialing" && entitlement.trialDaysRemaining !== null && (
              <div className="mb-8 rounded-xl bg-purple-50 border border-purple-100 px-4 py-3 text-sm text-purple-800">
                Free trial — {entitlement.trialDaysRemaining} day{entitlement.trialDaysRemaining === 1 ? "" : "s"} remaining.{" "}
                <Link href="/billing?module=gym" className="underline font-medium">Subscribe</Link>
              </div>
            )}

            {!entitlement.isReadOnly && countLimitReached && (
              <div className="mb-8 rounded-xl bg-purple-50 border border-purple-100 px-4 py-3 text-sm text-purple-800">
                {gymLimitReachedMessage(clientLimit)} <Link href="/billing?module=gym" className="underline font-medium">Upgrade your plan</Link> to add more.
              </div>
            )}

            {isSubscriber ? (
              <div className="mb-8 rounded-xl bg-gray-50 border border-gray-100 px-4 py-3 text-sm text-gray-600 flex flex-wrap items-center justify-between gap-2">
                <span>Your plan includes up to {clientLimit} clients.</span>
                <Link href="/billing?module=gym" className="font-medium text-purple-700 underline">
                  Need more than {clientLimit} clients? Add capacity →
                </Link>
              </div>
            ) : (
              <div className="mb-8 rounded-xl bg-gray-50 border border-gray-100 px-4 py-3 text-sm text-gray-600">
                Your first {clientLimit} clients are free for your first 14 days. After that, Coaching is{" "}
                <span className="font-semibold text-gray-800">{pricing.monthlyLabel}/month</span> or{" "}
                <span className="font-semibold text-gray-800">{pricing.annualLabel}/year</span>.{" "}
                <Link href="/billing?module=gym" className="underline font-medium text-purple-700">See plans</Link>
              </div>
            )}
          </>
        )}

        {/* Stats */}
        {activeCount > 0 && (
          <div className="grid grid-cols-3 gap-4 mb-8">
            <StatCard label="Total clients" value={activeCount} />
            <StatCard label="Goals set" value={goalsSet} />
            <StatCard label="Invited" value={invitedCount} />
          </div>
        )}

        {/* Empty state */}
        {activeCount === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="relative w-full max-w-[280px] aspect-square mb-8">
              <div className="absolute inset-0 bg-purple-100/60 rounded-full blur-3xl opacity-60" />
              <div className="relative w-full h-full rounded-full overflow-hidden border border-gray-100 bg-white shadow-[0_20px_40px_-12px_rgba(81,95,116,0.15)]">
                <Image
                  src="/gym-empty-state-coach.png"
                  alt=""
                  fill
                  className="object-cover"
                  sizes="280px"
                />
              </div>
              <div className="absolute -top-2 -right-2 w-14 h-14 bg-purple-100 rounded-full flex items-center justify-center text-2xl shadow-sm border border-white">
                🏋️
              </div>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-3 tracking-tight">Onboard your first client</h2>
            <p className="text-gray-500 text-base max-w-sm mb-8 leading-relaxed">
              Add a client and send them a WhatsApp invite. They just need to reply with their first meal, and you&apos;ll track their progress here.
            </p>
            {canAdd && (
              <button
                onClick={handleAddClick}
                disabled={startingCheckout}
                className="bg-purple-600 text-white font-semibold rounded-full px-8 py-4 text-sm hover:bg-purple-700 transition-colors shadow-lg shadow-purple-100 disabled:opacity-50"
              >
                {startingCheckout ? "Redirecting…" : "Add your first client"}
              </button>
            )}
            {canAdd && requiresCardBeforeTrial && !startingCheckout && (
              <p className="text-xs text-gray-400 mt-3 max-w-xs">
                Add a payment method to start your free 14-day trial — you won&apos;t be charged until it ends, and you can cancel anytime before then.
              </p>
            )}
            {checkoutError && (
              <p className="text-sm text-red-600 mt-3">{checkoutError}</p>
            )}
            <div className="mt-10 flex gap-8 items-center justify-center text-gray-400">
              <span className="text-xs font-medium uppercase tracking-widest">Private &amp; secure</span>
              <span className="text-xs font-medium uppercase tracking-widest">Expert verified</span>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {clients.map((client) => (
              <ClientCard
                key={client.id}
                client={client}
                onOpen={() => router.push(`/gym/dashboard/clients/${client.id}`)}
                onRemove={removingId === client.id ? undefined : () => handleRemove(client)}
              />
            ))}
          </div>
        )}

        {removedClients.length > 0 && (
          <div className="mt-10">
            <button
              onClick={() => setShowPrevious((v) => !v)}
              className="text-sm font-medium text-gray-500 hover:text-gray-800 mb-4"
            >
              {showPrevious ? "Hide" : "Show"} previous clients ({removedClients.length})
            </button>
            {showPrevious && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 opacity-70">
                {removedClients.map((client) => (
                  <div key={client.id} className="relative">
                    <ClientCard client={client} onOpen={() => router.push(`/gym/dashboard/clients/${client.id}`)} />
                    <span className="absolute top-3 right-3 text-xs font-medium px-2 py-1 rounded-full bg-gray-800 text-white">
                      Removed
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {showModal && (
        <AddClientModal
          workspaceId={workspaceId}
          coachName={coachName || coachEmail}
          onClose={() => setShowModal(false)}
          onAdded={handleAdded}
        />
      )}

      {showFeedback && (
        <FeedbackModal
          product="gym"
          prefillEmail={coachEmail}
          onClose={() => setShowFeedback(false)}
          returnFocusRef={feedbackLinkRef}
        />
      )}

    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 px-5 py-4">
      <p className="text-2xl font-bold text-gray-900 mb-1">{value}</p>
      <p className="text-xs text-gray-500">{label}</p>
    </div>
  );
}

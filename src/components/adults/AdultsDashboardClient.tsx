"use client";

import React, { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { AdultsContact } from "@/app/(adults)/adults/dashboard/actions";
import { removeContact, getOrCreateFamilyInvite, regenerateFamilyInvite, revokeFamilyInvite, markFamilyInviteLinkOpened } from "@/app/(adults)/adults/dashboard/actions";
import { createCheckoutSession } from "@/app/actions/checkout";
import { AddContactModal } from "./AddContactModal";
import { SelfSetupCard } from "./SelfSetupCard";
import { InviteCard } from "@/components/shared/invites/InviteCard";
import { effectiveFamilyLimit, familyLimitReachedMessage } from "@/lib/limits";
import type { EntitlementSnapshot } from "@/lib/entitlements/entitlements";
import { FAMILY_LIMIT_ENFORCEMENT_ENABLED, BILLING_AVAILABLE } from "@/lib/billing/feature-flags";
import { FeedbackModal } from "@/components/feedback/FeedbackModal";
import { FeedbackIcon } from "@/components/feedback/FeedbackIcon";
import { BetaBillingBanner } from "@/components/billing/BetaBillingBanner";
import { NUTRITION_GOAL_LABELS } from "@/lib/food-balance/goal-options";

interface Props {
  caregiverName: string;
  caregiverEmail: string;
  workspaceId: string;
  contacts: AdultsContact[];
  removedContacts: AdultsContact[];
  extraCapacity: number;
  entitlement: EntitlementSnapshot;
  promptSelfSetup?: boolean;
  isSelfPlan?: boolean;
  pricing: { monthlyLabel: string; annualLabel: string };
  selfPricing: { monthlyLabel: string; annualLabel: string };
  /** Digits-only WhatsApp number for the Tistra Health bot (TISTRA_WHATSAPP_NUMBER),
   * embedded as a wa.me link in the invite message so the invitee can tap
   * straight into a chat with the bot. Undefined if not configured. */
  tistraWhatsAppNumber?: string;
  /** True for a brand-new workspace (no trial started yet, created after
   * this flow shipped) that must add a card via checkout before its first
   * trial starts — see requiresCardBeforeFirstTrial. Existing workspaces
   * already on the card-free trial are unaffected. */
  requiresCardBeforeTrial?: boolean;
}

const RELATIONSHIP_EMOJI: Record<string, string> = {
  son: "👨", daughter: "👩", spouse: "💑", parent: "👴", sibling: "🤝", friend: "😊", other: "🧑",
};

export function AdultsDashboardClient({ caregiverName, caregiverEmail, workspaceId, contacts, removedContacts, extraCapacity, entitlement, promptSelfSetup, isSelfPlan, pricing, selfPricing, tistraWhatsAppNumber, requiresCardBeforeTrial }: Props) {
  const [showModal, setShowModal] = useState(false);
  const [startingCheckout, setStartingCheckout] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [dismissedSelfSetup, setDismissedSelfSetup] = useState(false);
  const [showSelfSetup, setShowSelfSetup] = useState(false);
  const [showPrevious, setShowPrevious] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const feedbackLinkRef = React.useRef<HTMLButtonElement>(null);
  const router = useRouter();

  // "Add family member"/"Add person" open the modal directly for everyone
  // except a brand-new workspace that must add a card first — those get
  // redirected to Stripe Checkout (a 14-day trial attached, first charge
  // deferred to trial end, see createCheckoutSession) instead of opening
  // the form. The modal only ever appears once checkout succeeds and the
  // page reloads with an actual "trialing" entitlement.
  async function handleAddClick() {
    if (!requiresCardBeforeTrial) {
      setShowModal(true);
      return;
    }
    setCheckoutError(null);
    setStartingCheckout(true);
    try {
      const result = await createCheckoutSession("adults", "monthly");
      window.location.href = result.url;
    } catch (err) {
      setCheckoutError(err instanceof Error ? err.message : "Couldn't start checkout. Please try again.");
      setStartingCheckout(false);
    }
  }

  async function handleRemove(contact: AdultsContact) {
    if (!window.confirm(
      `Remove ${contact.fullName}? Their data will be preserved, but this frees up an active slot only — you can't add a replacement until next calendar month (removing doesn't refund this month's add quota).`
    )) return;
    setRemovingId(contact.id);
    try {
      await removeContact(contact.id);
      router.refresh();
    } finally {
      setRemovingId(null);
    }
  }

  const activeCount = contacts.length;
  const sendingData = contacts.filter((c) => c.mealCount > 0).length;
  const familyLimit = effectiveFamilyLimit(extraCapacity);
  const countLimitReached = FAMILY_LIMIT_ENFORCEMENT_ENABLED && activeCount >= familyLimit;
  const canAdd = !countLimitReached && !entitlement.isReadOnly;
  const isSubscriber = entitlement.status === "active" || entitlement.status === "past_due" || entitlement.status === "cancel_at_period_end";

  // profiles.full_name sometimes ends up populated from the raw email local
  // part (e.g. a "+tag" test address like "mandarth.manan+nutriai-adults")
  // rather than a real display name — never greet with something that looks
  // like it was derived from an email address.
  const looksLikeEmailFragment = /[@+]/.test(caregiverName);
  const hasSelfContact = contacts.some((c) => c.relationshipType === "self");
  const selfContactName = contacts.find((c) => c.relationshipType === "self")?.fullName;
  const displayName = selfContactName || (!looksLikeEmailFragment ? caregiverName : "");

  return (
    <div className="min-h-screen bg-[var(--color-dashboard-surface)]">
      {/* Nav */}
      <header className="bg-white border-b border-gray-100 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center overflow-hidden">
              <Image src="/logos/logo-purple.png" alt="" width={32} height={32} className="w-full h-full object-contain" />
            </div>
            <span className="font-bold text-gray-900">Tistra Health</span>
          </Link>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-500 hidden sm:block">{caregiverEmail}</span>
            <Link href="/billing?module=adults" className="text-sm text-gray-500 hover:text-gray-800 font-medium">
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
              <button type="submit" className="text-sm text-gray-500 hover:text-gray-800 font-medium">Sign out</button>
            </form>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10">
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 mb-1">
              {displayName ? `Hi, ${displayName.split(" ")[0]} 👋` : isSelfPlan ? "Your health" : "Your family"}
            </h1>
            <p className="text-gray-500 text-sm">
              {activeCount === 0
                ? isSelfPlan
                  ? "Add your details to get started."
                  : "Add someone to get started."
                : isSelfPlan
                  ? "Keeping an eye on your nutrition"
                  : `Keeping an eye on ${activeCount} person${activeCount !== 1 ? "s" : ""}`}
            </p>
          </div>
          {isSelfPlan
            ? !hasSelfContact && (
                <button
                  onClick={() => setShowSelfSetup(true)}
                  className="bg-[var(--color-dashboard-primary)] text-white font-semibold rounded-full px-5 py-2.5 text-sm hover:bg-[var(--color-dashboard-primary-hover)] transition-colors shadow-sm flex items-center gap-2"
                >
                  <span className="text-lg leading-none">+</span> Add your details
                </button>
              )
            : canAdd && (
                <button
                  onClick={handleAddClick}
                  disabled={startingCheckout}
                  className="bg-[var(--color-dashboard-primary)] text-white font-semibold rounded-full px-5 py-2.5 text-sm hover:bg-[var(--color-dashboard-primary-hover)] transition-colors shadow-sm flex items-center gap-2 disabled:opacity-50"
                >
                  <span className="text-lg leading-none">+</span> {startingCheckout ? "Redirecting…" : "Add person"}
                </button>
              )}
        </div>

        {(promptSelfSetup || showSelfSetup) && !dismissedSelfSetup && (
          <SelfSetupCard
            workspaceId={workspaceId}
            defaultFullName={displayName}
            onDone={() => { setDismissedSelfSetup(true); router.refresh(); }}
            onSkip={() => setDismissedSelfSetup(true)}
          />
        )}

        {!BILLING_AVAILABLE ? (
          <>
            <BetaBillingBanner sourcePage="adults_dashboard" className="mb-8" />
            {countLimitReached && (
              <div className="mb-8 rounded-xl bg-[var(--color-dashboard-primary-light)] border border-[var(--color-dashboard-primary)]/20 px-4 py-3 text-sm text-[var(--color-dashboard-primary)]">
                {familyLimitReachedMessage(familyLimit)} <Link href="/pricing" className="underline font-medium">View plans</Link> to add more.
              </div>
            )}
          </>
        ) : (
          <>
            {entitlement.isReadOnly && (
              <div className="mb-8 rounded-xl bg-amber-50 border border-amber-100 px-4 py-3 text-sm text-amber-800">
                {isSelfPlan ? (
                  <>Your free trial has ended. Your existing data is preserved and visible, but you can&apos;t generate new AI analyses until you <Link href="/billing?module=adults" className="underline font-medium">subscribe</Link>.</>
                ) : (
                  <>Your free trial has ended. Your existing family members and their data are preserved and visible, but you
                  can&apos;t add new family members or generate new AI analyses until you <Link href="/billing?module=adults" className="underline font-medium">subscribe</Link>.</>
                )}
              </div>
            )}

            {!entitlement.isReadOnly && entitlement.status === "trialing" && entitlement.trialDaysRemaining !== null && (
              <div className="mb-8 rounded-xl bg-[var(--color-dashboard-primary-light)] border border-[var(--color-dashboard-primary)]/20 px-4 py-3 text-sm text-[var(--color-dashboard-primary)]">
                Free trial — {entitlement.trialDaysRemaining} day{entitlement.trialDaysRemaining === 1 ? "" : "s"} remaining.{" "}
                <Link href="/billing?module=adults" className="underline font-medium">Subscribe</Link>
              </div>
            )}

            {!entitlement.isReadOnly && countLimitReached && (
              <div className="mb-8 rounded-xl bg-[var(--color-dashboard-primary-light)] border border-[var(--color-dashboard-primary)]/20 px-4 py-3 text-sm text-[var(--color-dashboard-primary)]">
                {familyLimitReachedMessage(familyLimit)} <Link href="/billing?module=adults" className="underline font-medium">Upgrade your plan</Link> to add more.
              </div>
            )}

            {isSubscriber ? (
              <div className="mb-8 rounded-xl bg-gray-50 border border-gray-100 px-4 py-3 text-sm text-gray-600 flex flex-wrap items-center justify-between gap-2">
                <span>{isSelfPlan ? "Your plan covers your own tracking." : `Your plan includes up to ${familyLimit} family members.`}</span>
                <Link href="/billing?module=adults" className="font-medium text-[var(--color-dashboard-primary)] underline">
                  {isSelfPlan ? "Want to add family too? →" : `Need more than ${familyLimit}? Add capacity →`}
                </Link>
              </div>
            ) : isSelfPlan ? (
              <div className="mb-8 rounded-xl bg-gray-50 border border-gray-100 px-4 py-3 text-sm text-gray-600">
                Your first 14 days are free. After that, tracking is{" "}
                <span className="font-semibold text-gray-800">{selfPricing.monthlyLabel}/month</span> or{" "}
                <span className="font-semibold text-gray-800">{selfPricing.annualLabel}/year</span>.{" "}
                <Link href="/billing?module=adults" className="underline font-medium text-[var(--color-dashboard-primary)]">See plans</Link>
              </div>
            ) : (
              <div className="mb-8 rounded-xl bg-gray-50 border border-gray-100 px-4 py-3 text-sm text-gray-600">
                Your first {familyLimit} family members are free for your first 14 days. After that, Family is{" "}
                <span className="font-semibold text-gray-800">{pricing.monthlyLabel}/month</span> or{" "}
                <span className="font-semibold text-gray-800">{pricing.annualLabel}/year</span>.{" "}
                <Link href="/billing?module=adults" className="underline font-medium text-[var(--color-dashboard-primary)]">See plans</Link>
              </div>
            )}
          </>
        )}

        {activeCount > 0 && (
          <div className="grid grid-cols-2 gap-4 mb-8">
            <StatCard label="People added" value={activeCount} />
            <StatCard label="Sending meals" value={sendingData} />
          </div>
        )}

        {activeCount === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="relative w-full max-w-[280px] aspect-square mb-8">
              <div className="absolute inset-0 bg-[var(--color-dashboard-primary-light)]/40 rounded-full blur-3xl opacity-60" />
              <div className="relative w-full h-full rounded-full overflow-hidden border border-gray-100 bg-white shadow-[0_20px_40px_-12px_rgba(81,95,116,0.15)]">
                <Image
                  src={isSelfPlan ? "/adults-empty-state-self.png" : "/adults-empty-state-family.png"}
                  alt=""
                  fill
                  className="object-cover"
                  sizes="280px"
                />
              </div>
              <div className="absolute -top-2 -right-2 w-14 h-14 bg-[var(--color-dashboard-primary-light)] rounded-full flex items-center justify-center text-2xl shadow-sm border border-white">
                {isSelfPlan ? "🥗" : "💜"}
              </div>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-3 tracking-tight">
              {isSelfPlan ? "Add your details to get started" : "Add someone you care about"}
            </h2>
            <p className="text-gray-500 text-base max-w-sm mb-8 leading-relaxed">
              {isSelfPlan
                ? "Connect on WhatsApp and share a few details — your age, weight, and goals — so we can give you accurate protein and calorie targets instead of generic ones. Then just send meal photos and we'll track everything here."
                : "Invite a parent, grandparent, or anyone you want to help stay healthy. They'll send meal photos on WhatsApp, and you'll track their nutrition here."}
            </p>
            {isSelfPlan ? (
              <button
                onClick={() => setShowSelfSetup(true)}
                className="bg-[var(--color-dashboard-primary)] text-white font-semibold rounded-full px-8 py-4 text-sm hover:bg-[var(--color-dashboard-primary-hover)] transition-colors shadow-lg shadow-[var(--color-dashboard-primary-light)]"
              >
                Add your details
              </button>
            ) : canAdd && (
              <button
                onClick={handleAddClick}
                disabled={startingCheckout}
                className="bg-[var(--color-dashboard-primary)] text-white font-semibold rounded-full px-8 py-4 text-sm hover:bg-[var(--color-dashboard-primary-hover)] transition-colors shadow-lg shadow-[var(--color-dashboard-primary-light)] disabled:opacity-50"
              >
                {startingCheckout ? "Redirecting…" : "Add family member"}
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
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {contacts.map((contact) => (
                <ContactCard
                  key={contact.id}
                  contact={contact}
                  onOpen={() => router.push(`/adults/dashboard/contacts/${contact.id}`)}
                  onRemove={removingId === contact.id ? undefined : () => handleRemove(contact)}
                />
              ))}
            </div>
          </>
        )}

        {removedContacts.length > 0 && (
          <div className="mt-10">
            <button
              onClick={() => setShowPrevious((v) => !v)}
              className="text-sm font-medium text-gray-500 hover:text-gray-800 mb-4"
            >
              {showPrevious ? "Hide" : "Show"} {isSelfPlan ? "previous profile" : "previous family members"} ({removedContacts.length})
            </button>
            {showPrevious && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 opacity-70">
                {removedContacts.map((contact) => (
                  <div key={contact.id} className="relative">
                    <ContactCard contact={contact} onOpen={() => router.push(`/adults/dashboard/contacts/${contact.id}`)} />
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
        <AddContactModal
          workspaceId={workspaceId}
          caregiverName={displayName || caregiverEmail}
          hasSelfContact={hasSelfContact}
          tistraWhatsAppNumber={tistraWhatsAppNumber}
          onClose={() => setShowModal(false)}
          onAdded={() => router.refresh()}
        />
      )}

      {showFeedback && (
        <FeedbackModal
          product="adults"
          prefillEmail={caregiverEmail}
          onClose={() => setShowFeedback(false)}
          returnFocusRef={feedbackLinkRef}
        />
      )}
    </div>
  );
}

interface ContactCardProps {
  contact: AdultsContact;
  onOpen?: () => void;
  onRemove?: () => void;
}

function ContactCard({ contact, onOpen, onRemove }: ContactCardProps) {
  const initials = contact.fullName.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();
  const isActive = contact.mealCount > 0;
  const inviteAccepted = !!contact.inviteAcceptedAt;
  const invitePending = !!contact.inviteSentAt && !inviteAccepted;
  const isSelf = contact.relationshipType === "self";
  const emoji = isSelf ? "🙋" : contact.relationship ? (RELATIONSHIP_EMOJI[contact.relationship] ?? "🧑") : "🧑";
  const displayName = isSelf ? "You" : contact.fullName;

  const lastMealLabel = contact.lastMealAt ? formatRelative(new Date(contact.lastMealAt)) : null;

  return (
    <div
      className="bg-white rounded-2xl border border-gray-100 p-5 hover:border-[var(--color-dashboard-primary)] hover:shadow-md transition-all cursor-pointer text-left"
      role={onOpen ? "button" : undefined}
      tabIndex={onOpen ? 0 : undefined}
      onClick={onOpen}
      onKeyDown={onOpen ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } } : undefined}
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-11 h-11 rounded-full bg-[var(--color-dashboard-primary-light)] flex items-center justify-center flex-shrink-0">
              <span className="text-sm font-bold text-[var(--color-dashboard-primary)]">{initials}</span>
            </div>
            {isActive ? <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-400 border-2 border-white rounded-full" /> : invitePending ? <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-amber-400 border-2 border-white rounded-full" /> : null}
          </div>
          <div>
            <p className="font-semibold text-gray-900 text-sm">{displayName}</p>
            <p className="text-xs text-gray-400">
              {emoji} {isSelf ? "Self-tracking" : contact.relationship ? contact.relationship.charAt(0).toUpperCase() + contact.relationship.slice(1) : "Contact"}
              {contact.age ? `, ${contact.age}y` : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs font-medium px-2 py-1 rounded-full ${
            isActive ? "bg-green-50 text-green-700"
            : inviteAccepted ? "bg-blue-50 text-blue-700"
            : invitePending ? "bg-amber-50 text-amber-700"
            : "bg-gray-100 text-gray-500"
          }`}>
            {isActive ? "Active" : inviteAccepted ? "Accepted" : invitePending ? "Not connected yet" : "Not invited"}
          </span>
          {onRemove && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onRemove(); }}
              className="text-xs text-gray-400 hover:text-red-600 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 rounded"
              aria-label={`Remove ${contact.fullName}`}
            >
              Remove
            </button>
          )}
        </div>
      </div>

      {isActive && (
        <div className="flex items-center gap-2 mb-4 bg-green-50 rounded-xl px-3 py-2">
          <span>🍽️</span>
          <div>
            <p className="text-xs font-medium text-green-800">
              {isSelf
                ? `You logged ${contact.mealCount} meal${contact.mealCount !== 1 ? "s" : ""} this week`
                : `${contact.mealCount} meal${contact.mealCount !== 1 ? "s" : ""} logged`}
            </p>
            {lastMealLabel && <p className="text-xs text-green-600">Last: {lastMealLabel}</p>}
          </div>
        </div>
      )}

      {!isActive && !inviteAccepted && !isSelf && (
        // Real WhatsApp-first invite, shown right in the list — not just a
        // "we sent something" claim (see src/lib/invites). Stops click
        // propagation so its buttons don't trigger the card's onOpen navigation.
        <div className="mb-4" onClick={(e) => e.stopPropagation()}>
          <InviteCard
            title="Ask them to start Tistra on WhatsApp"
            description={`Send ${contact.fullName.split(" ")[0]} this link — they message the bot, and you'll see them connected here right away.`}
            load={() => getOrCreateFamilyInvite(contact.id)}
            regenerate={() => regenerateFamilyInvite(contact.id)}
            revoke={() => revokeFamilyInvite(contact.id)}
            onLinkOpened={() => markFamilyInviteLinkOpened(contact.id)}
          />
        </div>
      )}

      {contact.nutritionGoals && contact.nutritionGoals.length > 0 ? (
        <div className="rounded-xl bg-[var(--color-dashboard-primary-light)] px-3 py-2">
          <p className="text-xs font-semibold text-[var(--color-dashboard-primary)] mb-0.5">
            {contact.nutritionGoals.map((g) => NUTRITION_GOAL_LABELS[g] ?? g).join(", ")}
          </p>
        </div>
      ) : (
        <div className="rounded-xl px-3 py-2 bg-gray-50 text-gray-400 text-xs">No goal set</div>
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

function formatRelative(date: Date): string {
  const diffMins = Math.floor((Date.now() - date.getTime()) / 60000);
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${Math.floor(diffHours / 24)}d ago`;
}

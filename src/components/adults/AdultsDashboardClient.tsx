"use client";

import React, { useEffect, useState } from "react";
import { createCheckoutSession, purchaseAdditionalCapacity } from "@/app/actions/checkout";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { AdultsContact } from "@/app/(adults)/adults/dashboard/actions";
import { removeContact } from "@/app/(adults)/adults/dashboard/actions";
import { AddContactModal } from "./AddContactModal";
import { SelfSetupCard } from "./SelfSetupCard";
import { effectiveFamilyLimit, familyLimitReachedMessage } from "@/lib/limits";
import type { EntitlementSnapshot } from "@/lib/entitlements/entitlements";
import { FAMILY_LIMIT_ENFORCEMENT_ENABLED, BILLING_AVAILABLE } from "@/lib/billing/feature-flags";
import { FeedbackModal } from "@/components/feedback/FeedbackModal";
import { FeedbackIcon } from "@/components/feedback/FeedbackIcon";
import { BetaBillingBanner } from "@/components/billing/BetaBillingBanner";
import { FamilySummaryStrip } from "@/components/adults/dashboard/FamilySummaryStrip";
import { AccountStatusPill } from "@/components/adults/dashboard/AccountStatusPill";
import { FamilyHealthCard, type FamilyCardStatus } from "@/components/adults/dashboard/FamilyHealthCard";

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
  /** True immediately after a successful checkout redirect (?checkout=success)
   * confirmed to have actually started a trial (entitlement.status ===
   * "trialing" post-sync) — opens the add-contact modal automatically so
   * the visitor doesn't have to click "Add family member" a second time
   * right after paying. */
  autoOpenAddModal?: boolean;
  /** True for internal test accounts (BILLING_TEST_WHITELIST_EMAILS) that
   * never pay — hides the "Manage or cancel" link on the trial banner so
   * their messaging/UI stays exactly as it was before this was added. */
  isBillingWhitelisted?: boolean;
}

export function AdultsDashboardClient({ caregiverName, caregiverEmail, workspaceId, contacts, removedContacts, extraCapacity, entitlement, promptSelfSetup, isSelfPlan, tistraWhatsAppNumber, requiresCardBeforeTrial, autoOpenAddModal, isBillingWhitelisted }: Props) {
  // Opens the add-contact modal automatically right after a successful
  // checkout (see autoOpenAddModal's own doc comment) — only when there's
  // still nobody added yet, so this doesn't reopen the form on an account
  // that already has contacts (e.g. re-subscribing after a lapsed trial). A
  // lazy initializer rather than an effect, since this only ever needs to
  // run once, against the server-computed value at first mount.
  const [showModal, setShowModal] = useState(() => !!autoOpenAddModal && contacts.length === 0);
  const [startingCheckout, setStartingCheckout] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [buyingCapacity, setBuyingCapacity] = useState(false);
  const [buyCapacityError, setBuyCapacityError] = useState<string | null>(null);
  const [dismissedSelfSetup, setDismissedSelfSetup] = useState(false);
  const [showSelfSetup, setShowSelfSetup] = useState(false);
  const [showPrevious, setShowPrevious] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const feedbackLinkRef = React.useRef<HTMLButtonElement>(null);
  const router = useRouter();

  // Per-card Active/Focus/Reminder contribution, reported by each
  // FamilyHealthCard once its own Food Balance Score fetch resolves (see
  // FamilyHealthCard's onStatus prop) — the family summary strip's Focus/
  // Reminder counts aren't knowable up front since they depend on data
  // each card fetches independently.
  const [cardStatuses, setCardStatuses] = useState<Record<string, FamilyCardStatus>>({});
  const handleCardStatus = React.useCallback((contactId: string, status: FamilyCardStatus) => {
    setCardStatuses((prev) => (prev[contactId]?.active === status.active && prev[contactId]?.hasFocus === status.hasFocus && prev[contactId]?.reminderPaused === status.reminderPaused
      ? prev
      : { ...prev, [contactId]: status }));
  }, []);

  // Cleans the ?checkout=success param off the URL right after landing —
  // a pure navigation side effect (no setState), so a refresh doesn't
  // reopen the modal or re-run the server-side sync unnecessarily.
  useEffect(() => {
    if (autoOpenAddModal) router.replace("/adults/dashboard");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // "Add family member"/"Add person" open the modal directly for everyone
  // except a brand-new workspace that must add a card first — those get
  // redirected to Stripe Checkout (a 14-day trial attached, first charge
  // deferred to trial end, see createCheckoutSession) instead of opening
  // the form. The modal only ever appears once checkout succeeds and the
  // page reloads with an actual "trialing" entitlement.
  // Buys one more tracked-person slot on top of the plan's base limit —
  // adds/increases a recurring line item on the existing Stripe/Razorpay
  // subscription (prorated immediately, billed alongside the base plan from
  // the next renewal on). Confirms first since this charges the card
  // immediately; the exact amount isn't known until the server resolves the
  // account's billing market/interval, so the confirmation is generic and
  // the actual amount charged is shown afterward.
  async function handleBuyCapacity() {
    if (!window.confirm("Buy 1 more slot? You'll be charged a prorated amount today, then it renews monthly with your plan.")) return;
    setBuyCapacityError(null);
    setBuyingCapacity(true);
    try {
      const result = await purchaseAdditionalCapacity("adults");
      if (!result.ok) {
        setBuyCapacityError(result.reason);
        return;
      }
      const amount = (result.amountMinorUnits / 100).toFixed(2);
      window.alert(`You're all set — charged ${amount} ${result.currency}/mo for the extra slot. You can now add ${result.newExtraCapacity} more ${result.newExtraCapacity === 1 ? "person" : "people"} beyond the base plan.`);
      router.refresh();
    } catch (err) {
      setBuyCapacityError(err instanceof Error ? err.message : "Couldn't complete the purchase. Please try again.");
    } finally {
      setBuyingCapacity(false);
    }
  }

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

  // Shown when the "+" add action is tapped at the family-member limit —
  // replaces the old dashboard's permanent full-width limit banner (see
  // the family-dashboard-redesign spec: that messaging should only appear
  // contextually, when someone actually tries to add another person).
  function handleLimitReachedClick() {
    const message = !isSelfPlan && isSubscriber
      ? `${familyLimitReachedMessage(familyLimit)} Buy 1 more slot for $3.33/mo (or local equivalent)?`
      : familyLimitReachedMessage(familyLimit);
    if (!isSelfPlan && isSubscriber) {
      if (window.confirm(message)) handleBuyCapacity();
      return;
    }
    window.alert(message);
    router.push("/billing/manage?module=adults");
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
    <div className="min-h-screen bg-[var(--color-dashboard-page-bg)] relative overflow-x-hidden">
      {/* Soft radial purple glow near the top of the page — dark mode only
          (see globals.css's dashboard dark-mode block). Purely decorative,
          sits behind all content. */}
      <div
        aria-hidden="true"
        className="hidden dark:block pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[500px] opacity-40"
        style={{ background: "radial-gradient(ellipse at top, rgba(103,80,164,0.35), transparent 70%)" }}
      />

      {/* Nav */}
      <header className="relative bg-white dark:bg-[var(--color-dashboard-dark-card)] border-b border-gray-100 dark:border-white/10 px-6 py-4">
        <div className="max-w-[1050px] mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center overflow-hidden">
              <Image src="/logos/logo-purple.png" alt="" width={32} height={32} className="w-full h-full object-contain" />
            </div>
            <span className="font-bold text-gray-900 dark:text-white">Tistra Health</span>
          </Link>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-500 dark:text-gray-400 hidden sm:block">{caregiverEmail}</span>
            <Link href="/billing/manage?module=adults" className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-white font-medium">
              Billing
            </Link>
            <button
              ref={feedbackLinkRef}
              type="button"
              onClick={() => setShowFeedback(true)}
              className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-white font-medium flex items-center gap-1.5"
            >
              <FeedbackIcon className="w-4 h-4" />
              <span className="hidden sm:inline">Send Feedback</span>
            </button>
            <form action="/auth/signout" method="post">
              <button type="submit" className="text-xs text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 font-medium">Sign out</button>
            </form>
          </div>
        </div>
      </header>

      <main className="relative max-w-[1050px] mx-auto px-4 sm:px-6 py-8 sm:py-10">
        <div className="flex items-start justify-between gap-3 mb-6">
          <div>
            <h1 className="text-[28px] leading-tight font-bold text-gray-900 dark:text-white mb-1">
              {isSelfPlan ? "Your health" : "Family"}
            </h1>
            <p className="text-gray-500 dark:text-gray-400 text-[15px]">
              {activeCount === 0
                ? isSelfPlan
                  ? "Add your details to get started."
                  : "Add someone to get started."
                : displayName
                  ? `Good morning, ${displayName.split(" ")[0]} 👋`
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

        {activeCount > 0 && (
          <FamilySummaryStrip
            people={contacts.map((c) => ({ id: c.id, fullName: c.fullName, photoUrl: c.photoUrl }))}
            onAdd={isSelfPlan ? undefined : canAdd ? handleAddClick : handleLimitReachedClick}
            activeCount={contacts.filter((c) => cardStatuses[c.id]?.active ?? c.mealCount > 0).length}
            focusCount={contacts.filter((c) => cardStatuses[c.id]?.hasFocus).length}
            reminderCount={contacts.filter((c) => cardStatuses[c.id]?.reminderPaused).length}
          />
        )}

        <div className="flex flex-wrap items-center gap-2 mb-8">
          {!BILLING_AVAILABLE ? (
            <BetaBillingBanner sourcePage="adults_dashboard" />
          ) : (
            <AccountStatusPill
              isBillingWhitelisted={isBillingWhitelisted}
              trialDaysRemaining={entitlement.status === "trialing" ? entitlement.trialDaysRemaining : undefined}
              isReadOnly={entitlement.isReadOnly}
            />
          )}
        </div>

        {checkoutError && <p className="text-sm text-red-600 mb-6">{checkoutError}</p>}
        {buyCapacityError && <p className="text-sm text-red-600 mb-6">{buyCapacityError}</p>}

        {activeCount === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="relative w-full max-w-[280px] aspect-square mb-8">
              <div className="absolute inset-0 bg-[var(--color-dashboard-primary-light)]/40 rounded-full blur-3xl opacity-60" />
              <div className="relative w-full h-full rounded-full overflow-hidden border border-gray-100 dark:border-white/10 bg-white dark:bg-[var(--color-dashboard-dark-card)] shadow-[0_20px_40px_-12px_rgba(81,95,116,0.15)]">
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
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-3 tracking-tight">
              {isSelfPlan ? "Add your details to get started" : "Add someone you care about"}
            </h2>
            <p className="text-gray-500 dark:text-gray-400 text-base max-w-sm mb-8 leading-relaxed">
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
            <div className="mt-10 flex gap-8 items-center justify-center text-gray-400">
              <span className="text-xs font-medium uppercase tracking-widest">Private &amp; secure</span>
              <span className="text-xs font-medium uppercase tracking-widest">Expert verified</span>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {contacts.map((contact) => (
              <FamilyHealthCard
                key={contact.id}
                contact={contact}
                onOpen={() => router.push(`/adults/dashboard/contacts/${contact.id}`)}
                onRemove={removingId === contact.id ? undefined : () => handleRemove(contact)}
                tistraWhatsAppNumber={tistraWhatsAppNumber}
                onStatus={handleCardStatus}
              />
            ))}
          </div>
        )}

        {removedContacts.length > 0 && (
          <div className="mt-10">
            <button
              onClick={() => setShowPrevious((v) => !v)}
              className="text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-white mb-4"
            >
              {showPrevious ? "Hide" : "Show"} {isSelfPlan ? "previous profile" : "previous family members"} ({removedContacts.length})
            </button>
            {showPrevious && (
              <div className="flex flex-col gap-4 opacity-70">
                {removedContacts.map((contact) => (
                  <div key={contact.id} className="relative">
                    <FamilyHealthCard contact={contact} onOpen={() => router.push(`/adults/dashboard/contacts/${contact.id}`)} />
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
          isSelfPlan={!!isSelfPlan}
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

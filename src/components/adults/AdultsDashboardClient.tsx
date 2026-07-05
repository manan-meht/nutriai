"use client";

import React, { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { AdultsContact } from "@/app/(adults)/adults/dashboard/actions";
import { removeContact, resendContactInvite } from "@/app/(adults)/adults/dashboard/actions";
import { AddContactModal } from "./AddContactModal";
import { SelfSetupCard } from "./SelfSetupCard";
import { effectiveFamilyLimit, familyLimitReachedMessage } from "@/lib/limits";
import type { EntitlementSnapshot } from "@/lib/entitlements/entitlements";
import { FAMILY_LIMIT_ENFORCEMENT_ENABLED } from "@/lib/billing/feature-flags";

interface Props {
  caregiverName: string;
  caregiverEmail: string;
  workspaceId: string;
  contacts: AdultsContact[];
  removedContacts: AdultsContact[];
  extraCapacity: number;
  entitlement: EntitlementSnapshot;
  promptSelfSetup?: boolean;
  pricing: { monthlyLabel: string; annualLabel: string };
}

const GOAL_LABELS: Record<string, string> = {
  eat_enough: "Eat enough", enough_protein: "Enough protein", increase_protein: "More protein",
  reduce_carbs: "Fewer carbs", balanced_meals: "Balanced meals", weight_gain: "Weight gain",
  hydration: "Hydration", custom: "Custom",
};

const RELATIONSHIP_EMOJI: Record<string, string> = {
  son: "👨", daughter: "👩", spouse: "💑", parent: "👴", sibling: "🤝", friend: "😊", other: "🧑",
};

export function AdultsDashboardClient({ caregiverName, caregiverEmail, workspaceId, contacts, removedContacts, extraCapacity, entitlement, promptSelfSetup, pricing }: Props) {
  const [showModal, setShowModal] = useState(false);
  const [dismissedSelfSetup, setDismissedSelfSetup] = useState(false);
  const [showPrevious, setShowPrevious] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [resendError, setResendError] = useState<string | null>(null);
  const router = useRouter();

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

  async function handleResendInvite(contact: AdultsContact) {
    setResendError(null);
    setResendingId(contact.id);
    try {
      await resendContactInvite(contact.id);
      router.refresh();
    } catch (err) {
      setResendError(err instanceof Error ? err.message : "Failed to resend invite.");
    } finally {
      setResendingId(null);
    }
  }

  const activeCount = contacts.length;
  const sendingData = contacts.filter((c) => c.mealCount > 0).length;
  const familyLimit = effectiveFamilyLimit(extraCapacity);
  const countLimitReached = FAMILY_LIMIT_ENFORCEMENT_ENABLED && activeCount >= familyLimit;
  const canAdd = !countLimitReached && !entitlement.isReadOnly;
  const isSubscriber = entitlement.status === "active" || entitlement.status === "past_due" || entitlement.status === "cancel_at_period_end";

  return (
    <div className="min-h-screen bg-rose-50/40">
      {/* Nav */}
      <header className="bg-white border-b border-gray-100 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center overflow-hidden">
              <Image src="/logos/logo-red.png" alt="" width={32} height={32} className="w-full h-full object-contain" />
            </div>
            <span className="font-bold text-gray-900">Tistra Health</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-500 hidden sm:block">{caregiverEmail}</span>
            <Link href="/billing?module=adults" className="text-sm text-gray-500 hover:text-gray-800 font-medium">
              Billing
            </Link>
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
              {caregiverName ? `Hi, ${caregiverName.split(" ")[0]} 👋` : "Your family"}
            </h1>
            <p className="text-gray-500 text-sm">
              {activeCount === 0 ? "Add someone to get started." : `Keeping an eye on ${activeCount} person${activeCount !== 1 ? "s" : ""}`}
            </p>
          </div>
          {canAdd && (
            <button
              onClick={() => setShowModal(true)}
              className="bg-rose-600 text-white font-semibold rounded-full px-5 py-2.5 text-sm hover:bg-rose-700 transition-colors shadow-sm flex items-center gap-2"
            >
              <span className="text-lg leading-none">+</span> Add person
            </button>
          )}
        </div>

        {promptSelfSetup && !dismissedSelfSetup && (
          <SelfSetupCard
            workspaceId={workspaceId}
            defaultFullName={caregiverName}
            onDone={() => { setDismissedSelfSetup(true); router.refresh(); }}
            onSkip={() => setDismissedSelfSetup(true)}
          />
        )}

        {entitlement.isReadOnly && (
          <div className="mb-8 rounded-xl bg-amber-50 border border-amber-100 px-4 py-3 text-sm text-amber-800">
            Your free trial has ended. Your existing family members and their data are preserved and visible, but you
            can&apos;t add new family members or generate new AI analyses until you <Link href="/billing?module=adults" className="underline font-medium">subscribe</Link>.
          </div>
        )}

        {!entitlement.isReadOnly && entitlement.status === "trialing" && entitlement.trialDaysRemaining !== null && (
          <div className="mb-8 rounded-xl bg-rose-50 border border-rose-100 px-4 py-3 text-sm text-rose-800">
            Free trial — {entitlement.trialDaysRemaining} day{entitlement.trialDaysRemaining === 1 ? "" : "s"} remaining.{" "}
            <Link href="/billing?module=adults" className="underline font-medium">Subscribe</Link>
          </div>
        )}

        {!entitlement.isReadOnly && countLimitReached && (
          <div className="mb-8 rounded-xl bg-rose-50 border border-rose-100 px-4 py-3 text-sm text-rose-800">
            {familyLimitReachedMessage(familyLimit)} <Link href="/billing?module=adults" className="underline font-medium">Upgrade your plan</Link> to add more.
          </div>
        )}

        {isSubscriber ? (
          <div className="mb-8 rounded-xl bg-gray-50 border border-gray-100 px-4 py-3 text-sm text-gray-600 flex flex-wrap items-center justify-between gap-2">
            <span>Your plan includes up to {familyLimit} family members.</span>
            <Link href="/billing?module=adults" className="font-medium text-rose-700 underline">
              Need more than {familyLimit}? Add capacity →
            </Link>
          </div>
        ) : (
          <div className="mb-8 rounded-xl bg-gray-50 border border-gray-100 px-4 py-3 text-sm text-gray-600">
            Your first {familyLimit} family members are free for your first month. After that, Family is{" "}
            <span className="font-semibold text-gray-800">{pricing.monthlyLabel}/month</span> or{" "}
            <span className="font-semibold text-gray-800">{pricing.annualLabel}/year</span>.{" "}
            <Link href="/billing?module=adults" className="underline font-medium text-rose-700">See plans</Link>
          </div>
        )}

        {activeCount > 0 && (
          <div className="grid grid-cols-2 gap-4 mb-8">
            <StatCard label="People added" value={activeCount} />
            <StatCard label="Sending meals" value={sendingData} />
          </div>
        )}

        {activeCount === 0 ? (
          <div className="flex flex-col items-center justify-center py-32 text-center">
            <div className="w-24 h-24 rounded-3xl bg-rose-50 flex items-center justify-center mb-6 text-5xl">👵</div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">No one added yet</h2>
            <p className="text-gray-500 text-sm max-w-xs mb-8">
              Add a parent, grandparent, or anyone you want to help stay healthy. They&apos;ll send meal photos on WhatsApp and you&apos;ll track their nutrition here.
            </p>
            {canAdd && (
              <button
                onClick={() => setShowModal(true)}
                className="bg-rose-600 text-white font-semibold rounded-full px-8 py-4 text-sm hover:bg-rose-700 transition-colors shadow-lg shadow-rose-100"
              >
                Add your first contact
              </button>
            )}
          </div>
        ) : (
          <>
            {resendError && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3 mb-4">{resendError}</p>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {contacts.map((contact) => (
                <ContactCard
                  key={contact.id}
                  contact={contact}
                  onOpen={() => router.push(`/adults/dashboard/contacts/${contact.id}`)}
                  onRemove={removingId === contact.id ? undefined : () => handleRemove(contact)}
                  onResendInvite={contact.inviteAcceptedAt ? undefined : () => handleResendInvite(contact)}
                  resending={resendingId === contact.id}
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
              {showPrevious ? "Hide" : "Show"} previous family members ({removedContacts.length})
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
          caregiverName={caregiverName || caregiverEmail}
          onClose={() => setShowModal(false)}
          onAdded={() => router.refresh()}
        />
      )}
    </div>
  );
}

interface ContactCardProps {
  contact: AdultsContact;
  onOpen?: () => void;
  onRemove?: () => void;
  onResendInvite?: () => void;
  resending?: boolean;
}

function ContactCard({ contact, onOpen, onRemove, onResendInvite, resending }: ContactCardProps) {
  const initials = contact.fullName.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();
  const activeGoal = contact.goals.find((g) => g.status === "active");
  const isActive = contact.mealCount > 0;
  const inviteAccepted = !!contact.inviteAcceptedAt;
  const invitePending = !!contact.inviteSentAt && !inviteAccepted;
  const isSelf = contact.relationshipType === "self";
  const emoji = isSelf ? "🙋" : contact.relationship ? (RELATIONSHIP_EMOJI[contact.relationship] ?? "🧑") : "🧑";
  const displayName = isSelf ? "You" : contact.fullName;

  const lastMealLabel = contact.lastMealAt ? formatRelative(new Date(contact.lastMealAt)) : null;

  return (
    <div
      className="bg-white rounded-2xl border border-gray-100 p-5 hover:border-rose-200 hover:shadow-md transition-all cursor-pointer text-left"
      role={onOpen ? "button" : undefined}
      tabIndex={onOpen ? 0 : undefined}
      onClick={onOpen}
      onKeyDown={onOpen ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } } : undefined}
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-11 h-11 rounded-full bg-rose-100 flex items-center justify-center flex-shrink-0">
              <span className="text-sm font-bold text-rose-700">{initials}</span>
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
            {isActive ? "Active" : inviteAccepted ? "Accepted" : invitePending ? "Invite sent" : "Not invited"}
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

      {invitePending && !isActive && (
        <div className="flex items-center justify-between gap-2 mb-4 bg-amber-50 rounded-xl px-3 py-2">
          <div className="flex items-center gap-2">
            <span>⏳</span>
            <p className="text-xs text-amber-700">Invite sent — waiting for their first message</p>
          </div>
          {onResendInvite && (
            <button
              type="button"
              disabled={resending}
              onClick={(e) => { e.stopPropagation(); onResendInvite(); }}
              className="text-xs font-medium text-amber-800 underline hover:text-amber-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 rounded flex-shrink-0 disabled:opacity-50 disabled:no-underline"
              aria-label={`Resend invite to ${contact.fullName}`}
            >
              {resending ? "Sending…" : "Resend"}
            </button>
          )}
        </div>
      )}

      {activeGoal ? (
        <div className="rounded-xl bg-rose-50 px-3 py-2">
          <p className="text-xs font-semibold text-rose-700 mb-0.5">{GOAL_LABELS[activeGoal.goalType] ?? activeGoal.goalType}</p>
          {activeGoal.description && <p className="text-xs text-rose-500 line-clamp-1">{activeGoal.description}</p>}
          <div className="flex gap-3 mt-1.5 flex-wrap text-xs text-rose-500">
            {activeGoal.targetProteinG && <span>{activeGoal.targetProteinG}g protein/day</span>}
            {activeGoal.targetCaloriesMin && <span>min {activeGoal.targetCaloriesMin} kcal</span>}
            {activeGoal.targetMealsPerDay && <span>{activeGoal.targetMealsPerDay} meals/day</span>}
          </div>
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

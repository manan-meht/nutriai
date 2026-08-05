"use client";

import { useEffect, useState } from "react";
import type { AdultsContact } from "@/app/(adults)/adults/dashboard/actions";
import { getOrCreateFamilyInvite, regenerateFamilyInvite, revokeFamilyInvite, markFamilyInviteLinkOpened } from "@/app/(adults)/adults/dashboard/actions";
import { InviteCard } from "@/components/shared/invites/InviteCard";
import { NUTRITION_GOAL_LABELS } from "@/lib/food-balance/goal-options";
import { useFoodBalanceData } from "@/lib/food-balance/use-food-balance-data";
import { ContactAvatar } from "@/components/shared/dashboard/ContactAvatar";
import { GoalChip } from "./GoalChip";
import { FoodBalanceRing } from "./FoodBalanceRing";
import { MiniTrendChart } from "./MiniTrendChart";
import { LatestMealPreview } from "./LatestMealPreview";
import { ReminderStatus } from "./ReminderStatus";
import { TodaysFocus } from "./TodaysFocus";

// Past this point since the contact's last inbound message, WhatsApp's own
// customer-service window closes and meal reminders stop being delivered
// (see send-meal-reminders/route.ts) — same threshold the old ContactCard
// used for its "Reminders paused" badge.
const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

const SCORE_BAND_LABEL = [
  { max: 39, label: "Learning and building" },
  { max: 59, label: "Building balance" },
  { max: 79, label: "Supporting your goal" },
  { max: 100, label: "Strong foundation" },
];

function bandLabelFor(score: number): string {
  return SCORE_BAND_LABEL.find((b) => score <= b.max)?.label ?? "Supporting your goal";
}

export interface FamilyCardStatus {
  active: boolean;
  hasFocus: boolean;
  /** True if this contact needs a WhatsApp connect/reconnect action —
   * either never connected (invite pending or not even sent yet), or
   * connected before but gone quiet past the 24h reminder window (see
   * needsReminderAction below). */
  reminderPaused: boolean;
}

interface FamilyHealthCardProps {
  contact: AdultsContact;
  onOpen?: () => void;
  onRemove?: () => void;
  tistraWhatsAppNumber?: string;
  /** Reports this card's contribution to the family summary strip's
   * Active/Focus/Reminder counts once its own Food Balance Score fetch
   * resolves — the strip can't know a card's "has an active focus
   * recommendation" state up front since that only exists per-contact,
   * behind the same fetch FoodBalanceRing/TodaysFocus need anyway (see
   * AdultsDashboardClient's cardStatuses state). */
  onStatus?: (contactId: string, status: FamilyCardStatus) => void;
}

/** The family dashboard's main content unit — one person's glanceable
 * health snapshot (score ring, 7-day trend, latest meal, reminder status,
 * today's focus). Replaces the old list-record-style ContactCard per the
 * family-dashboard-redesign spec. */
export function FamilyHealthCard({ contact, onOpen, onRemove, tistraWhatsAppNumber, onStatus }: FamilyHealthCardProps) {
  // Lazy initializer, not a direct Date.now() call — react-hooks/purity
  // forbids calling impure functions during render; this only needs to be
  // "now enough", not live-ticking, so a value fixed at mount is fine (same
  // pattern the old ContactCard used).
  const [now] = useState(() => Date.now());
  const isActive = contact.mealCount > 0;
  const inviteAccepted = !!contact.inviteAcceptedAt;
  const invitePending = !!contact.inviteSentAt && !inviteAccepted;
  const isStale = inviteAccepted && (!contact.lastMessageAt || now - new Date(contact.lastMessageAt).getTime() > STALE_AFTER_MS);
  const isSelf = contact.relationshipType === "self";
  const displayName = isSelf ? "You" : contact.fullName;

  // "Reminder" in the family summary strip means "this person needs a
  // WhatsApp connect/reconnect action from you" — not just the isStale
  // case (accepted before, gone quiet past the 24h window), but also
  // never having connected at all (whether or not an invite was sent).
  // Both states show their own InviteCard/ReminderStatus prompt below.
  const needsReminderAction = isStale || !inviteAccepted;

  const foodBalancePath = `/api/adults/contacts/${contact.id}`;
  const foodBalanceData = useFoodBalanceData(foodBalancePath);
  const result = foodBalanceData.status === "ready" ? foodBalanceData.result : null;
  const topRecommendation = result && result.status !== "collecting_data" && result.status !== "refreshing_data" ? result.recommendations[0] : undefined;

  useEffect(() => {
    if (!onStatus) return;
    onStatus(contact.id, { active: isActive, hasFocus: !!topRecommendation, reminderPaused: needsReminderAction });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contact.id, isActive, needsReminderAction, !!topRecommendation]);

  const goalLabel = contact.nutritionGoals && contact.nutritionGoals.length > 0
    ? contact.nutritionGoals.map((g) => NUTRITION_GOAL_LABELS[g] ?? g).join(", ")
    : undefined;

  return (
    <div
      className="bg-white dark:bg-[var(--color-dashboard-dark-card)] rounded-[22px] border border-gray-100 dark:border-white/10 p-5 hover:border-[var(--color-dashboard-primary)] hover:shadow-md dark:hover:border-[var(--color-dashboard-primary)]/50 transition-all cursor-pointer"
      role={onOpen ? "button" : undefined}
      tabIndex={onOpen ? 0 : undefined}
      onClick={onOpen}
      onKeyDown={onOpen ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } } : undefined}
    >
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-3.5 min-w-0">
          <ContactAvatar photoUrl={contact.photoUrl} fullName={contact.fullName} size="lg" ringed />
          <div className="min-w-0">
            <p className="font-bold text-gray-900 dark:text-white text-lg truncate">{displayName}</p>
            {goalLabel ? (
              <div className="mt-1">
                <GoalChip label={goalLabel} goalId={contact.nutritionGoals?.[0]} />
              </div>
            ) : (
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">No goal set</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0 pt-1">
          {onRemove && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onRemove(); }}
              className="text-xs text-gray-400 hover:text-red-600 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 rounded px-1"
              aria-label={`Remove ${contact.fullName}`}
            >
              Remove
            </button>
          )}
          {onOpen && (
            <span className="text-gray-300 dark:text-gray-600 text-xl leading-none" aria-hidden="true">›</span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 rounded-2xl border border-gray-50 dark:border-white/5 bg-gray-50/50 dark:bg-white/[0.03] px-3 py-4 mb-4">
        <div className="flex flex-col items-center">
          <p className="text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-1.5">Food Balance</p>
          {result && result.status !== "collecting_data" && result.status !== "refreshing_data" ? (
            <FoodBalanceRing score={result.score ?? 0} label={bandLabelFor(result.score ?? 0)} />
          ) : (
            <div className="w-20 h-20 rounded-full border-4 border-gray-100 dark:border-white/10 flex items-center justify-center">
              <span className="text-[11px] text-gray-400 dark:text-gray-500 text-center px-1">
                {foodBalanceData.status === "loading" ? "…" : "Still learning"}
              </span>
            </div>
          )}
        </div>
        <div className="flex flex-col items-center justify-center">
          <p className="text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-1.5">7-day calorie trend</p>
          <MiniTrendChart scores={contact.last7DaysCalories} />
        </div>
        <div className="flex flex-col items-center">
          <p className="text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-1.5">Last meal</p>
          <LatestMealPreview photoUrl={contact.lastMealPhotoUrl} lastMealAt={contact.lastMealAt} mealCount={contact.mealCount} />
        </div>
      </div>

      {!isActive && !inviteAccepted && (
        <div className="mb-4" onClick={(e) => e.stopPropagation()}>
          {isSelf ? (
            <div className="rounded-xl bg-[var(--color-status-steady-bg)] px-3 py-2.5">
              <p className="text-sm font-medium text-gray-700 mb-1">Connect your own WhatsApp number</p>
              <p className="text-xs text-gray-500 mb-2">
                This opens a WhatsApp chat with Tistra Health, ready to go — you&apos;ll see it connected here right away.
              </p>
              {tistraWhatsAppNumber && (
                <a
                  href={`https://wa.me/${tistraWhatsAppNumber}?text=${encodeURIComponent("Hi! I'm ready to start tracking my meals with Tistra Health 👋")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block bg-[var(--color-dashboard-primary)] text-white text-sm font-medium rounded-lg px-4 py-2"
                >
                  Open WhatsApp to get started
                </a>
              )}
            </div>
          ) : (
            <InviteCard
              title="Ask them to start Tistra on WhatsApp"
              description={`Send ${contact.fullName.split(" ")[0]} this link — they message the bot, and you'll see them connected here right away.`}
              load={() => getOrCreateFamilyInvite(contact.id)}
              regenerate={() => regenerateFamilyInvite(contact.id)}
              revoke={() => revokeFamilyInvite(contact.id)}
              onLinkOpened={() => markFamilyInviteLinkOpened(contact.id)}
            />
          )}
        </div>
      )}

      {isStale && (
        <div className="mb-4">
          {isSelf ? (
            <ReminderStatus
              title="Reminders paused"
              description="More than 24h since you interacted on WhatsApp."
              waLink={tistraWhatsAppNumber ? `https://wa.me/${tistraWhatsAppNumber}` : undefined}
            />
          ) : (
            <div onClick={(e) => e.stopPropagation()}>
              <InviteCard
                title="Remind them to reopen Tistra on WhatsApp"
                description={`More than 24 hours have passed since ${contact.fullName.split(" ")[0]} interacted with WhatsApp, so meal reminders won't be sent until they message the bot again.`}
                load={() => getOrCreateFamilyInvite(contact.id)}
                regenerate={() => regenerateFamilyInvite(contact.id)}
                revoke={() => revokeFamilyInvite(contact.id)}
                onLinkOpened={() => markFamilyInviteLinkOpened(contact.id)}
              />
            </div>
          )}
        </div>
      )}

      {topRecommendation && (
        <div className="pt-3 border-t border-gray-50 dark:border-white/5">
          <TodaysFocus text={topRecommendation.action || topRecommendation.title} />
        </div>
      )}
    </div>
  );
}

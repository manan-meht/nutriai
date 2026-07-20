// Mirrors the main web app's src/lib/share-cards/selector.ts — duplicated here rather
// than shared, matching this app's existing pattern (see e.g. lib/purchases.ts,
// or mobile-api's lib/food-balance.ts for the same convention on that side).
// Keep in sync manually if the web app's share-cards logic changes.

import type { EarnedShareCard } from "./types";

// Anti-spam / quality rules for surfacing earned share cards (see this
// feature's spec: "Do not show a share prompt for every tiny action").

const MAX_DASHBOARD_CARDS = 3;

/** Category priority for picking which earned cards to show when there
 * are more than MAX_DASHBOARD_CARDS — comeback/personality moments and
 * weekly consistency wins surface before routine daily wins. */
const CATEGORY_PRIORITY: Record<EarnedShareCard["concept"]["category"], number> = {
  comeback: 0,
  personality_badge: 1,
  weekly_consistency: 2,
  improvement: 3,
  food_balance: 4,
  daily_win: 5,
};

/** Caps the cards shown on the dashboard's "Your wins" section at 3,
 * most-recently-earned and highest-priority-category first. */
export function selectDashboardCards(earned: EarnedShareCard[]): EarnedShareCard[] {
  return [...earned]
    .sort((a, b) => {
      const byCategory = CATEGORY_PRIORITY[a.concept.category] - CATEGORY_PRIORITY[b.concept.category];
      if (byCategory !== 0) return byCategory;
      return new Date(b.earnedAt).getTime() - new Date(a.earnedAt).getTime();
    })
    .slice(0, MAX_DASHBOARD_CARDS);
}

/** Weekly report / WhatsApp summary gets exactly one featured card — the
 * single highest-priority earned card. */
export function selectFeaturedCard(earned: EarnedShareCard[]): EarnedShareCard | null {
  return selectDashboardCards(earned)[0] ?? null;
}

/** Max 1 immediate ("end of day achievement moment") share prompt per
 * day, and never for a card already dismissed as "don't show this one
 * again". `lastImmediatePromptAt`/`dismissedConceptIds` are caller-owned
 * state (e.g. local storage or a DB column) — this function is pure. */
export function canShowImmediatePrompt(params: {
  lastImmediatePromptAt: string | null;
  now?: Date;
}): boolean {
  const now = params.now ?? new Date();
  if (!params.lastImmediatePromptAt) return true;
  const last = new Date(params.lastImmediatePromptAt);
  return startOfDay(last) < startOfDay(now);
}

export function pickImmediatePromptCard(
  earned: EarnedShareCard[],
  params: { dismissedConceptIds?: string[]; lastImmediatePromptAt: string | null; now?: Date }
): EarnedShareCard | null {
  if (!canShowImmediatePrompt(params)) return null;
  const dismissed = new Set(params.dismissedConceptIds ?? []);
  const eligible = earned.filter((c) => !dismissed.has(c.concept.id));
  return selectFeaturedCard(eligible);
}

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

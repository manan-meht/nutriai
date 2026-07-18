import { SHARE_CARD_CONCEPTS } from "./concepts";
import { selectFeaturedCard } from "./selector";
import { getEarnedCards, type ShareCardMealInput } from "./triggers";
import type { EarnedShareCard } from "./types";

// Weekly WhatsApp mention ("You earned a share card this week: ...") — see
// this feature's spec. Deliberately evaluated from meals + distinct
// logging days alone, without Food Balance Score component scores: the
// component-score-backed concepts (balanced/protein/fiber-all-week,
// improvement cards) need calculateFoodBalanceScore, which this repo's
// cron routes avoid importing to keep their Cloudflare Worker bundle
// small (see send-meal-reminders/route.ts's own bundle-size comments).
// TODO: once a real weekly-digest job exists that already computes the
// Food Balance Score for other reasons, pass componentScores/
// previousWeekComponentScores through here too so the full concept set
// (not just meal-count-based ones like streaks/comebacks) can be featured.
export function pickWeeklyWhatsAppWin(
  meals: ShareCardMealInput[],
  distinctLoggingDaysThisWeek: number,
  now?: Date
): EarnedShareCard | null {
  const earned = getEarnedCards(SHARE_CARD_CONCEPTS, { meals, distinctLoggingDaysThisWeek, now });
  return selectFeaturedCard(earned);
}

export function buildWeeklyWinsWhatsAppLine(card: EarnedShareCard, dashboardUrl: string): string {
  return `\n\n🎉 You earned a share card this week: ${card.concept.title}. View it: ${dashboardUrl}`;
}

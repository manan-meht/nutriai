// Mirrors src/lib/food-balance/analytics.ts's stub pattern — no analytics
// backend is wired up anywhere in this repo yet, so this is a
// console.debug placeholder, trivial to swap for a real call later
// without touching call sites.
//
// Only pass the allowed categorical properties below. Never pass meal
// descriptions, medical conditions, exact nutrition details, photos, or
// personal names.
export type ShareCardAnalyticsEvent =
  | "share_card_viewed"
  | "share_card_downloaded"
  | "share_card_shared"
  | "share_card_dismissed";

export interface ShareCardAnalyticsProperties {
  card_id: string;
  category: string;
  format: string;
  source_surface: "dashboard" | "achievements_page" | "immediate_prompt" | "weekly_report" | "whatsapp";
}

export function trackShareCardEvent(event: ShareCardAnalyticsEvent, properties: ShareCardAnalyticsProperties): void {
  console.debug("[share-card-analytics]", event, properties);
}

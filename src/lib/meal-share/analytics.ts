// Mirrors src/lib/food-balance/analytics.ts's stub pattern — no analytics
// backend is wired up anywhere in this repo yet, so this is a console.debug
// placeholder. Never pass custom caption text, meal description, health
// condition, exact macro values, or user/relationship names — only the
// categorical properties named in ShareOverlayTextAnalyticsProperties.
export type ShareOverlayTextAnalyticsEvent =
  | "share_overlay_text_selected"
  | "share_overlay_text_shuffled"
  | "share_overlay_text_edited"
  | "share_overlay_text_removed";

export interface ShareOverlayTextAnalyticsProperties {
  text_id?: string;
  category?: string;
  meal_type?: string;
  audience?: string;
}

export function trackShareOverlayTextEvent(event: ShareOverlayTextAnalyticsEvent, properties?: ShareOverlayTextAnalyticsProperties): void {
  console.debug("[meal-share-overlay-text-analytics]", event, properties);
}

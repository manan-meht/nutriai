import type { EntitlementStatus } from "@/lib/entitlements/entitlements";

/**
 * Maps a Stripe subscription status to our internal entitlement status.
 * Pure function — no Stripe SDK/network calls — so it's directly unit
 * testable without live credentials.
 *
 * Stripe statuses: incomplete, incomplete_expired, trialing, active,
 * past_due, canceled, unpaid, paused.
 */
export function mapStripeStatus(stripeStatus: string, cancelAtPeriodEnd: boolean): EntitlementStatus {
  switch (stripeStatus) {
    case "trialing":
      return "trialing";
    case "active":
      return cancelAtPeriodEnd ? "cancel_at_period_end" : "active";
    case "past_due":
      return "past_due";
    case "canceled":
      return "cancelled";
    case "unpaid":
    case "incomplete_expired":
    case "paused":
      return "expired";
    case "incomplete":
      return "not_started";
    default:
      return "not_started";
  }
}

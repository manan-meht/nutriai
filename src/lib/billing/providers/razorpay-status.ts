import type { EntitlementStatus } from "@/lib/entitlements/entitlements";

/**
 * Maps a Razorpay subscription status to our internal entitlement status.
 * Pure function, directly unit testable.
 *
 * Razorpay statuses: created, authenticated, active, pending, halted,
 * cancelled, completed, expired.
 */
export function mapRazorpayStatus(razorpayStatus: string): EntitlementStatus {
  switch (razorpayStatus) {
    case "authenticated":
    case "active":
      return "active";
    case "pending":
      return "past_due";
    case "halted":
      return "past_due";
    case "cancelled":
      return "cancelled";
    case "completed":
    case "expired":
      return "expired";
    case "created":
    default:
      return "not_started";
  }
}

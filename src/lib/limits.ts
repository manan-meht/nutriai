// Base account limits (owner does not count toward these). Server-authoritative
// enforcement lives in the DB (see supabase/migrations/0002_account_limits.sql
// and 0003_purchasable_capacity.sql); these constants are duplicated here only
// for client-side UI messaging (disabling/hiding the Add button, explanatory
// copy) and must match the base numbers enforced in those migrations.
//
// A workspace's *effective* limit is base + workspaces.extra_capacity
// (purchased seats — see 0003_purchasable_capacity.sql). Always compute
// against the effective limit, not the base constant, when deciding whether
// the Add action should be available.
export const FAMILY_MEMBER_LIMIT = 2;
export const GYM_CLIENT_LIMIT = 5;
export const SELF_TRACKING_LIMIT = 1;

// `basePeopleIncluded` defaults to the existing family base (2) so every
// pre-existing call site keeps working unchanged; pass SELF_TRACKING_LIMIT
// explicitly for a workspace on the self plan (see workspaces.plan,
// migration 0010, and the matching branch in enforce_family_member_limit).
export function effectiveFamilyLimit(extraCapacity: number, basePeopleIncluded: number = FAMILY_MEMBER_LIMIT): number {
  return basePeopleIncluded + Math.max(0, extraCapacity);
}

export function effectiveGymLimit(extraCapacity: number): number {
  return GYM_CLIENT_LIMIT + Math.max(0, extraCapacity);
}

export function familyLimitReachedMessage(effectiveLimit: number): string {
  return `You've reached the limit of ${effectiveLimit} family member${effectiveLimit === 1 ? "" : "s"} for this account.`;
}

export function gymLimitReachedMessage(effectiveLimit: number): string {
  return `You've reached the limit of ${effectiveLimit} client${effectiveLimit === 1 ? "" : "s"} for this account.`;
}

// Removing someone frees an *active* slot but does not refund this
// calendar month's add quota — see supabase/migrations/0004_soft_delete_and_monthly_quota.sql.
// The freed slot can only be used again once the calendar month rolls over.
export function familyMonthlyQuotaReachedMessage(effectiveLimit: number): string {
  return `You've already added ${effectiveLimit} family member${effectiveLimit === 1 ? "" : "s"} this month. ` +
    `Removing someone doesn't free up a new slot until next month.`;
}

export function gymMonthlyQuotaReachedMessage(effectiveLimit: number): string {
  return `You've already added ${effectiveLimit} client${effectiveLimit === 1 ? "" : "s"} this month. ` +
    `Removing someone doesn't free up a new slot until next month.`;
}

// Back-compat plain messages for the base limit (used as a fallback when
// extra_capacity isn't available, e.g. in the DB-trigger-race catch path
// where we only have the error message, not the workspace row).
export const FAMILY_LIMIT_REACHED_MESSAGE = familyLimitReachedMessage(FAMILY_MEMBER_LIMIT);
export const GYM_LIMIT_REACHED_MESSAGE = gymLimitReachedMessage(GYM_CLIENT_LIMIT);
export const FAMILY_MONTHLY_QUOTA_REACHED_MESSAGE = familyMonthlyQuotaReachedMessage(FAMILY_MEMBER_LIMIT);
export const GYM_MONTHLY_QUOTA_REACHED_MESSAGE = gymMonthlyQuotaReachedMessage(GYM_CLIENT_LIMIT);

/** Start (UTC) of the calendar month containing `at`. */
export function startOfCalendarMonthUTC(at: Date): Date {
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), 1, 0, 0, 0, 0));
}

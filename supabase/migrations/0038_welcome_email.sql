-- Tracks whether the "Welcome to Tistra Health" email has been sent for this
-- entitlement's first card-backed trial, so applyProviderSubscriptionSnapshot
-- (see src/lib/entitlements/entitlements.ts) doesn't re-send it every time a
-- webhook/sync re-applies a "trialing" snapshot for the same subscription.
-- Nullable/additive — existing rows are unaffected.
alter table entitlements add column if not exists welcome_email_sent_at timestamptz;

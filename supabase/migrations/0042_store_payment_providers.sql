-- The payment_provider enum (migration 0001) only ever had 'stripe' and
-- 'razorpay' — it was never extended when RevenueCat/mobile store billing
-- (Apple/Google Play, see src/lib/billing/revenuecat.ts's providerForStore)
-- was added. Every RevenueCat webhook's very first write — inserting into
-- payment_webhook_events with provider 'apple'/'google_play' for
-- idempotency tracking — has therefore been failing at the database level
-- with an "invalid input value for enum payment_provider" error on every
-- single store purchase/restore, before any event-type or entitlement
-- logic ever runs. The webhook route's generic insert-error handling
-- (src/app/api/webhooks/revenuecat/route.ts) treats any insert failure the
-- same as an already-seen duplicate and returns 200, so this failure was
-- completely invisible — the RevenueCat dashboard would show the webhook
-- as delivered/200, and nothing in this app's own logs distinguished a
-- real duplicate from this enum rejection.
--
-- ALTER TYPE ... ADD VALUE cannot run inside the same transaction as a
-- statement that uses the new value, but is safe on its own — each
-- statement below is applied and committed independently.
alter type payment_provider add value if not exists 'apple';
alter type payment_provider add value if not exists 'google_play';

-- Adds Apple/Google Play (via RevenueCat) as billing providers, reusing
-- the existing entitlements table/pipeline (see src/lib/billing/revenuecat.ts
-- and src/app/api/webhooks/revenuecat/route.ts) rather than a new schema —
-- Stripe/Razorpay already prove this table is provider-neutral.
--
-- 'apple'/'google_play' are the actual store doing the charging; RevenueCat
-- itself isn't stored as a provider value — it's the integration layer that
-- verifies the purchase and sends us one webhook covering both stores. See
-- provider.ts's PaymentProviderName comment for why these two never
-- implement the full PaymentProvider (checkout) interface.
--
-- 'grace_period' is the store billing-retry state (Apple/Google keep the
-- subscriber's access while retrying a failed payment) — same semantics as
-- the existing 'past_due', kept distinct so in-app copy can name it
-- accurately for store subscribers.
--
-- Note: ALTER TYPE ... ADD VALUE cannot be used in the same transaction
-- that also references the new value — this migration only adds the
-- values, nothing here uses them yet.
alter type payment_provider add value if not exists 'apple';
alter type payment_provider add value if not exists 'google_play';
alter type entitlement_status add value if not exists 'grace_period';

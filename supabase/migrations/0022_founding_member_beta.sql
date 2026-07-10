-- Founding-member pricing / Beta billing state.
--
-- Deliberately minimal — reuses existing fields wherever they already
-- express the right concept instead of adding redundant ones:
--   * "intended plan" is already workspaces.plan (migration 0010), set by
--     app logic separately from any active paid subscription.
--   * "trial started" is already entitlements.trial_start_at.
--   * The overall Beta-wide non-billable state is a global feature flag
--     (BILLING_AVAILABLE in src/lib/billing/feature-flags.ts), not per-row
--     data, since during Beta it's true for every workspace uniformly.
--
-- Suggested state mapping for this feature's spec, for future reference:
--   beta_free / billing_unavailable  <= BILLING_AVAILABLE === false (global)
--   trial_active                     <= entitlements.status = 'trialing'
--   subscription_pending_confirmation<= future: founding_member_price_locked_at
--                                        is null at confirm-click, before a
--                                        webhook confirms the subscription
--   active_paid                      <= entitlements.status = 'active'
--   cancelled                        <= entitlements.status = 'cancelled'

alter table workspaces
  add column founding_member_eligible boolean not null default true;

comment on column workspaces.founding_member_eligible is
  'Whether this workspace is eligible for the founding-member rate when billing launches. Defaults true so all existing Beta workspaces and all new signups during the founding-member period are eligible; does not itself start billing. Permanent grandfathering enforcement (locking eligibility to a cutoff date) is intentionally not implemented yet — add when a real billing architecture (Stripe price IDs, checkout) is connected.';

alter table entitlements
  add column founding_member_price_locked_at timestamptz;

comment on column entitlements.founding_member_price_locked_at is
  'Set once, at the moment a user explicitly confirms a founding-member subscription after billing becomes available. Null today for every row — schema-only until real checkout is wired up (see TODO(billing-launch) in src/lib/pricing/founding-member.ts). Eligibility (workspaces.founding_member_eligible) must never be sufficient on its own to start billing; only an explicit confirm sets this.';

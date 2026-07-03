-- Entitlements: provider-neutral, server-authoritative subscription/trial state.
--
-- IMPORTANT: this targets the LIVE schema confirmed via information_schema on
-- 2026-07-03, not the stale supabase/schema.sql checked into the repo (which
-- still describes tables — e.g. client_profiles, support_relationships — that
-- do not exist in the running database). "module" values below are "adults"
-- and "gym" to match the existing workspaces.type enum values exactly
-- (confirmed live: actions.ts inserts type: "adults" / type: "gym"), even
-- though the customer-facing names are "Family" and "Coaching".
--
-- Apply this ONLY to a development/staging Supabase project. Do not run
-- against production.

create type entitlement_status as enum (
  'not_started',
  'trialing',
  'active',
  'past_due',
  'cancel_at_period_end',
  'expired',
  'cancelled'
);

create type entitlement_module as enum ('adults', 'gym');

create type payment_provider as enum ('stripe', 'razorpay');

create type billing_market as enum ('US', 'SG', 'AU', 'IN', 'INTL');

create type billing_interval as enum ('monthly', 'annual');

-- One row per (workspace, module). A workspace only ever has one module
-- (adults or gym, per workspaces.type), so in practice this is one row per
-- workspace — the module column is kept explicit per the spec and to allow
-- a single owner to hold both a family and a coaching workspace/entitlement.
create table entitlements (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  owner_id uuid not null references profiles(id) on delete cascade,
  module entitlement_module not null,

  status entitlement_status not null default 'not_started',

  trial_start_at timestamptz,
  trial_end_at timestamptz,

  subscription_start_at timestamptz,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  cancelled_at timestamptz,

  payment_provider payment_provider,
  provider_customer_id text,
  provider_subscription_id text,
  provider_price_id text,

  billing_country text,
  billing_market billing_market,
  currency text,
  billing_interval billing_interval,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (workspace_id, module)
);

create index entitlements_owner_id_idx on entitlements(owner_id);
create index entitlements_workspace_module_idx on entitlements(workspace_id, module);
create index entitlements_provider_subscription_idx on entitlements(provider_subscription_id)
  where provider_subscription_id is not null;

-- Reuses the update_updated_at() trigger function already defined in
-- supabase/schema.sql (also used by meals/workspaces/profiles).
create trigger entitlements_updated_at
  before update on entitlements
  for each row execute function update_updated_at();

-- Idempotent webhook processing: each provider event is recorded once and
-- only processed once, regardless of provider retry behavior.
create table payment_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider payment_provider not null,
  provider_event_id text not null,
  event_type text not null,
  payload jsonb not null,
  processed_at timestamptz,
  created_at timestamptz not null default now(),

  unique (provider, provider_event_id)
);

-- RLS: entitlements are server-authoritative. Owners may read their own
-- entitlement rows (to render trial/billing status); all writes happen via
-- the service-role client from server actions / webhook handlers, which
-- bypasses RLS, so no insert/update/delete policies are defined here.
alter table entitlements enable row level security;

create policy "Owners can view their own entitlements"
  on entitlements for select
  using (owner_id = auth.uid());

-- Webhook events are never read or written by end users.
alter table payment_webhook_events enable row level security;

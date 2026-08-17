-- Tistra Club — consumer coaching marketplace (Singapore MVP).
--
-- See docs/tistra-club-architecture.md for the decisions behind this
-- schema. The load-bearing ones:
--
--  * A coach is an EXISTING user. coach_profiles extends profiles(id) — the
--    same auth user who may already own a gym workspace. No parallel coach
--    identity, no duplicate user records (spec requirement).
--  * Money is integer cents with an explicit currency, never float.
--  * Enum-like columns are text + check constraints, matching this repo's
--    convention (see 0013's note on native enums being painful to alter).
--  * Internal tables are RLS-enabled with no policies: only the
--    service-role client (server actions / API routes) touches them.
--
-- Conventions inherited: uuid pk default gen_random_uuid(), timestamptz,
-- created_at/updated_at, soft-delete via archived_at where a row is
-- user-authored content.

-- Exclusion constraints on time ranges (see booking_slot_locks below) need
-- gist indexing over both a uuid and a range.
create extension if not exists btree_gist;

-- ---------------------------------------------------------------------
-- 1. Skills taxonomy (data-driven — never hardcoded in UI, per spec)
-- ---------------------------------------------------------------------

create table club_skills (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  category text not null default 'movement',
  image_url text,
  /** Display order in discovery; ties broken by name. */
  sort_order integer not null default 100,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index club_skills_active_idx on club_skills (is_active, sort_order) where is_active;

-- ---------------------------------------------------------------------
-- 2. Coach profile, skills, media, credentials, verification
-- ---------------------------------------------------------------------

create table coach_profiles (
  id uuid primary key default gen_random_uuid(),
  /** THE reuse point: a coach is an existing auth user. Unique, so one
   * human has at most one coach profile while still being free to book as
   * a consumer with the same account. */
  profile_id uuid not null unique references profiles(id) on delete cascade,

  display_name text not null,
  headline text,
  bio text,
  photo_url text,
  cover_media_url text,
  languages jsonb not null default '["English"]'::jsonb,
  years_coaching integer,
  /** Free-text "who I love working with" — shown on the profile. */
  preferred_clients text,

  -- Marketplace lifecycle. 'published' is the only publicly visible state,
  -- and publishing is gated on onboarding completeness (enforced in the
  -- publish action, not here — the check needs to read related tables).
  status text not null default 'draft' check (status in ('draft', 'published', 'paused', 'suspended')),
  published_at timestamptz,

  -- Identity and credential verification are tracked SEPARATELY and must
  -- never be conflated in UI: verifying who someone is says nothing about
  -- whether they're qualified (spec requirement).
  identity_verification_status text not null default 'unsubmitted'
    check (identity_verification_status in ('unsubmitted', 'pending', 'verified', 'rejected', 'expired')),
  credential_verification_status text not null default 'unsubmitted'
    check (credential_verification_status in ('unsubmitted', 'pending', 'verified', 'rejected', 'expired')),

  -- Stripe Connect. Booking is only allowed once payouts are enabled.
  stripe_account_id text unique,
  stripe_onboarding_status text not null default 'not_started'
    check (stripe_onboarding_status in ('not_started', 'pending', 'restricted', 'enabled', 'disabled')),
  stripe_payouts_enabled boolean not null default false,

  -- Denormalized rollups, recomputed on review/booking write. Reading these
  -- keeps discovery from aggregating over every review on every request.
  rating_average numeric(3, 2),
  review_count integer not null default 0,
  session_count integer not null default 0,

  -- Cancellation policy defaults; snapshotted onto each booking so a later
  -- policy change never rewrites history (spec requirement).
  cancellation_full_refund_hours integer not null default 24,
  cancellation_partial_refund_percent integer not null default 50
    check (cancellation_partial_refund_percent between 0 and 100),

  -- Scheduling guardrails, all coach-configurable.
  buffer_before_minutes integer not null default 0,
  buffer_after_minutes integer not null default 15,
  min_notice_hours integer not null default 12,
  max_advance_days integer not null default 60,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index coach_profiles_published_idx on coach_profiles (status, rating_average desc nulls last)
  where status = 'published';

create table coach_skills (
  id uuid primary key default gen_random_uuid(),
  coach_profile_id uuid not null references coach_profiles(id) on delete cascade,
  skill_id uuid not null references club_skills(id) on delete cascade,
  /** What level of client this coach takes for THIS skill. */
  experience_levels jsonb not null default '["beginner","intermediate"]'::jsonb,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  unique (coach_profile_id, skill_id)
);

create index coach_skills_skill_idx on coach_skills (skill_id);

create table coach_media (
  id uuid primary key default gen_random_uuid(),
  coach_profile_id uuid not null references coach_profiles(id) on delete cascade,
  media_type text not null check (media_type in ('image', 'video')),
  /** Storage path in the private coach-media bucket — resolved to a signed
   * URL server-side, same pattern as meal-photos (migration 0040). */
  storage_path text not null,
  thumbnail_path text,
  caption text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index coach_media_coach_idx on coach_media (coach_profile_id, sort_order);

create table coach_credentials (
  id uuid primary key default gen_random_uuid(),
  coach_profile_id uuid not null references coach_profiles(id) on delete cascade,
  title text not null,
  issuing_organization text,
  issued_on date,
  expires_on date,
  /** Private by default and never publicly downloadable (spec): the
   * document is only ever fetched by admins during review. Only the title
   * and verification outcome are public. */
  document_storage_path text,
  verification_status text not null default 'unsubmitted'
    check (verification_status in ('unsubmitted', 'pending', 'verified', 'rejected', 'expired')),
  reviewed_by uuid references profiles(id),
  reviewed_at timestamptz,
  review_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 3. Services
-- ---------------------------------------------------------------------

create table coach_services (
  id uuid primary key default gen_random_uuid(),
  coach_profile_id uuid not null references coach_profiles(id) on delete cascade,
  skill_id uuid references club_skills(id) on delete set null,
  name text not null,
  description text,
  duration_minutes integer not null check (duration_minutes > 0),
  /** Integer cents, never float (spec). SGD for the Singapore MVP, but
   * stored explicitly so a second market needs no migration. */
  price_cents integer not null check (price_cents >= 0),
  currency text not null default 'SGD',
  max_participants integer not null default 1 check (max_participants >= 1),
  /** Which location modes this service can be delivered in — subset of
   * ('COACH_LOCATION','CLIENT_LOCATION','OUTDOOR','ONLINE'). */
  allowed_location_types jsonb not null default '["COACH_LOCATION"]'::jsonb,
  travel_enabled boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index coach_services_coach_idx on coach_services (coach_profile_id) where is_active;

-- ---------------------------------------------------------------------
-- 4. Locations and travel
-- ---------------------------------------------------------------------

create table coach_locations (
  id uuid primary key default gen_random_uuid(),
  coach_profile_id uuid not null references coach_profiles(id) on delete cascade,
  label text not null,
  location_type text not null default 'COACH_LOCATION'
    check (location_type in ('COACH_LOCATION', 'OUTDOOR', 'ONLINE')),

  -- Structured geography. Coordinates are persisted, not just place names
  -- (spec) — travel-time and distance need lat/lng, and place names drift.
  address_line text,
  neighbourhood text,
  postal_code text,
  country_code text not null default 'SG',
  latitude numeric(9, 6),
  longitude numeric(9, 6),
  place_id text,

  /** A coach's home studio must not leak. When false (the default), public
   * discovery shows only the neighbourhood and an approximate distance;
   * the exact address is released to a client only once their booking is
   * CONFIRMED. See resolveBookingAddress(). */
  address_is_public boolean not null default false,
  is_primary boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index coach_locations_coach_idx on coach_locations (coach_profile_id) where is_active;

create table coach_travel_rules (
  id uuid primary key default gen_random_uuid(),
  coach_profile_id uuid not null references coach_profiles(id) on delete cascade,
  travel_enabled boolean not null default false,
  /** Origin the radius is measured from; defaults to the primary location. */
  origin_location_id uuid references coach_locations(id) on delete set null,
  max_travel_km numeric(6, 2) not null default 10,
  /** Extra minutes the coach wants on top of computed travel time. */
  travel_buffer_minutes integer not null default 15,
  /** Distance-banded fees as configurable rules rather than hardcoded
   * logic (spec): [{ "uptoKm": 3, "feeCents": 0 }, { "uptoKm": 7,
   * "feeCents": 1000 }, { "uptoKm": 12, "feeCents": 2000 }] — first band
   * whose uptoKm >= distance wins; beyond the last band = out of range. */
  fee_bands jsonb not null default '[{"uptoKm":3,"feeCents":0},{"uptoKm":7,"feeCents":1000},{"uptoKm":12,"feeCents":2000}]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (coach_profile_id)
);

create table coach_service_areas (
  id uuid primary key default gen_random_uuid(),
  coach_profile_id uuid not null references coach_profiles(id) on delete cascade,
  /** Named Singapore neighbourhood/zone the coach will travel to, e.g.
   * "River Valley". Complements the radius: a coach may serve a listed
   * area that sits marginally outside their km radius. */
  area_name text not null,
  country_code text not null default 'SG',
  created_at timestamptz not null default now(),
  unique (coach_profile_id, area_name)
);

-- ---------------------------------------------------------------------
-- 5. Availability
-- ---------------------------------------------------------------------

create table coach_availability_rules (
  id uuid primary key default gen_random_uuid(),
  coach_profile_id uuid not null references coach_profiles(id) on delete cascade,
  /** 0 = Sunday .. 6 = Saturday, in the coach's timezone. */
  weekday integer not null check (weekday between 0 and 6),
  start_minute integer not null check (start_minute between 0 and 1439),
  end_minute integer not null check (end_minute between 1 and 1440),
  /** Restrict this working block to one location (e.g. studio mornings,
   * travel afternoons). Null = any of the coach's locations. */
  location_id uuid references coach_locations(id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  check (end_minute > start_minute)
);

create index coach_availability_rules_coach_idx on coach_availability_rules (coach_profile_id, weekday) where is_active;

create table coach_availability_exceptions (
  id uuid primary key default gen_random_uuid(),
  coach_profile_id uuid not null references coach_profiles(id) on delete cascade,
  /** Absolute instants, not local times: an exception crossing midnight or
   * a DST boundary must remain unambiguous. */
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  /** 'blocked' removes availability; 'extra' adds it outside normal hours. */
  exception_type text not null default 'blocked' check (exception_type in ('blocked', 'extra')),
  reason text,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create index coach_availability_exceptions_coach_idx on coach_availability_exceptions (coach_profile_id, starts_at);

create table calendar_connections (
  id uuid primary key default gen_random_uuid(),
  coach_profile_id uuid not null references coach_profiles(id) on delete cascade,
  provider text not null default 'google' check (provider in ('google')),
  provider_account_email text,
  /** Encrypted at the application layer before insert — never logged, never
   * returned to any client (spec). */
  access_token_encrypted text,
  refresh_token_encrypted text,
  token_expires_at timestamptz,
  /** Which calendar to read busy blocks from / write confirmed sessions to. */
  calendar_id text,
  write_bookings_enabled boolean not null default false,
  sync_status text not null default 'connected'
    check (sync_status in ('connected', 'needs_reauth', 'revoked', 'error')),
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (coach_profile_id, provider)
);

-- ---------------------------------------------------------------------
-- 6. Bookings — holds, state machine, locations
-- ---------------------------------------------------------------------

create table bookings (
  id uuid primary key default gen_random_uuid(),
  coach_profile_id uuid not null references coach_profiles(id) on delete restrict,
  /** The consumer — an ordinary auth user, same as a coach (ADR-001). */
  client_profile_id uuid not null references profiles(id) on delete restrict,
  service_id uuid references coach_services(id) on delete set null,
  skill_id uuid references club_skills(id) on delete set null,

  starts_at timestamptz not null,
  ends_at timestamptz not null,
  timezone text not null default 'Asia/Singapore',

  -- Proper state machine, never scattered booleans (spec).
  status text not null default 'PAYMENT_PENDING' check (status in (
    'PAYMENT_PENDING', 'CONFIRMED', 'COMPLETED',
    'CANCELLED_BY_CLIENT', 'CANCELLED_BY_COACH',
    'NO_SHOW_CLIENT', 'NO_SHOW_COACH',
    'REFUND_PENDING', 'REFUNDED'
  )),

  -- Price snapshot: service pricing may change later; what was agreed at
  -- booking time is what governs this booking and its refunds.
  price_cents integer not null check (price_cents >= 0),
  travel_fee_cents integer not null default 0 check (travel_fee_cents >= 0),
  currency text not null default 'SGD',
  /** Cancellation terms frozen at booking time (spec). */
  cancellation_policy_snapshot jsonb not null default '{}'::jsonb,

  client_note text,
  cancelled_at timestamptz,
  cancellation_reason text,
  completed_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create index bookings_coach_time_idx on bookings (coach_profile_id, starts_at);
create index bookings_client_idx on bookings (client_profile_id, starts_at desc);

create table booking_locations (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references bookings(id) on delete cascade,
  location_type text not null check (location_type in ('COACH_LOCATION', 'CLIENT_LOCATION', 'OUTDOOR', 'ONLINE')),
  /** Set for COACH_LOCATION/OUTDOOR bookings at one of the coach's places. */
  coach_location_id uuid references coach_locations(id) on delete set null,
  -- Client-supplied address (CLIENT_LOCATION). Released to the coach on
  -- CONFIRMED and redacted again if the booking is cancelled.
  address_line text,
  neighbourhood text,
  postal_code text,
  country_code text not null default 'SG',
  latitude numeric(9, 6),
  longitude numeric(9, 6),
  place_id text,
  online_join_url text,
  created_at timestamptz not null default now()
);

create table booking_status_history (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings(id) on delete cascade,
  from_status text,
  to_status text not null,
  /** Null for system transitions (webhook confirmation, expiry sweeps). */
  actor_profile_id uuid references profiles(id),
  actor_kind text not null default 'system' check (actor_kind in ('client', 'coach', 'admin', 'system')),
  reason text,
  created_at timestamptz not null default now()
);

create index booking_status_history_booking_idx on booking_status_history (booking_id, created_at);

create table booking_holds (
  id uuid primary key default gen_random_uuid(),
  coach_profile_id uuid not null references coach_profiles(id) on delete cascade,
  client_profile_id uuid not null references profiles(id) on delete cascade,
  service_id uuid references coach_services(id) on delete set null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  /** Server-controlled (spec) — a client cannot extend its own hold. */
  expires_at timestamptz not null,
  /** Set once checkout starts, so a webhook can find the hold it belongs to. */
  stripe_payment_intent_id text,
  released_at timestamptz,
  booking_id uuid references bookings(id) on delete set null,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create index booking_holds_live_idx on booking_holds (coach_profile_id, expires_at)
  where released_at is null and booking_id is null;

-- The double-booking guarantee (ADR-006).
--
-- Application-level "is this slot free?" checks are read-then-write races:
-- two concurrent checkouts can both read "free" and both insert. This table
-- makes the database itself refuse the second writer. Every live hold AND
-- every non-terminal booking inserts a lock row here; the exclusion
-- constraint rejects any overlapping range for the same coach.
--
-- Rows are deleted when a hold expires/releases or a booking reaches a
-- terminal state, which is what frees the slot again.
create table booking_slot_locks (
  id uuid primary key default gen_random_uuid(),
  coach_profile_id uuid not null references coach_profiles(id) on delete cascade,
  slot tstzrange not null,
  hold_id uuid references booking_holds(id) on delete cascade,
  booking_id uuid references bookings(id) on delete cascade,
  created_at timestamptz not null default now(),
  -- Exactly one owner: a lock belongs to a hold or to a booking.
  check ((hold_id is null) <> (booking_id is null)),
  constraint booking_slot_locks_no_overlap
    exclude using gist (coach_profile_id with =, slot with &&)
);

-- ---------------------------------------------------------------------
-- 7. Payment ledger (internal source of truth, not derived from Stripe)
-- ---------------------------------------------------------------------

create table club_payments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings(id) on delete restrict,
  coach_profile_id uuid not null references coach_profiles(id) on delete restrict,
  client_profile_id uuid not null references profiles(id) on delete restrict,

  -- All integer cents. gross = coach_amount + platform_fee (+ travel fee,
  -- which belongs to the coach).
  gross_amount_cents integer not null check (gross_amount_cents >= 0),
  platform_fee_cents integer not null default 0 check (platform_fee_cents >= 0),
  coach_amount_cents integer not null check (coach_amount_cents >= 0),
  currency text not null default 'SGD',
  /** The percentage actually applied, snapshotted — the configured platform
   * fee may change, but historical rows must stay explainable. */
  platform_fee_percent numeric(5, 2) not null default 0,

  stripe_payment_intent_id text unique,
  stripe_charge_id text,
  stripe_connected_account_id text,

  status text not null default 'pending' check (status in (
    'pending', 'succeeded', 'failed', 'refunded', 'partially_refunded'
  )),
  paid_at timestamptz,
  failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index club_payments_booking_idx on club_payments (booking_id);
create index club_payments_coach_idx on club_payments (coach_profile_id, created_at desc);

create table club_refunds (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references club_payments(id) on delete restrict,
  booking_id uuid not null references bookings(id) on delete restrict,
  amount_cents integer not null check (amount_cents > 0),
  currency text not null default 'SGD',
  reason text not null default 'requested_by_customer',
  /** Which policy rule produced this amount, for support/audit. */
  policy_applied text,
  stripe_refund_id text unique,
  status text not null default 'pending' check (status in ('pending', 'succeeded', 'failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 8. Relationship, reviews, favourites
-- ---------------------------------------------------------------------

create table coach_client_relationships (
  id uuid primary key default gen_random_uuid(),
  coach_profile_id uuid not null references coach_profiles(id) on delete cascade,
  client_profile_id uuid not null references profiles(id) on delete cascade,
  first_booking_at timestamptz,
  last_session_at timestamptz,
  session_count integer not null default 0,
  status text not null default 'active' check (status in ('active', 'dormant', 'ended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (coach_profile_id, client_profile_id)
);

create table club_reviews (
  id uuid primary key default gen_random_uuid(),
  /** One review per booking (spec) — updatable, but never duplicated. */
  booking_id uuid not null unique references bookings(id) on delete cascade,
  coach_profile_id uuid not null references coach_profiles(id) on delete cascade,
  client_profile_id uuid not null references profiles(id) on delete cascade,
  rating integer not null check (rating between 1 and 5),
  body text,
  /** e.g. ["Great for beginners","Clear explanations"] */
  tags jsonb not null default '[]'::jsonb,
  moderation_status text not null default 'published'
    check (moderation_status in ('published', 'pending', 'hidden', 'removed')),
  moderated_by uuid references profiles(id),
  moderated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index club_reviews_coach_idx on club_reviews (coach_profile_id, created_at desc)
  where moderation_status = 'published';

create table favourite_coaches (
  id uuid primary key default gen_random_uuid(),
  client_profile_id uuid not null references profiles(id) on delete cascade,
  coach_profile_id uuid not null references coach_profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (client_profile_id, coach_profile_id)
);

-- ---------------------------------------------------------------------
-- 9. Sessions, progress, homework (P1 — schema now so bookings can
--    reference them without a follow-up migration)
-- ---------------------------------------------------------------------

create table session_notes (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references bookings(id) on delete cascade,
  coach_profile_id uuid not null references coach_profiles(id) on delete cascade,
  client_profile_id uuid not null references profiles(id) on delete cascade,
  /** Coach-only working notes — never shown to the client. */
  private_notes text,
  /** Explicitly shared with the client. */
  shared_summary text,
  suggested_next_session text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table session_skills (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings(id) on delete cascade,
  skill_id uuid not null references club_skills(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (booking_id, skill_id)
);

create table homework (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references bookings(id) on delete set null,
  coach_profile_id uuid not null references coach_profiles(id) on delete cascade,
  client_profile_id uuid not null references profiles(id) on delete cascade,
  title text not null,
  detail text,
  due_on date,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table skill_goals (
  id uuid primary key default gen_random_uuid(),
  client_profile_id uuid not null references profiles(id) on delete cascade,
  coach_profile_id uuid references coach_profiles(id) on delete set null,
  skill_id uuid not null references club_skills(id) on delete cascade,
  title text not null,
  /** Not every skill has numeric progression (spec). */
  progress_type text not null default 'milestone'
    check (progress_type in ('numeric', 'milestone', 'freeform')),
  target_numeric numeric(10, 2),
  target_unit text,
  /** Ordered milestone names for progress_type='milestone', e.g.
   * ["wall hold","controlled kick-up","3 sec","5 sec","10 sec"]. */
  milestones jsonb not null default '[]'::jsonb,
  status text not null default 'active' check (status in ('active', 'achieved', 'paused', 'archived')),
  achieved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table skill_progress (
  id uuid primary key default gen_random_uuid(),
  skill_goal_id uuid not null references skill_goals(id) on delete cascade,
  booking_id uuid references bookings(id) on delete set null,
  recorded_by uuid not null references profiles(id),
  numeric_value numeric(10, 2),
  milestone_reached text,
  note text,
  recorded_at timestamptz not null default now()
);

create index skill_progress_goal_idx on skill_progress (skill_goal_id, recorded_at desc);

-- ---------------------------------------------------------------------
-- 10. Tistra Health sharing permission (opt-in, revocable, audited)
-- ---------------------------------------------------------------------

create table client_coach_permissions (
  id uuid primary key default gen_random_uuid(),
  client_profile_id uuid not null references profiles(id) on delete cascade,
  coach_profile_id uuid not null references coach_profiles(id) on delete cascade,
  /** Defaults OFF and is NEVER inferred from booking a coach (spec). */
  nutrition_summary_enabled boolean not null default false,
  granted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_profile_id, coach_profile_id)
);

-- PDPA: every change to a sensitive permission is auditable, append-only.
create table club_privacy_audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_profile_id uuid references profiles(id),
  subject_profile_id uuid references profiles(id),
  event_type text not null check (event_type in (
    'nutrition_sharing_granted', 'nutrition_sharing_revoked',
    'data_export_requested', 'account_deletion_requested',
    'coach_viewed_nutrition_summary'
  )),
  context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index club_privacy_audit_subject_idx on club_privacy_audit_events (subject_profile_id, created_at desc);

-- ---------------------------------------------------------------------
-- 11. Notifications + platform configuration
-- ---------------------------------------------------------------------

create table club_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_profile_id uuid not null references profiles(id) on delete cascade,
  event_type text not null,
  title text not null,
  body text,
  /** Deep-link target within the app. */
  action_url text,
  context jsonb not null default '{}'::jsonb,
  channels_sent jsonb not null default '[]'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index club_notifications_recipient_idx on club_notifications (recipient_profile_id, created_at desc)
  where read_at is null;

-- Admin-controlled platform fee (spec: not hardcoded). A single live row is
-- expected; history is kept by inserting a new row with a later
-- effective_from rather than mutating the old one.
create table club_platform_fees (
  id uuid primary key default gen_random_uuid(),
  fee_percent numeric(5, 2) not null check (fee_percent >= 0 and fee_percent <= 100),
  effective_from timestamptz not null default now(),
  note text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Access control: every table above is internal. RLS on, no policies —
-- anon/authenticated keys get nothing; only the service-role client used by
-- server actions and API routes can read or write. Same posture as the
-- review console tables (migration 0013) and meal_reactions (0055).
-- ---------------------------------------------------------------------

alter table club_skills enable row level security;
alter table coach_profiles enable row level security;
alter table coach_skills enable row level security;
alter table coach_media enable row level security;
alter table coach_credentials enable row level security;
alter table coach_services enable row level security;
alter table coach_locations enable row level security;
alter table coach_travel_rules enable row level security;
alter table coach_service_areas enable row level security;
alter table coach_availability_rules enable row level security;
alter table coach_availability_exceptions enable row level security;
alter table calendar_connections enable row level security;
alter table bookings enable row level security;
alter table booking_locations enable row level security;
alter table booking_status_history enable row level security;
alter table booking_holds enable row level security;
alter table booking_slot_locks enable row level security;
alter table club_payments enable row level security;
alter table club_refunds enable row level security;
alter table coach_client_relationships enable row level security;
alter table club_reviews enable row level security;
alter table favourite_coaches enable row level security;
alter table session_notes enable row level security;
alter table session_skills enable row level security;
alter table homework enable row level security;
alter table skill_goals enable row level security;
alter table skill_progress enable row level security;
alter table client_coach_permissions enable row level security;
alter table club_privacy_audit_events enable row level security;
alter table club_notifications enable row level security;
alter table club_platform_fees enable row level security;

-- ---------------------------------------------------------------------
-- Seed: Singapore skill taxonomy (spec's initial categories) + the launch
-- platform fee. Skills are data, not code — UI reads this table.
-- ---------------------------------------------------------------------

insert into club_skills (slug, name, category, sort_order, description) values
  ('handstands', 'Handstands', 'movement', 10, 'Balance, alignment and freestanding handstand work.'),
  ('strength-training', 'Strength Training', 'strength', 20, 'Barbell, dumbbell and machine-based strength coaching.'),
  ('acrobatics', 'Acrobatics', 'movement', 30, 'Tumbling, partner acrobatics and aerial fundamentals.'),
  ('calisthenics', 'Calisthenics', 'strength', 40, 'Bodyweight strength, levers and skill progressions.'),
  ('mobility', 'Mobility', 'movement', 50, 'Range of motion, flexibility and joint health.'),
  ('pole', 'Pole', 'movement', 60, 'Pole fitness, spins, climbs and choreography.'),
  ('yoga', 'Yoga', 'mindbody', 70, 'Vinyasa, hatha and inversion-focused yoga practice.'),
  ('muay-thai', 'Muay Thai', 'martial-arts', 80, 'Technique, pad work and conditioning.'),
  ('boxing', 'Boxing', 'martial-arts', 90, 'Footwork, combinations and pad rounds.'),
  ('running', 'Running', 'endurance', 100, 'Gait, pacing and race preparation.'),
  ('swimming', 'Swimming', 'endurance', 110, 'Stroke technique and open-water confidence.'),
  ('tennis', 'Tennis', 'sport', 120, 'Groundstrokes, serve and match play.'),
  ('older-adult-strength', 'Older Adult Strength', 'strength', 130, 'Safe strength and balance work for healthy ageing.'),
  ('personal-training', 'Personal Training', 'strength', 140, 'General one-to-one fitness coaching.')
on conflict (slug) do nothing;

insert into club_platform_fees (fee_percent, note)
  values (15.00, 'Singapore MVP launch fee');

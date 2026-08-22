-- Booking for someone else, and discounted class packs.
--
-- APPLY THIS WHOLE FILE IN ONE GO. Migration 0060 was applied in halves —
-- the column landed with its default and the UPDATE did not — which put
-- fabricated coaches on the live marketplace and looked like it had worked.
-- Every statement here is idempotent, so re-running it is safe.

-- ---------------------------------------------------------------------
-- 1. People a client books for (their child, parent, partner)
-- ---------------------------------------------------------------------
-- Saved and reusable: a parent booking weekly should pick "Maya", not
-- retype her every time. Deliberately NOT an auth user — an eight-year-old
-- does not need a login, and an attendee never pays, cancels or is
-- notified. The booker remains the payer and owns refunds.
create table if not exists club_attendees (
  id uuid primary key default gen_random_uuid(),
  client_profile_id uuid not null references profiles(id) on delete cascade,
  full_name text not null check (length(trim(full_name)) > 0),
  -- Free text rather than an enum: "grandson", "mother-in-law" and
  -- "training partner" are all real answers and none of them are ours to
  -- refuse.
  relationship text,
  date_of_birth date,
  notes text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists club_attendees_client_idx
  on club_attendees (client_profile_id) where deleted_at is null;

alter table bookings
  add column if not exists attendee_id uuid references club_attendees(id) on delete set null;

-- Snapshot, for the same reason price_cents is snapshotted on the booking:
-- who attended is a fact about that session and must survive the attendee
-- later being renamed or removed.
alter table bookings
  add column if not exists attendee_name text;

comment on column bookings.attendee_id is
  'Who the session is for, when that is not the person who booked. Null means the booker attends.';

-- ---------------------------------------------------------------------
-- 2. Class packs
-- ---------------------------------------------------------------------
-- A coach offers 5, 10 or 20 of one service at a lower per-class price.
create table if not exists coach_class_packs (
  id uuid primary key default gen_random_uuid(),
  coach_profile_id uuid not null references coach_profiles(id) on delete cascade,
  service_id uuid not null references coach_services(id) on delete cascade,
  class_count integer not null check (class_count in (5, 10, 20)),
  -- Total for the pack, not per class. Stored as charged so a later price
  -- change cannot rewrite what someone already bought.
  price_cents integer not null check (price_cents > 0),
  currency text not null default 'SGD',
  -- Unused credits are a liability; they need an end date.
  expires_after_days integer not null default 365 check (expires_after_days > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (service_id, class_count)
);

create index if not exists coach_class_packs_coach_idx
  on coach_class_packs (coach_profile_id) where is_active;

-- A purchased pack: the credits themselves.
create table if not exists club_pack_purchases (
  id uuid primary key default gen_random_uuid(),
  pack_id uuid references coach_class_packs(id) on delete set null,
  coach_profile_id uuid not null references coach_profiles(id) on delete restrict,
  client_profile_id uuid not null references profiles(id) on delete restrict,
  service_id uuid not null references coach_services(id) on delete restrict,

  classes_total integer not null check (classes_total > 0),
  classes_used integer not null default 0 check (classes_used >= 0),

  -- Charged once, upfront, exactly like a single booking: one destination
  -- charge, the coach paid immediately, the platform fee inclusive. The
  -- consequence is deliberate and worth stating — the coach holds money for
  -- sessions not yet delivered, so a refund after partial use comes out of
  -- their balance. See refundableCents().
  price_cents integer not null check (price_cents >= 0),
  platform_fee_cents integer not null default 0 check (platform_fee_cents >= 0),
  currency text not null default 'SGD',
  stripe_payment_intent_id text,

  status text not null default 'PENDING' check (status in (
    'PENDING', 'ACTIVE', 'EXPIRED', 'REFUNDED', 'CANCELLED'
  )),
  expires_at timestamptz,
  purchased_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- The invariant that stops a pack being spent twice.
  check (classes_used <= classes_total)
);

create index if not exists club_pack_purchases_client_idx
  on club_pack_purchases (client_profile_id, status);
create index if not exists club_pack_purchases_coach_idx
  on club_pack_purchases (coach_profile_id, status);

-- Which booking spent which credit. Without this a refund cannot tell how
-- many classes were actually taken, and a cancelled booking cannot return
-- its credit.
alter table bookings
  add column if not exists pack_purchase_id uuid references club_pack_purchases(id) on delete set null;

create index if not exists bookings_pack_idx on bookings (pack_purchase_id);

-- ---------------------------------------------------------------------
-- Access control
-- ---------------------------------------------------------------------
-- Same posture as every other club table (migration 0056): RLS on with no
-- policies, so anon and authenticated keys get nothing and only the
-- service-role client behind server actions and API routes can read or
-- write.
--
-- It matters more here than most. club_attendees holds children's names
-- and dates of birth, and club_pack_purchases is a wallet — anyone able to
-- write classes_used could spend or restore someone else's credits.
alter table club_attendees enable row level security;
alter table coach_class_packs enable row level security;
alter table club_pack_purchases enable row level security;

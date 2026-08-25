-- Founding coach offer: the first N bookings carry no platform commission.
--
-- The landing page has been promising this since the coach page was rebuilt;
-- until now checkout still applied the standard percentage to every booking,
-- so the promise would have been broken the first time one of the four live
-- coaches took money. This makes it real.
--
-- Two columns rather than one counter:
--
--   coach_profiles.founding_free_bookings  the allowance granted
--   club_payments.founding_free            whether THIS payment used one
--
-- Remaining is derived (allowance minus succeeded payments flagged
-- founding_free), never stored. A stored counter has to be decremented
-- somewhere, and every candidate moment is wrong: decrementing when checkout
-- opens loses allowance to abandoned carts, and decrementing on success
-- means a refund silently eats the coach's benefit. Deriving from money that
-- actually settled makes a refund hand the free booking back, which is what
-- a coach would expect.

-- Default 10, not 0: the offer is open to everyone signing up, so a new
-- coach must receive it without anyone remembering to grant it. Closing the
-- offer later is a one-line migration setting the default to 0 — coaches
-- who already hold an allowance keep it, which is exactly what the landing
-- page promises ("locked in from the day you publish").
alter table coach_profiles
  add column if not exists founding_free_bookings integer not null default 10;

comment on column coach_profiles.founding_free_bookings is
  'Bookings this coach may take with zero platform commission (founding offer). Remaining = this minus succeeded club_payments flagged founding_free.';

alter table club_payments
  add column if not exists founding_free boolean not null default false;

comment on column club_payments.founding_free is
  'True when this payment consumed one of the coach''s founding-offer free bookings. Set from the Stripe session metadata, so the ledger always matches the application_fee_amount Stripe actually took.';

-- The remaining-allowance check runs on every checkout, so the count it does
-- must not scan the table. Partial: only flagged rows are ever counted.
create index if not exists club_payments_founding_free_idx
  on club_payments (coach_profile_id) where founding_free;

-- Grant the offer to every coach who exists today. These are the founding
-- coaches the page is addressed to; demo profiles are excluded because they
-- never take real money and a free allowance on them would be meaningless.
-- Existing rows were created before the column had a default.
update coach_profiles
set founding_free_bookings = 10
where is_demo = false
  and founding_free_bookings = 0;

-- Demo profiles never take real money, so an allowance on them is noise.
update coach_profiles
set founding_free_bookings = 0
where is_demo = true;

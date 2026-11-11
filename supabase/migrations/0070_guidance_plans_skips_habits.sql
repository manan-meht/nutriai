-- ─── Guidance redesign, phase 2: planned meals, skipped meals, weekly habit ─
-- Three new tables, nothing else changed. Additive and safe to re-run.
--
-- 1. nutrition_meal_plans: "Plan this meal". A plan is an intention, never
--    intake: totals are computed from meal_logs alone, so a plan can't be
--    counted, and a plan that is then photographed can't be counted twice.
--    When a logged meal fills the planned slot the plan points at that
--    meal_logs row (meal_log_id); the meal's own estimate is what counts.
--    "Logged" is that link, not a status: if the meal is deleted the link
--    is set null and the plan is simply planned again. (A 'logged' status
--    with a check requiring the link made deleting such a meal fail.)
--
-- 2. nutrition_meal_skips: a meal the person confirmed they skipped. That is
--    different from a meal nobody logged: a day with its missing meals
--    confirmed skipped is complete, while an unlogged meal leaves the day
--    partial. Confirming a skip never adds or removes intake.
--
-- 3. nutrition_habits: the one change for the week. Chosen once and kept, so
--    the habit doesn't change with every photo. evidence holds the
--    observation that justified it (from meals before the week started),
--    so the card can say why without recomputing a different reason later.
--
-- Every table takes either an adults_contact_id or a gym_client_id, with a
-- check that exactly one is set, as 0069 did for the Guidance tables. RLS is
-- on with no policies: the service client writes, after the server has
-- checked who is asking (src/lib/guidance/authorization.ts).

-- Who did it, in the same values as 0069's consent channels: the first
-- three are the tracked person; caregiver and coach are the account holder
-- acting for them.

-- ─── 1. Planned meals ──────────────────────────────────────────────────────

create table if not exists nutrition_meal_plans (
  id uuid primary key default gen_random_uuid(),
  adults_contact_id uuid references adults_contacts (id) on delete cascade,
  gym_client_id uuid references gym_clients (id) on delete cascade,

  -- The person's local date and the meal it's for.
  local_date date not null,
  meal_slot text not null check (meal_slot in ('breakfast', 'lunch', 'snack', 'dinner')),

  -- The suggestion as shown: foods, portions (household measure and cooked
  -- grams), the estimated contribution and its source. A snapshot, so a
  -- later change to the suggestion engine doesn't rewrite what was planned.
  suggestion jsonb not null,
  suggestion_version text not null,

  -- planned   — the intention, counted nowhere. With meal_log_id set, a
  --             logged meal filled this slot.
  -- cancelled — replaced by another plan, or removed.
  status text not null default 'planned' check (status in ('planned', 'cancelled')),
  meal_log_id uuid references meal_logs (id) on delete set null,

  planned_via text not null check (planned_via in ('self_account', 'end_user_session', 'whatsapp', 'caregiver', 'coach')),
  planned_by_profile_id uuid references profiles (id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint nutrition_meal_plans_one_subject check ((adults_contact_id is null) <> (gym_client_id is null))
);

-- One live plan per person, day and meal. Replacing a plan cancels the old
-- one first, so these partial indexes are the guard, not an upsert target.
create unique index if not exists nutrition_meal_plans_one_live_adults_idx
  on nutrition_meal_plans (adults_contact_id, local_date, meal_slot)
  where adults_contact_id is not null and status <> 'cancelled';
create unique index if not exists nutrition_meal_plans_one_live_gym_idx
  on nutrition_meal_plans (gym_client_id, local_date, meal_slot)
  where gym_client_id is not null and status <> 'cancelled';
create index if not exists nutrition_meal_plans_meal_log_idx on nutrition_meal_plans (meal_log_id) where meal_log_id is not null;

alter table nutrition_meal_plans enable row level security;

comment on table nutrition_meal_plans is
  'A meal planned from a Guidance suggestion. Never a consumption record: only meal_logs is. meal_log_id links the meal that filled the slot, so the plan and the meal are never both counted; deleting that meal makes the plan planned again.';

-- ─── 2. Confirmed skipped meals ────────────────────────────────────────────

create table if not exists nutrition_meal_skips (
  id uuid primary key default gen_random_uuid(),
  adults_contact_id uuid references adults_contacts (id) on delete cascade,
  gym_client_id uuid references gym_clients (id) on delete cascade,
  local_date date not null,
  meal_slot text not null check (meal_slot in ('breakfast', 'lunch', 'snack', 'dinner')),
  confirmed_via text not null check (confirmed_via in ('self_account', 'end_user_session', 'whatsapp', 'caregiver', 'coach')),
  confirmed_by_profile_id uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now(),

  constraint nutrition_meal_skips_one_subject check ((adults_contact_id is null) <> (gym_client_id is null)),
  -- Plain unique constraints so a repeat tap is an upsert, not a duplicate.
  -- NULLs are distinct, so gym rows never collide on the adults column.
  constraint nutrition_meal_skips_adults_unique unique (adults_contact_id, local_date, meal_slot),
  constraint nutrition_meal_skips_gym_unique unique (gym_client_id, local_date, meal_slot)
);

alter table nutrition_meal_skips enable row level security;

comment on table nutrition_meal_skips is
  'A meal the person (or their caregiver or coach) confirmed was skipped. Distinct from unlogged: it completes the day for averaging, and adds no intake.';

-- ─── 3. The weekly habit ───────────────────────────────────────────────────

create table if not exists nutrition_habits (
  id uuid primary key default gen_random_uuid(),
  adults_contact_id uuid references adults_contacts (id) on delete cascade,
  gym_client_id uuid references gym_clients (id) on delete cascade,

  -- Local Monday of the week the habit is for, in the person's timezone.
  week_start date not null check (extract(isodow from week_start) = 1),

  -- A key into the habit catalogue in code (src/lib/guidance/habits.ts),
  -- and the catalogue version, so a reworded habit can be told apart.
  habit_key text not null,
  habit_version text not null,
  variant text not null default 'standard' check (variant in ('standard', 'easier')),

  -- The observation behind it, as computed when it was chosen.
  evidence jsonb not null default '{}'::jsonb,

  -- active   — this week's habit.
  -- replaced — swapped for another the same week ("Something easier",
  --            "Adjust"). Kept for the record.
  status text not null default 'active' check (status in ('active', 'replaced')),

  chosen_via text not null check (chosen_via in ('self_account', 'end_user_session', 'whatsapp', 'caregiver', 'coach')),
  chosen_by_profile_id uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint nutrition_habits_one_subject check ((adults_contact_id is null) <> (gym_client_id is null))
);

create unique index if not exists nutrition_habits_one_active_adults_idx
  on nutrition_habits (adults_contact_id, week_start)
  where adults_contact_id is not null and status = 'active';
create unique index if not exists nutrition_habits_one_active_gym_idx
  on nutrition_habits (gym_client_id, week_start)
  where gym_client_id is not null and status = 'active';

alter table nutrition_habits enable row level security;

comment on table nutrition_habits is
  'The one change a person chose for a week. Progress is computed from logged meals with a clear result for the habit; ambiguous meals are not counted as successes.';

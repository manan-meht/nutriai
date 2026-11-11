-- ─── Micronutrient estimates, confirmed facts and supplements ─────────────
-- Guidance redesign, phase 3. Additive only: six new tables, nothing
-- existing is altered. Safe to re-run.
--
-- Nothing writes to these tables unless GUIDANCE_MICRONUTRIENTS_ENABLED is
-- on (see src/lib/nutrients/flags.ts). Every table has RLS enabled and no
-- policies: like the Guidance tables (0068), they're read and written only
-- through the service client, after the app's own authorization checks.
--
-- Every table names its tracked person the way 0069 does: an
-- adults_contact_id or a gym_client_id, with a check that exactly one is
-- set.
--
-- Estimates never store a missing value as 0. The per-nutrient JSON keeps
-- each nutrient's state (value, zero, trace, unknown, partial), and the
-- per-food breakdown keeps the composition source and version, the grams
-- and how they were arrived at, and why the estimate is limited. See
-- src/lib/nutrients/meal-estimate.ts.

-- ─── 1. One current estimate per meal ──────────────────────────────────────

create table if not exists meal_nutrient_estimates (
  id uuid primary key default gen_random_uuid(),
  -- One row per meal, replaced in place when the meal is corrected or
  -- reanalysed, and removed with it.
  meal_log_id uuid not null unique references meal_logs (id) on delete cascade,
  adults_contact_id uuid references adults_contacts (id) on delete cascade,
  gym_client_id uuid references gym_clients (id) on delete cascade,

  -- Versions of everything the estimate was computed with, so it can be
  -- traced and recomputed: the calculation, the nutrient catalog, the
  -- standard recipes, and each composition source.
  calculation_version text not null,
  composition_versions jsonb not null default '{}'::jsonb,

  -- complete | partial | unknown, for the meal as a whole.
  status text not null check (status in ('complete', 'partial', 'unknown')),
  -- The whole estimate: items, components, per-nutrient states.
  estimate jsonb not null,

  -- Fingerprint of the inputs (foods, facts, products, versions). An
  -- ingestion that would produce the same estimate is skipped, which is
  -- what makes re-ingestion idempotent.
  input_hash text not null,

  -- What caused this computation.
  trigger text not null check (trigger in ('ingestion', 'correction', 'reanalysis', 'fact_change', 'backfill')),
  computed_at timestamptz not null default now(),

  constraint meal_nutrient_estimates_one_subject check (num_nonnulls(adults_contact_id, gym_client_id) = 1)
);

create index if not exists meal_nutrient_estimates_adults_idx on meal_nutrient_estimates (adults_contact_id) where adults_contact_id is not null;
create index if not exists meal_nutrient_estimates_gym_idx on meal_nutrient_estimates (gym_client_id) where gym_client_id is not null;

alter table meal_nutrient_estimates enable row level security;

comment on table meal_nutrient_estimates is
  'Current vitamin and mineral estimate per meal, from composition data (never model-generated values). Missing values are recorded as unknown, never 0. Replaced in place on correction or reanalysis; deleted with the meal.';

-- ─── 2. Household defaults ─────────────────────────────────────────────────
-- True of food made at home ("our milk is fortified"). Never applied to a
-- meal confirmed as eaten outside.

create table if not exists nutrition_household_facts (
  id uuid primary key default gen_random_uuid(),
  adults_contact_id uuid references adults_contacts (id) on delete cascade,
  gym_client_id uuid references gym_clients (id) on delete cascade,
  fact_key text not null check (fact_key in ('milk_fortified', 'iodised_salt', 'supplements_in_routine')),
  answer text not null check (answer in ('yes', 'no', 'unsure')),
  answered_by_profile_id uuid references profiles (id) on delete set null,
  answered_via text not null check (answered_via in ('self_account', 'end_user_session', 'whatsapp', 'caregiver', 'coach')),
  updated_at timestamptz not null default now(),

  constraint nutrition_household_facts_one_subject check (num_nonnulls(adults_contact_id, gym_client_id) = 1),
  constraint nutrition_household_facts_adults_key unique (adults_contact_id, fact_key),
  constraint nutrition_household_facts_gym_key unique (gym_client_id, fact_key)
);

alter table nutrition_household_facts enable row level security;

comment on table nutrition_household_facts is
  'Answers to clarifying questions that hold for food made at home. Kept apart from meal-specific facts: a household default never applies to a meal confirmed as eaten outside.';

-- ─── 3. Meal-specific confirmed facts ──────────────────────────────────────

create table if not exists meal_nutrient_facts (
  meal_log_id uuid primary key references meal_logs (id) on delete cascade,
  adults_contact_id uuid references adults_contacts (id) on delete cascade,
  gym_client_id uuid references gym_clients (id) on delete cascade,
  -- null = not known.
  eaten_outside boolean,
  milk_fortified text check (milk_fortified in ('yes', 'no', 'unsure')),
  -- [{ "itemName": "...", "productId": "<nutrition_confirmed_products.id>" }]
  products jsonb not null default '[]'::jsonb,
  confirmed_by_profile_id uuid references profiles (id) on delete set null,
  updated_at timestamptz not null default now(),

  constraint meal_nutrient_facts_one_subject check (num_nonnulls(adults_contact_id, gym_client_id) = 1)
);

alter table meal_nutrient_facts enable row level security;

comment on table meal_nutrient_facts is
  'Facts confirmed for one meal only (eaten outside, this milk was fortified, this item was a given product). Override household defaults for that meal and nothing else.';

-- ─── 4. Confirmed products ─────────────────────────────────────────────────
-- A brand's label values, confirmed by the person, reused whenever the
-- product is logged again.

create table if not exists nutrition_confirmed_products (
  id uuid primary key default gen_random_uuid(),
  adults_contact_id uuid references adults_contacts (id) on delete cascade,
  gym_client_id uuid references gym_clients (id) on delete cascade,
  name text not null check (length(name) between 1 and 200),
  brand text check (brand is null or length(brand) <= 200),
  basis text not null check (basis in ('per_100g', 'per_serving')),
  serving_grams numeric check (serving_grams is null or serving_grams > 0),
  -- Canonical units per nutrient key (see src/lib/nutrients/catalog.ts).
  -- A nutrient not on the label is absent, never 0.
  nutrients jsonb not null default '{}'::jsonb,
  source text not null check (source in ('label', 'user')),
  -- Lowercase names that identify the product in a meal analysis.
  match_names text[] not null default '{}',
  -- Storage path of the label photo, when there was one. Never logged.
  label_image_path text,
  confirmed_by_profile_id uuid references profiles (id) on delete set null,
  confirmed_at timestamptz not null default now(),

  constraint nutrition_confirmed_products_one_subject check (num_nonnulls(adults_contact_id, gym_client_id) = 1),
  constraint nutrition_confirmed_products_serving check (basis = 'per_100g' or serving_grams is not null)
);

create index if not exists nutrition_confirmed_products_adults_idx on nutrition_confirmed_products (adults_contact_id) where adults_contact_id is not null;
create index if not exists nutrition_confirmed_products_gym_idx on nutrition_confirmed_products (gym_client_id) where gym_client_id is not null;

alter table nutrition_confirmed_products enable row level security;

-- ─── 5. Supplements: schedules, and the doses actually taken ───────────────
-- A schedule says what someone means to take. It is never counted as
-- intake. Only a confirmed dose is, and a dose can be confirmed once per
-- schedule, day and slot, so it can't be double-counted.

create table if not exists supplement_schedules (
  id uuid primary key default gen_random_uuid(),
  adults_contact_id uuid references adults_contacts (id) on delete cascade,
  gym_client_id uuid references gym_clients (id) on delete cascade,
  name text not null check (length(name) between 1 and 200),
  brand text check (brand is null or length(brand) <= 200),
  -- Per dose, canonical units (see catalog.ts). Absent = not on the label.
  nutrients_per_dose jsonb not null default '{}'::jsonb,
  -- e.g. {"morning"} or {"morning","night"}.
  slots text[] not null default '{daily}',
  -- Local dates in the person's timezone; effective_to exclusive.
  effective_from date not null,
  effective_to date,
  source text not null check (source in ('label', 'user')),
  created_by_profile_id uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now(),

  constraint supplement_schedules_one_subject check (num_nonnulls(adults_contact_id, gym_client_id) = 1),
  constraint supplement_schedules_range check (effective_to is null or effective_to > effective_from),
  constraint supplement_schedules_slots check (cardinality(slots) between 1 and 6)
);

alter table supplement_schedules enable row level security;

create table if not exists supplement_doses (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references supplement_schedules (id) on delete cascade,
  adults_contact_id uuid references adults_contacts (id) on delete cascade,
  gym_client_id uuid references gym_clients (id) on delete cascade,
  -- The person's local date.
  taken_on date not null,
  slot text not null,
  -- Doses taken in this slot, e.g. 2 tablets. Usually 1.
  quantity numeric not null default 1 check (quantity > 0 and quantity <= 20),
  confirmed_by_profile_id uuid references profiles (id) on delete set null,
  confirmed_via text not null check (confirmed_via in ('self_account', 'end_user_session', 'whatsapp', 'caregiver', 'coach')),
  confirmed_at timestamptz not null default now(),

  constraint supplement_doses_one_subject check (num_nonnulls(adults_contact_id, gym_client_id) = 1),
  constraint supplement_doses_once_per_slot unique (schedule_id, taken_on, slot)
);

create index if not exists supplement_doses_adults_idx on supplement_doses (adults_contact_id, taken_on) where adults_contact_id is not null;
create index if not exists supplement_doses_gym_idx on supplement_doses (gym_client_id, taken_on) where gym_client_id is not null;

alter table supplement_doses enable row level security;

comment on table supplement_schedules is
  'What a person means to take. Never counted as intake: only supplement_doses are.';
comment on table supplement_doses is
  'Doses someone confirmed taking, once per schedule, day and slot.';

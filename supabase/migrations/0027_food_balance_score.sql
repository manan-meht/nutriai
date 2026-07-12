-- Food Balance Score feature (see @nutriai/health-scoring for the pure
-- scoring logic — this migration only adds the profile fields and
-- persistence tables it needs, per the "reuse existing fields, add only
-- what's missing" instruction).
--
-- Profile fields: adults_contacts/gym_clients already have age, gender,
-- weight_kg, height_cm (see packages/nutrition-core/src/types.ts) — reused
-- as-is, not duplicated here. Only the fields the Food Balance Score
-- specifically needs and that don't already exist are added: date of birth
-- (more precise than the existing integer age), the metabolic-equation sex
-- (explicitly separate from "gender" — never inferred from name/pronouns),
-- activity level, resistance-training status, preferred units, a single
-- primary body-composition goal, and an optional target weight. The
-- existing `goals` jsonb array (AdultsGoal/GymClientGoal) is a different,
-- pre-existing concept (per-goal protein/calorie targets an admin/caregiver
-- sets) and is left untouched.

alter table adults_contacts
  add column if not exists date_of_birth date,
  add column if not exists metabolic_equation_sex text check (metabolic_equation_sex in ('male', 'female')),
  add column if not exists activity_level text check (activity_level in ('mostly_sitting', 'lightly_active', 'moderately_active', 'very_active', 'unknown')),
  add column if not exists resistance_training_status text check (resistance_training_status in ('regularly', 'sometimes', 'not_currently', 'unknown')),
  add column if not exists preferred_units text check (preferred_units in ('metric', 'imperial')) default 'metric',
  add column if not exists primary_nutrition_goal text check (primary_nutrition_goal in ('reduce_weight', 'reduce_body_fat', 'gain_muscle', 'body_recomposition', 'maintain_weight', 'improve_nutrition')),
  add column if not exists target_weight_kg numeric;

alter table gym_clients
  add column if not exists date_of_birth date,
  add column if not exists metabolic_equation_sex text check (metabolic_equation_sex in ('male', 'female')),
  add column if not exists activity_level text check (activity_level in ('mostly_sitting', 'lightly_active', 'moderately_active', 'very_active', 'unknown')),
  add column if not exists resistance_training_status text check (resistance_training_status in ('regularly', 'sometimes', 'not_currently', 'unknown')),
  add column if not exists preferred_units text check (preferred_units in ('metric', 'imperial')) default 'metric',
  add column if not exists primary_nutrition_goal text check (primary_nutrition_goal in ('reduce_weight', 'reduce_body_fat', 'gain_muscle', 'body_recomposition', 'maintain_weight', 'improve_nutrition')),
  add column if not exists target_weight_kg numeric;

-- Optional standalone weight-trend entries. `biomarker_logs` already
-- captures weight (weight_kg column, confirmed via packages/nutrition-core),
-- but it's a gym-only, coach-entered table; this is deliberately separate so
-- self/family users (adults product, no biomarker_logs rows) can log weight
-- for calibration too, and is keyed generically rather than to a specific
-- product's contact table.
create table if not exists food_balance_weight_entries (
  id uuid primary key default uuid_generate_v4(),
  contact_id uuid, -- references adults_contacts(id) OR gym_clients(id), not enforced by FK since it's polymorphic
  contact_type text not null check (contact_type in ('adults_contact', 'gym_client')),
  weight_kg numeric not null,
  measured_at timestamptz not null,
  source text not null default 'manual' check (source in ('manual', 'biomarker_log')),
  created_at timestamptz not null default now()
);

create index if not exists food_balance_weight_entries_contact_idx
  on food_balance_weight_entries (contact_id, contact_type, measured_at desc);

-- One row per calculated Food Balance Score, keeping enough to explain and
-- reproduce how a score was produced without duplicating raw meal data.
create table if not exists food_balance_score_snapshots (
  id uuid primary key default uuid_generate_v4(),
  contact_id uuid not null,
  contact_type text not null check (contact_type in ('adults_contact', 'gym_client')),
  raw_score numeric,
  displayed_score integer,
  food_foundation_score numeric,
  goal_alignment_score numeric,
  component_scores_json jsonb not null default '{}'::jsonb,
  confidence numeric not null default 0,
  status text not null check (status in ('collecting_data', 'refreshing_data', 'foundation_only', 'partially_personalized', 'fully_personalized')),
  recommendation_ids_json jsonb not null default '[]'::jsonb,
  scoring_version text not null,
  scoring_window_start timestamptz,
  scoring_window_end timestamptz,
  calculated_at timestamptz not null default now()
);

create index if not exists food_balance_score_snapshots_contact_idx
  on food_balance_score_snapshots (contact_id, contact_type, calculated_at desc);

-- History of calorie-range calibrations driven by weight trends, so any
-- change to a user's estimated energy range is explainable and reversible
-- (see @nutriai/health-scoring's WEIGHT_CALIBRATION_CONFIG — the actual
-- calibration job is a documented follow-up, not implemented in this pass).
create table if not exists food_balance_energy_calibrations (
  id uuid primary key default uuid_generate_v4(),
  contact_id uuid not null,
  contact_type text not null check (contact_type in ('adults_contact', 'gym_client')),
  previous_lower_kcal numeric not null,
  previous_upper_kcal numeric not null,
  new_lower_kcal numeric not null,
  new_upper_kcal numeric not null,
  reason text not null,
  confidence numeric not null,
  scoring_version text not null,
  created_at timestamptz not null default now()
);

create index if not exists food_balance_energy_calibrations_contact_idx
  on food_balance_energy_calibrations (contact_id, contact_type, created_at desc);

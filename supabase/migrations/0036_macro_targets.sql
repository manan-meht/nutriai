-- Macro targets (calories/protein/carbs/fat/fiber) expand the existing
-- protein-only Food Balance targets. Tistra's recommendation is always
-- computed live from goals + profile data (see
-- @nutriai/health-scoring's calculateMacroTargets) — never persisted.
-- Only a user's (or coach's) manual override is stored here, as a single
-- jsonb blob shaped like the app's MacroTargets["calories"/"protein"/...]
-- values (min/target/max/unit), keyed by macro. Null means "no override —
-- use Tistra's recommendation".
alter table public.adults_contacts
  add column if not exists custom_macro_targets jsonb,
  add column if not exists macro_targets_customized_at timestamptz;

alter table public.gym_clients
  add column if not exists custom_macro_targets jsonb,
  add column if not exists macro_targets_customized_at timestamptz;

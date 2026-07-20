-- Multiple nutrition goals per person, replacing the single
-- primary_nutrition_goal scalar. Kept as a new array column rather than
-- altering the existing one in place, so existing rows aren't destructively
-- rewritten and the old column stays available during rollout — the app
-- code now reads/writes nutrition_goals exclusively; primary_nutrition_goal
-- is backfilled once here for reference and can be dropped in a later
-- migration once this has been live a while.
alter table adults_contacts
  add column if not exists nutrition_goals text[] not null default '{}';

alter table gym_clients
  add column if not exists nutrition_goals text[] not null default '{}';

update adults_contacts
  set nutrition_goals = array[primary_nutrition_goal]
  where primary_nutrition_goal is not null and nutrition_goals = '{}';

update gym_clients
  set nutrition_goals = array[primary_nutrition_goal]
  where primary_nutrition_goal is not null and nutrition_goals = '{}';

-- Same allowed values as the old primary_nutrition_goal check constraint,
-- enforced per-element via a function since Postgres has no native
-- CHECK-per-array-element syntax.
create or replace function nutrition_goals_are_valid(goals text[])
returns boolean as $$
  select goals <@ array['reduce_weight', 'reduce_body_fat', 'gain_muscle', 'body_recomposition', 'maintain_weight', 'improve_nutrition', 'healthy_aging']::text[];
$$ language sql immutable;

alter table adults_contacts
  add constraint adults_contacts_nutrition_goals_valid check (nutrition_goals_are_valid(nutrition_goals));

alter table gym_clients
  add constraint gym_clients_nutrition_goals_valid check (nutrition_goals_are_valid(nutrition_goals));

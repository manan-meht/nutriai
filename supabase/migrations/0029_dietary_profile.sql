-- Dietary pattern profile — condition-agnostic food-balance recommendations
-- that adapt to what a person actually eats, without assigning them an
-- identity label. Default posture is "plant-based until observed
-- otherwise": a brand-new profile gets plant-based protein suggestions
-- (dal, beans, tofu, ...), not a "vegan" label — animal-food categories
-- (dairy, eggs, chicken, fish, meat) only unlock in recommendations once
-- they're actually observed in logged meals (high confidence only — see
-- src/lib/dietary-profile/update.ts) or explicitly chosen by the user via
-- the "Food preferences" editor. Explicit choices always win over
-- inference (see src/lib/dietary-profile/preferences.ts).
--
-- Single jsonb column rather than ~20 flat columns: this is genuinely
-- composite, mirrors the reminder_times/component_scores_json jsonb
-- precedent (0016_meal_reminders.sql, 0027_food_balance_score.sql) for
-- structured per-feature data, and keeps the observed_*/explicit_* pairs
-- (which always travel together) atomic to read/write in one round trip.
-- Applied to both adults_contacts and gym_clients, matching every other
-- per-person profile field in this schema.
alter table adults_contacts
  add column if not exists dietary_profile jsonb not null default '{
    "observed_dairy": false,
    "observed_lactose_dairy": false,
    "observed_lactose_free_dairy": false,
    "observed_eggs": false,
    "observed_chicken": false,
    "observed_fish": false,
    "observed_shellfish": false,
    "observed_red_meat": false,
    "observed_pork": false,
    "observed_other_meat": false,
    "inferred_pattern": "unknown",
    "explicit_vegetarian": false,
    "explicit_vegan": false,
    "explicit_avoids_dairy": false,
    "explicit_avoids_lactose": false,
    "explicit_avoids_eggs": false,
    "explicit_avoids_chicken": false,
    "explicit_avoids_fish": false,
    "explicit_avoids_red_meat": false,
    "explicit_avoids_pork": false,
    "prefers_plant_based_suggestions": false,
    "last_updated_at": null
  }'::jsonb;

alter table gym_clients
  add column if not exists dietary_profile jsonb not null default '{
    "observed_dairy": false,
    "observed_lactose_dairy": false,
    "observed_lactose_free_dairy": false,
    "observed_eggs": false,
    "observed_chicken": false,
    "observed_fish": false,
    "observed_shellfish": false,
    "observed_red_meat": false,
    "observed_pork": false,
    "observed_other_meat": false,
    "inferred_pattern": "unknown",
    "explicit_vegetarian": false,
    "explicit_vegan": false,
    "explicit_avoids_dairy": false,
    "explicit_avoids_lactose": false,
    "explicit_avoids_eggs": false,
    "explicit_avoids_chicken": false,
    "explicit_avoids_fish": false,
    "explicit_avoids_red_meat": false,
    "explicit_avoids_pork": false,
    "prefers_plant_based_suggestions": false,
    "last_updated_at": null
  }'::jsonb;

-- Splits beef out from observed_red_meat/explicit_avoids_red_meat in the
-- dietary_profile jsonb column (see 0029_dietary_profile.sql and
-- @/lib/dietary-profile's FoodCategory doc comment) — plenty of people who
-- eat red meat generally still don't eat beef specifically, often for
-- religious reasons, and the app's food_category classification now
-- distinguishes beef from mutton/lamb/goat accordingly. This is a jsonb
-- column, so no ALTER COLUMN is needed for existing rows to gain the new
-- keys logically (application code already merges DEFAULT_DIETARY_PROFILE
-- under whatever's stored) — but updating both the column default (for new
-- rows) and backfilling existing rows (so the stored JSON is honest about
-- every field it claims to have, not relying on application-layer
-- merging) keeps the data itself self-describing.

alter table adults_contacts
  alter column dietary_profile set default '{
    "observed_dairy": false,
    "observed_lactose_dairy": false,
    "observed_lactose_free_dairy": false,
    "observed_eggs": false,
    "observed_chicken": false,
    "observed_fish": false,
    "observed_shellfish": false,
    "observed_red_meat": false,
    "observed_beef": false,
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
    "explicit_avoids_beef": false,
    "explicit_avoids_pork": false,
    "prefers_plant_based_suggestions": false,
    "last_updated_at": null
  }'::jsonb;

alter table gym_clients
  alter column dietary_profile set default '{
    "observed_dairy": false,
    "observed_lactose_dairy": false,
    "observed_lactose_free_dairy": false,
    "observed_eggs": false,
    "observed_chicken": false,
    "observed_fish": false,
    "observed_shellfish": false,
    "observed_red_meat": false,
    "observed_beef": false,
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
    "explicit_avoids_beef": false,
    "explicit_avoids_pork": false,
    "prefers_plant_based_suggestions": false,
    "last_updated_at": null
  }'::jsonb;

update adults_contacts
  set dietary_profile = dietary_profile || '{"observed_beef": false, "explicit_avoids_beef": false}'::jsonb
  where not (dietary_profile ? 'observed_beef');

update gym_clients
  set dietary_profile = dietary_profile || '{"observed_beef": false, "explicit_avoids_beef": false}'::jsonb
  where not (dietary_profile ? 'observed_beef');

-- Food Balance Recommendations feedback loop (see
-- src/lib/food-balance/personalize.ts and food-library.ts) — lets a user
-- say "I don't like this food" or "not available where I live" about a
-- specific suggestion, so future recommendations respect that. Stored on
-- the same dietary_profile jsonb column as everything else in
-- @/lib/dietary-profile rather than a new table/column, since these are
-- the same category of explicit user signal as explicit_avoids_*/
-- prefers_plant_based_suggestions already there.

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
    "liked_suggestion_ids": [],
    "disliked_suggestion_ids": [],
    "unavailable_suggestion_ids": [],
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
    "liked_suggestion_ids": [],
    "disliked_suggestion_ids": [],
    "unavailable_suggestion_ids": [],
    "last_updated_at": null
  }'::jsonb;

update adults_contacts
  set dietary_profile = dietary_profile || '{"liked_suggestion_ids": [], "disliked_suggestion_ids": [], "unavailable_suggestion_ids": []}'::jsonb
  where not (dietary_profile ? 'disliked_suggestion_ids');

update gym_clients
  set dietary_profile = dietary_profile || '{"liked_suggestion_ids": [], "disliked_suggestion_ids": [], "unavailable_suggestion_ids": []}'::jsonb
  where not (dietary_profile ? 'disliked_suggestion_ids');

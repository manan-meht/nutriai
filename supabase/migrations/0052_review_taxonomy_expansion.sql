-- Review console taxonomy changes, all driven by reviewer feedback after
-- ~90 reviews on tistrahealth.com/admin.
--
-- 1. "Enjoyment food" -> "Treat food". The old label was not understood by
--    the person actually using the console ("don't know what this means
--    anyway"), which makes it worse than useless as a classification: an
--    option nobody can define gets applied inconsistently. "Treat food"
--    matches the coaching copy already shipped in
--    packages/dashboard-core/src/food-classification.ts.
--
--    Safe to rewrite rather than keep both: zero food_knowledge_base rows
--    currently use 'enjoyment_food' (all 202 sit in carb_base/
--    protein_anchor/vegetable_fiber/partial_protein/fat_source/fruit/
--    unknown), so the UPDATE below is a no-op on today's data and exists
--    only so other environments migrate cleanly.
--
--    NOTE: the boolean columns ai_meal_classifications.enjoyment_food_
--    present and human_meal_reviews.corrected_enjoyment_food_present keep
--    their names. Renaming them would touch the WhatsApp handler,
--    dashboard-core, nutrition-core and both dashboards for no user-visible
--    gain; every label a reviewer actually reads now says "Treat food".
--
-- 2. fat_source splits into fat_source_good / fat_source_poor. The 18
--    existing rows keep 'fat_source', which stays valid as the "not yet
--    sorted" value so nothing breaks — the UI labels it as such and offers
--    the two graded options for new and re-edited entries.
--
-- 3. Two new review verdicts: 'no_photo' (a submission with no image at
--    all) and 'unclear_image'. 'unclear_photo' is retained because 16
--    reviews already use it.
--
-- 4. micronutrient_status joins protein_anchor/vegetable_fiber as a
--    meal-level judgment. Unlike those two it is NOT derived from per-item
--    categories (see meal-level-derivation.ts) — there is no per-food
--    micronutrient signal in the knowledge base yet — so it is set by the
--    reviewer and defaults to 'unknown', which is also what the AI will
--    report until the prompt is taught to produce it.

-- 1 + 2 — food_knowledge_base categories
update food_knowledge_base set category = 'treat_food' where category = 'enjoyment_food';

alter table food_knowledge_base
  drop constraint if exists food_knowledge_base_category_check;

alter table food_knowledge_base
  add constraint food_knowledge_base_category_check
  check (category in (
    'protein_anchor', 'partial_protein', 'vegetable_fiber', 'fruit', 'carb_base',
    -- 'fat_source' retained as the unsorted/legacy value for rows predating the split
    'fat_source', 'fat_source_good', 'fat_source_poor',
    'treat_food', 'sugary_drink', 'mixed_meal', 'unknown'
  ));

-- 3 — review verdicts
alter table human_meal_reviews
  drop constraint if exists human_meal_reviews_review_status_check;

alter table human_meal_reviews
  add constraint human_meal_reviews_review_status_check
  check (review_status in (
    'correct', 'partially_correct', 'incorrect',
    'unclear_photo', 'unclear_image', 'no_photo',
    'not_food', 'duplicate', 'escalated'
  ));

-- 4 — micronutrient status
alter table ai_meal_classifications
  add column if not exists micronutrient_status text not null default 'unknown'
  check (micronutrient_status in ('missing', 'partial', 'present', 'unknown'));

alter table human_meal_reviews
  add column if not exists corrected_micronutrient_status text
  check (corrected_micronutrient_status in ('missing', 'partial', 'present', 'unknown'));

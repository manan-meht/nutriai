-- Per-item meal review corrections + food_knowledge_base calibration flags.
--
-- Today's admin review flow only supports whole-MEAL categorical judgments
-- (protein_anchor_status, home_cooked_likelihood, etc. on human_meal_reviews)
-- plus a freeform corrected_items_json blob for the detected-items list.
-- That doesn't decompose: correcting "this meal was home-cooked" says
-- nothing reusable about "Baingan Bharta" specifically the next time it
-- appears in a different meal. This migration adds a structured per-item
-- correction (name + healthy/home-cooked/ultra-processed flags per detected
-- food), and the food_knowledge_base columns those corrections feed into —
-- turning each reclassification directly into a reusable, retrievable fact
-- about that food, rather than a one-off judgment about one meal.

alter table human_meal_reviews
  add column if not exists corrected_food_items_json jsonb;
  -- Shape: [{ name: string, foodKnowledgeBaseId: string | null,
  --           isHealthy: boolean | null, isHomeCooked: boolean | null,
  --           isUltraProcessed: boolean | null }]
  -- One entry per item in the reviewer's confirmed/edited item list (after
  -- any add/remove) — the source of truth for "what foods were actually in
  -- this meal" going forward, superseding corrected_items_json for reviews
  -- created through the new per-item UI. corrected_items_json stays for
  -- historical rows/other correction paths.

alter table food_knowledge_base
  add column if not exists is_healthy boolean,
  add column if not exists is_home_cooked boolean,
  add column if not exists is_ultra_processed boolean,
  -- How many separate human reviews have confirmed/reinforced this food's
  -- classification — a simple frequency/confidence signal a RAG lookup can
  -- use to prefer well-established entries over a single one-off
  -- correction (see src/lib/admin/food-knowledge-upsert.ts).
  add column if not exists correction_count integer not null default 0;

-- Lets an admin reviewer correct a meal's per-item macro estimates (not
-- just the categorical protein/veg/carb fields) directly from the review
-- console, and have that correction actually update the real meal_logs
-- row the user sees — not just an internal QC record. See
-- src/app/(admin)/admin/actions.ts's saveHumanReview, which now also
-- writes to meal_logs when correctedMealMacros is present.

alter table human_meal_reviews
  add column if not exists corrected_macros_json jsonb;
  -- Shape: [{ name: string, caloriesKcal: number, proteinG: number,
  --           carbsG: number, fatG: number }] — one entry per mealLog.foods
  -- item the reviewer actually edited. Audit trail only; meal_logs itself
  -- is the live, user-facing row that actually gets updated.

-- Adds fiber tracking alongside the existing protein/carbs/fat columns on
-- meal_logs, so the dashboard's Macronutrient Summary can show a real
-- Fiber(g) average instead of only the pre-existing categorical
-- present/partial/missing signal (see src/lib/nutrition/food-classification.ts).
-- Nullable/backward compatible — meals logged before this exist fine with
-- fiber = null, treated as 0 by all readers (`?? 0`).

alter table meal_logs
  add column if not exists total_fiber_min numeric,
  add column if not exists total_fiber_max numeric;

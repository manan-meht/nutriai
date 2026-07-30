-- meal_logs.meal_type's check constraint only ever allowed
-- ('breakfast','lunch','dinner','snack') — predating the app's MealType
-- union (src/lib/ai/food-analyzer.ts) growing 'drink'/'tea'/'coffee'/
-- 'wine'/'juice'/'other' for drink-only photos. The app fully supports
-- these values (the AI classifies drink photos this way by default, and a
-- user can explicitly say "change it to coffee" — see
-- detectMealTypeChange/isConflictingDrinkCorrection in
-- src/lib/whatsapp/conversation-handler.ts), but every insert with one of
-- these meal_type values has been silently violating this constraint and
-- failing since that feature shipped — discovered via a real user report
-- of "sorry, something went wrong" on a coffee photo that never saved,
-- even after retrying. Widening the constraint to match MealType exactly.
alter table meal_logs drop constraint meal_logs_meal_type_check;
alter table meal_logs add constraint meal_logs_meal_type_check
  check (meal_type in ('breakfast', 'lunch', 'dinner', 'snack', 'drink', 'tea', 'coffee', 'wine', 'juice', 'other'));

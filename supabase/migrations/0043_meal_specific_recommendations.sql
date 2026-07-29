-- Extends todays_focus_recommendations (0039_todays_focus.sql) to also
-- carry the meal-specific recommendation engine's structured fields
-- (src/lib/food-balance/meal-nutrient-recommendations.ts) — reused rather
-- than a new table, per that feature's own "reuse existing tables" design
-- note. `nutrient` is the marker: only rows produced by the new engine
-- ever set it, distinguishing them from the older day-level Today's Focus
-- rows this table already stored (those keep nutrient/meal_type/
-- issue_type/evidence_type all null).
--
-- `context` lets the SAME table record deliveries from both Food Balance
-- Score and Today's Focus (and, later, weekly reports / dashboard
-- insights) — this is what makes the "one shared daily claim, read back
-- by whichever surface asks second" design in daily-meal-recommendation.ts
-- possible without a second table.

alter table todays_focus_recommendations add column if not exists nutrient text
  check (nutrient in ('protein', 'fiber', 'fruit', 'vegetable', 'calories'));
alter table todays_focus_recommendations add column if not exists meal_type text
  check (meal_type in ('breakfast', 'lunch', 'dinner', 'snack'));
alter table todays_focus_recommendations add column if not exists issue_type text
  check (issue_type in ('overall_gap', 'meal_gap', 'distribution_gap', 'positive_pattern', 'insufficient_data'));
alter table todays_focus_recommendations add column if not exists evidence_type text
  check (evidence_type in ('yesterday_only', 'yesterday_confirms_pattern', 'historical_pattern', 'single_unusual_day'));
alter table todays_focus_recommendations add column if not exists context text not null default 'today_focus'
  check (context in ('today_focus', 'food_balance', 'weekly_report', 'dashboard_insight'));

-- One shared claim per contact/local_date for the new engine specifically
-- (nutrient is only ever set by it) — whichever surface computes first
-- for a given day wins this row; the other reads it back instead of
-- independently recomputing and potentially picking a different meal/
-- nutrient. Deliberately separate from
-- todays_focus_recommendations_scheduled_once_per_day (0039), which
-- guards a different concern (the scheduled morning send's own
-- idempotency) and only applies `where is_scheduled` — new-engine claim
-- rows are never is_scheduled themselves.
create unique index if not exists todays_focus_recommendations_shared_daily_claim
  on todays_focus_recommendations (contact_id, contact_type, local_date)
  where nutrient is not null;

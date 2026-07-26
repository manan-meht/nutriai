-- Replaces the old subjective "activity level" (mostly_sitting/lightly_active/
-- moderately_active/very_active/unknown) and "resistance training"
-- (regularly/sometimes/not_currently/unknown) onboarding questions with
-- observable-behaviour ones. See packages/health-scoring/src/food-balance/
-- derive-activity-level.ts for the shared derivation function that turns
-- the two new behavioural answers into derived_activity_level, which is
-- what calorie/macro/recommendation logic actually consumes going forward.
--
-- The old activity_level/resistance_training_status columns (added in
-- 0027_food_balance_score.sql) are kept untouched — never dropped — as an
-- audit trail of what people actually answered under the old questions.

alter table adults_contacts
  add column if not exists daily_movement_level text
    check (daily_movement_level in ('mostly_seated', 'mixed_light_movement', 'moving_several_hours', 'physically_demanding', 'not_sure')),
  add column if not exists weekly_moderate_activity text
    check (weekly_moderate_activity in ('under_30', '30_to_89', '90_to_149', '150_to_299', '300_plus', 'not_sure')),
  add column if not exists strength_exercise_frequency text
    check (strength_exercise_frequency in ('zero_days', 'less_than_weekly', 'one_day', 'two_days', 'three_plus_days', 'not_sure')),
  add column if not exists derived_activity_level text
    check (derived_activity_level in ('not_active', 'lightly_active', 'moderately_active', 'very_active')),
  -- True for a row whose behavioural answers were approximated from the
  -- old activity_level/resistance_training_status values by the backfill
  -- below, rather than directly answered under the new questions — lets
  -- product/analytics distinguish "we guessed" from "they told us."
  add column if not exists activity_profile_migrated boolean not null default false;

alter table gym_clients
  add column if not exists daily_movement_level text
    check (daily_movement_level in ('mostly_seated', 'mixed_light_movement', 'moving_several_hours', 'physically_demanding', 'not_sure')),
  add column if not exists weekly_moderate_activity text
    check (weekly_moderate_activity in ('under_30', '30_to_89', '90_to_149', '150_to_299', '300_plus', 'not_sure')),
  add column if not exists strength_exercise_frequency text
    check (strength_exercise_frequency in ('zero_days', 'less_than_weekly', 'one_day', 'two_days', 'three_plus_days', 'not_sure')),
  add column if not exists derived_activity_level text
    check (derived_activity_level in ('not_active', 'lightly_active', 'moderately_active', 'very_active')),
  add column if not exists activity_profile_migrated boolean not null default false;

-- ---------------------------------------------------------------------
-- Backfill existing rows from the old two fields — approximate mapping
-- only (see the PR description this migration shipped with for the full
-- rationale). Rows with no old activity_level/resistance_training_status
-- at all (both null, i.e. never answered) are left with the new columns
-- null too — nothing to approximate, and there's no product reason to
-- invent a fake "not_sure" for someone who was never asked.
-- ---------------------------------------------------------------------

update adults_contacts set
  daily_movement_level = case activity_level
    when 'mostly_sitting' then 'mostly_seated'
    when 'lightly_active' then 'mixed_light_movement'
    when 'moderately_active' then 'mixed_light_movement'
    when 'very_active' then 'moving_several_hours'
    when 'unknown' then 'not_sure'
    else null
  end,
  weekly_moderate_activity = case activity_level
    when 'mostly_sitting' then 'under_30'
    when 'lightly_active' then '30_to_89'
    when 'moderately_active' then '150_to_299'
    when 'very_active' then '300_plus'
    when 'unknown' then 'not_sure'
    else null
  end,
  derived_activity_level = case activity_level
    when 'mostly_sitting' then 'not_active'
    when 'lightly_active' then 'lightly_active'
    when 'moderately_active' then 'moderately_active'
    when 'very_active' then 'very_active'
    else null
  end,
  strength_exercise_frequency = case resistance_training_status
    when 'regularly' then 'two_days'
    when 'sometimes' then 'less_than_weekly'
    when 'not_currently' then 'zero_days'
    when 'unknown' then 'not_sure'
    else null
  end,
  activity_profile_migrated = true
where activity_level is not null or resistance_training_status is not null;

update gym_clients set
  daily_movement_level = case activity_level
    when 'mostly_sitting' then 'mostly_seated'
    when 'lightly_active' then 'mixed_light_movement'
    when 'moderately_active' then 'mixed_light_movement'
    when 'very_active' then 'moving_several_hours'
    when 'unknown' then 'not_sure'
    else null
  end,
  weekly_moderate_activity = case activity_level
    when 'mostly_sitting' then 'under_30'
    when 'lightly_active' then '30_to_89'
    when 'moderately_active' then '150_to_299'
    when 'very_active' then '300_plus'
    when 'unknown' then 'not_sure'
    else null
  end,
  derived_activity_level = case activity_level
    when 'mostly_sitting' then 'not_active'
    when 'lightly_active' then 'lightly_active'
    when 'moderately_active' then 'moderately_active'
    when 'very_active' then 'very_active'
    else null
  end,
  strength_exercise_frequency = case resistance_training_status
    when 'regularly' then 'two_days'
    when 'sometimes' then 'less_than_weekly'
    when 'not_currently' then 'zero_days'
    when 'unknown' then 'not_sure'
    else null
  end,
  activity_profile_migrated = true
where activity_level is not null or resistance_training_status is not null;

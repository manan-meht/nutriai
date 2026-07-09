-- Captures WhatsApp user corrections to AI food-analysis output, so the
-- team can look at real-world portion-estimation misses (over/under
-- estimated chicken/paneer/eggs/etc.) without having to comb through raw
-- meal_logs. Deliberately separate from the internal QC tables added in
-- 0013_meal_review_console.sql (meal_submissions / human_meal_reviews),
-- since those model an employee reviewing a *saved* meal, whereas this
-- captures the user's own correction message in the moment — including
-- corrections made to a meal that hasn't been saved yet (pending_meal).
--
-- Written best-effort from src/lib/whatsapp/conversation-handler.ts
-- whenever a correction changes the estimated protein/weight/food
-- meaningfully; a failure to write here must never block the correction
-- flow itself.

create table meal_portion_corrections (
  id uuid primary key default gen_random_uuid(),

  -- Mirrors meal_submissions.user_id/user_type rather than FK-ing to it,
  -- since a correction can happen before the meal is ever saved/submitted.
  user_id uuid not null,
  user_type text not null check (user_type in ('adults', 'gym')),

  -- Set once the meal this correction applies to is actually saved;
  -- null while it's still a pending (unsaved) correction.
  meal_log_id uuid references meal_logs(id) on delete set null,

  image_url text,
  original_model_output jsonb not null,
  user_correction_text text not null,
  final_logged_meal jsonb,

  issue_type text not null check (issue_type in (
    'portion_overestimate', 'portion_underestimate', 'wrong_food',
    'wrong_meal_type', 'wrong_calories', 'wrong_protein'
  )),
  food_type text,

  original_estimated_weight text,
  corrected_estimated_weight text,
  original_protein_estimate numeric,
  corrected_protein_estimate numeric,

  created_at timestamptz not null default now()
);

create index meal_portion_corrections_user_idx on meal_portion_corrections (user_id, created_at desc);
create index meal_portion_corrections_issue_type_idx on meal_portion_corrections (issue_type);

alter table meal_portion_corrections enable row level security;

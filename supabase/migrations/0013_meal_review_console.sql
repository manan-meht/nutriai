-- Tistra Meal Review Console: internal QC tooling for reviewing/correcting
-- AI meal-photo classifications, and the foundation for a proprietary
-- Indian food knowledge base + future embedding-based retrieval.
--
-- Design notes (see also docs/meal-review-console-notes.md):
--  * All enum-like fields use text + check constraints, matching the
--    existing convention in this repo (e.g. adults_contacts.relationship_type)
--    rather than native Postgres enums, which are painful to alter later.
--  * meal_submissions is a NEW table, separate from meal_logs. meal_logs
--    remains the source of truth for user-facing dashboards; meal_submissions
--    is the QC-review-focused record, linked back via meal_log_id so a
--    reviewed/corrected classification can be traced to the real logged
--    meal. Kept separate (rather than bolting these fields onto meal_logs)
--    because meal_submissions carries QC/privacy-sensitive fields
--    (consent, redaction, dataset split) that don't belong on the
--    user-facing meal_logs row.
--  * user_id/user_type mirror the existing adults_contact_id/client_id
--    polymorphic pattern used elsewhere (see meal_logs), generalized into
--    one nullable-FK-free pair since a submission may reference either an
--    adults_contact or a gym_client and no single FK can target both.

-- ---------------------------------------------------------------------
-- Roles
-- ---------------------------------------------------------------------

-- profiles is created outside tracked migrations (via Supabase Auth), so
-- this only adds the new column if it isn't already there.
alter table profiles
  add column if not exists role text not null default 'user'
  check (role in ('user', 'reviewer', 'nutrition_expert', 'admin', 'super_admin'));

create index if not exists profiles_role_idx on profiles (role) where role <> 'user';

-- ---------------------------------------------------------------------
-- 1. meal_submissions
-- ---------------------------------------------------------------------

create table meal_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  user_type text not null check (user_type in ('adults', 'gym')),
  -- Traceability back to the user-facing meal row this submission produced.
  meal_log_id uuid references meal_logs(id) on delete set null,
  image_url text,
  caption text,
  submitted_at timestamptz not null default now(),
  meal_type text not null default 'unknown' check (meal_type in ('breakfast', 'lunch', 'snack', 'dinner', 'unknown')),
  source text not null default 'unknown' check (source in ('whatsapp', 'dashboard', 'app', 'unknown')),
  image_quality text not null default 'unknown' check (image_quality in ('clear', 'somewhat_clear', 'blurry', 'not_food', 'unknown')),
  market text,
  review_status text not null default 'pending' check (review_status in ('pending', 'reviewed', 'escalated')),

  -- Privacy / consent (see developer note, section 6) — nothing here should
  -- ever be assumed true; every flag defaults to the safe/off value.
  consent_for_model_improvement boolean not null default false,
  eligible_for_anonymized_training boolean not null default false,
  contains_face_or_person boolean,
  contains_sensitive_background boolean,
  needs_redaction boolean not null default false,
  redacted_image_url text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index meal_submissions_review_status_idx on meal_submissions (review_status, submitted_at desc);
create index meal_submissions_user_idx on meal_submissions (user_id, user_type);
create index meal_submissions_meal_log_idx on meal_submissions (meal_log_id);

-- ---------------------------------------------------------------------
-- 2. ai_meal_classifications
-- ---------------------------------------------------------------------

create table ai_meal_classifications (
  id uuid primary key default gen_random_uuid(),
  meal_submission_id uuid not null references meal_submissions(id) on delete cascade,

  model_name text not null,
  model_version text,
  prompt_version text,
  -- Versioning for the two other moving parts that affect classification
  -- quality besides the model/prompt itself (see developer note, section 4).
  taxonomy_version text,
  food_knowledge_base_version text,

  detected_items_json jsonb not null default '[]'::jsonb,
  structured_ai_output_json jsonb,

  protein_anchor_status text not null default 'unknown' check (protein_anchor_status in ('missing', 'partial', 'present', 'unknown')),
  vegetable_fiber_status text not null default 'unknown' check (vegetable_fiber_status in ('missing', 'partial', 'present', 'unknown')),
  carb_status text not null default 'unknown' check (carb_status in ('missing', 'present', 'dominant', 'unknown')),
  meal_balance_status text not null default 'unknown' check (meal_balance_status in ('needs_support', 'moderate', 'strong', 'unknown')),
  home_cooked_likelihood text not null default 'unknown' check (home_cooked_likelihood in ('low', 'medium', 'high', 'unknown')),
  enjoyment_food_present boolean not null default false,
  sugary_drink_present boolean not null default false,
  fried_food_present boolean not null default false,
  ultra_processed_likelihood text not null default 'unknown' check (ultra_processed_likelihood in ('low', 'medium', 'high', 'unknown')),
  healthier_direction_signal text not null default 'unknown' check (healthier_direction_signal in ('negative', 'neutral', 'positive', 'unknown')),

  suggested_next_step text,
  confidence_score numeric check (confidence_score >= 0 and confidence_score <= 1),

  raw_ai_response_json jsonb,

  created_at timestamptz not null default now()
);

create index ai_meal_classifications_submission_idx on ai_meal_classifications (meal_submission_id, created_at desc);
create index ai_meal_classifications_model_idx on ai_meal_classifications (model_name, model_version, prompt_version);

-- ---------------------------------------------------------------------
-- 3. human_meal_reviews
-- ---------------------------------------------------------------------

create table human_meal_reviews (
  id uuid primary key default gen_random_uuid(),
  meal_submission_id uuid not null references meal_submissions(id) on delete cascade,
  ai_classification_id uuid references ai_meal_classifications(id) on delete set null,
  reviewer_id uuid not null references profiles(id),

  review_status text not null check (review_status in ('correct', 'partially_correct', 'incorrect', 'unclear_photo', 'not_food', 'duplicate', 'escalated')),

  corrected_items_json jsonb,
  corrected_protein_anchor_status text check (corrected_protein_anchor_status in ('missing', 'partial', 'present', 'unknown')),
  corrected_vegetable_fiber_status text check (corrected_vegetable_fiber_status in ('missing', 'partial', 'present', 'unknown')),
  corrected_carb_status text check (corrected_carb_status in ('missing', 'present', 'dominant', 'unknown')),
  corrected_meal_balance_status text check (corrected_meal_balance_status in ('needs_support', 'moderate', 'strong', 'unknown')),
  corrected_home_cooked_likelihood text check (corrected_home_cooked_likelihood in ('low', 'medium', 'high', 'unknown')),
  corrected_enjoyment_food_present boolean,
  corrected_sugary_drink_present boolean,
  corrected_fried_food_present boolean,
  corrected_ultra_processed_likelihood text check (corrected_ultra_processed_likelihood in ('low', 'medium', 'high', 'unknown')),
  corrected_healthier_direction_signal text check (corrected_healthier_direction_signal in ('negative', 'neutral', 'positive', 'unknown')),
  corrected_suggestion text,

  -- Recommendation-tone feedback (developer note, section 7) — tracked
  -- separately from food-classification correctness so tone issues in the
  -- coaching copy can be improved independently of food recognition.
  suggestion_approved boolean,
  suggestion_edit_reason text,
  tone_issue_detected boolean not null default false,
  shame_language_issue_detected boolean not null default false,

  review_notes text,

  -- Dataset-readiness fields (developer note, section 5) — unset by
  -- default; a meal only becomes usable for evaluation/training once a
  -- human explicitly classifies it as such AND consent is present.
  dataset_split text not null default 'unset' check (dataset_split in ('train', 'validation', 'test', 'holdout', 'unset')),
  is_gold_standard boolean not null default false,
  review_quality text not null default 'basic' check (review_quality in ('basic', 'expert_verified', 'disputed')),
  eligible_for_model_improvement boolean not null default false,

  reviewed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index human_meal_reviews_submission_idx on human_meal_reviews (meal_submission_id, reviewed_at desc);
create index human_meal_reviews_reviewer_idx on human_meal_reviews (reviewer_id);

-- ---------------------------------------------------------------------
-- 4. food_knowledge_base
-- ---------------------------------------------------------------------

create table food_knowledge_base (
  id uuid primary key default gen_random_uuid(),
  food_name text not null,
  -- Canonical/display-name split (developer note, section 2) — food_name
  -- above is the canonical/internal name; display names reviewers actually
  -- typed (e.g. "rajma chawal") live in aliases_json alongside true aliases.
  aliases_json jsonb not null default '[]'::jsonb,
  region text,
  category text not null default 'unknown' check (category in ('protein_anchor', 'partial_protein', 'vegetable_fiber', 'carb_base', 'fat_source', 'enjoyment_food', 'sugary_drink', 'mixed_meal', 'unknown')),
  protein_relevance text not null default 'none' check (protein_relevance in ('none', 'low', 'medium', 'high')),
  fiber_relevance text not null default 'none' check (fiber_relevance in ('none', 'low', 'medium', 'high')),
  usual_context text,
  common_pairings_json jsonb not null default '[]'::jsonb,
  common_misclassifications_json jsonb not null default '[]'::jsonb,
  recommended_suggestion text,
  reviewed_by uuid references profiles(id),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index food_knowledge_base_name_idx on food_knowledge_base (lower(food_name)) where archived_at is null;
create index food_knowledge_base_category_idx on food_knowledge_base (category);

-- ---------------------------------------------------------------------
-- 5. meal_review_audit_logs
-- ---------------------------------------------------------------------

create table meal_review_audit_logs (
  id uuid primary key default gen_random_uuid(),
  meal_submission_id uuid not null references meal_submissions(id) on delete cascade,
  ai_classification_id uuid references ai_meal_classifications(id) on delete set null,
  human_review_id uuid references human_meal_reviews(id) on delete set null,
  actor_id uuid not null references profiles(id),
  action_type text not null check (action_type in ('created_review', 'updated_review', 'marked_correct', 'marked_incorrect', 'escalated', 'added_to_knowledge_base')),
  before_json jsonb,
  after_json jsonb,
  created_at timestamptz not null default now()
);

create index meal_review_audit_logs_submission_idx on meal_review_audit_logs (meal_submission_id, created_at desc);

-- ---------------------------------------------------------------------
-- 6. meal_embeddings (future-ready placeholder — see developer note, section 3)
-- ---------------------------------------------------------------------

-- Standard on all current Supabase Postgres instances. If this fails on
-- your project, confirm the `vector` extension is enabled under
-- Database > Extensions before retrying.
create extension if not exists vector;

create table meal_embeddings (
  id uuid primary key default gen_random_uuid(),
  meal_submission_id uuid not null references meal_submissions(id) on delete cascade,
  embedding_type text not null check (embedding_type in ('image', 'caption', 'combined', 'corrected_label_text')),
  embedding_model text not null,
  embedding_version text,
  -- 768 matches common Gemini text-embedding output size; resize via a
  -- follow-up migration if the eventual embedding model differs. No rows
  -- are written here yet — this table is a placeholder (see developer note).
  embedding_vector vector(768),
  created_at timestamptz not null default now()
);

create index meal_embeddings_submission_idx on meal_embeddings (meal_submission_id, embedding_type);

-- ---------------------------------------------------------------------
-- Access control: these are internal QC tables containing other users'
-- meal photos. No RLS policies are defined — only the service-role client
-- (used exclusively by the admin server actions, gated by getAdminSession()
-- in src/lib/admin/auth.ts) can read/write them; anon/authenticated keys
-- get nothing, same posture as end_user_access_settings elsewhere in this
-- schema.
-- ---------------------------------------------------------------------

alter table meal_submissions enable row level security;
alter table ai_meal_classifications enable row level security;
alter table human_meal_reviews enable row level security;
alter table food_knowledge_base enable row level security;
alter table meal_review_audit_logs enable row level security;
alter table meal_embeddings enable row level security;

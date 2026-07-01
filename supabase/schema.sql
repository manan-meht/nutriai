-- ============================================================
-- Nutrition Platform — Full Database Schema
-- Run this against your Supabase project SQL editor
-- ============================================================

-- Enable extensions
create extension if not exists "uuid-ossp";
create extension if not exists "pg_trgm"; -- for fuzzy food search

-- ============================================================
-- ENUMS
-- ============================================================

create type workspace_type as enum ('gym', 'family');
create type workspace_member_role as enum (
  -- gym roles
  'gym_owner', 'trainer', 'client',
  -- family roles
  'family_owner', 'family_supporter', 'older_adult', 'caregiver', 'dietitian'
);
create type meal_source as enum ('web', 'whatsapp', 'voice', 'manual');
create type meal_type as enum ('breakfast', 'lunch', 'dinner', 'snack');
create type amount_eaten as enum ('little', 'half', 'most', 'all');
create type analysis_confidence as enum ('low', 'medium', 'high');
create type invitation_status as enum ('pending', 'accepted', 'expired', 'revoked');
create type goal_status as enum ('active', 'paused', 'completed', 'declined');
create type notification_channel as enum ('in_app', 'email', 'whatsapp', 'push');
create type report_status as enum ('draft', 'pending_approval', 'approved', 'sent');

-- ============================================================
-- CORE: profiles
-- ============================================================

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  avatar_url text,
  phone text,
  preferred_language text default 'en',
  timezone text default 'Asia/Kolkata',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ============================================================
-- CORE: workspaces
-- ============================================================

create table workspaces (
  id uuid primary key default uuid_generate_v4(),
  type workspace_type not null,
  name text not null,
  slug text unique not null,
  owner_id uuid not null references profiles(id),
  settings jsonb default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_workspaces_type on workspaces(type);
create index idx_workspaces_owner on workspaces(owner_id);

-- ============================================================
-- CORE: workspace_members
-- ============================================================

create table workspace_members (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  role workspace_member_role not null,
  joined_at timestamptz default now(),
  is_active boolean default true,
  unique(workspace_id, user_id)
);

create index idx_workspace_members_workspace on workspace_members(workspace_id);
create index idx_workspace_members_user on workspace_members(user_id);

-- ============================================================
-- CORE: invitations
-- ============================================================

create table invitations (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  invited_by uuid not null references profiles(id),
  email text not null,
  role workspace_member_role not null,
  token text unique not null default encode(gen_random_bytes(32), 'hex'),
  status invitation_status default 'pending',
  expires_at timestamptz default (now() + interval '7 days'),
  accepted_at timestamptz,
  created_at timestamptz default now()
);

-- ============================================================
-- CORE: meals (shared canonical record)
-- ============================================================

create table meals (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  workspace_type workspace_type not null, -- denormalised for fast routing
  meal_logger_id uuid not null references profiles(id),

  logged_at timestamptz not null default now(),
  meal_type meal_type,
  source meal_source not null default 'web',

  -- Nutrition estimate (ranges, not exact)
  calories_min numeric,
  calories_max numeric,
  protein_grams_min numeric,
  protein_grams_max numeric,
  carbohydrates_grams_min numeric,
  carbohydrates_grams_max numeric,
  fat_grams_min numeric,
  fat_grams_max numeric,
  fibre_grams_min numeric,
  fibre_grams_max numeric,

  food_groups text[] default '{}',
  amount_eaten amount_eaten,
  appetite_rating smallint check (appetite_rating between 1 and 5),
  hydration_recorded boolean default false,

  analysis_confidence analysis_confidence default 'medium',
  confirmed_by_user boolean default false,
  confirmed_at timestamptz,

  raw_input text, -- original text/voice transcript
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_meals_workspace on meals(workspace_id);
create index idx_meals_logger on meals(meal_logger_id);
create index idx_meals_logged_at on meals(logged_at desc);
create index idx_meals_workspace_type on meals(workspace_type);

-- ============================================================
-- CORE: meal_images
-- ============================================================

create table meal_images (
  id uuid primary key default uuid_generate_v4(),
  meal_id uuid not null references meals(id) on delete cascade,
  storage_path text not null,
  public_url text,
  original_filename text,
  mime_type text,
  size_bytes bigint,
  uploaded_at timestamptz default now()
);

-- ============================================================
-- CORE: meal_items (individual food items within a meal)
-- ============================================================

create table meal_items (
  id uuid primary key default uuid_generate_v4(),
  meal_id uuid not null references meals(id) on delete cascade,
  name text not null, -- e.g. "dal makhani"
  name_local text, -- local language name
  quantity_description text, -- e.g. "1 katori", "2 rotis"
  quantity_grams numeric,
  -- Nutrition per item (from Indian nutrition DB or AI estimate)
  calories_estimated numeric,
  protein_grams_estimated numeric,
  carbohydrates_grams_estimated numeric,
  fat_grams_estimated numeric,
  fibre_grams_estimated numeric,
  -- Indian nutrition database match
  indb_food_code text, -- Indian Nutrition Database food code
  indb_match_confidence analysis_confidence,
  -- AI source
  ai_identified boolean default false,
  user_corrected boolean default false,
  created_at timestamptz default now()
);

create index idx_meal_items_meal on meal_items(meal_id);

-- ============================================================
-- CORE: meal_analysis (AI processing record)
-- ============================================================

create table meal_analysis (
  id uuid primary key default uuid_generate_v4(),
  meal_id uuid not null references meals(id) on delete cascade,
  -- Which AI ran
  provider text not null, -- 'gemini', 'openai', 'fallback'
  model text not null, -- 'gemini-2.0-flash-exp', 'gpt-4o', etc.
  was_fallback boolean default false,
  -- Raw AI response (for debugging/audit)
  raw_response jsonb,
  -- Processing metadata
  processing_ms integer,
  tokens_used integer,
  confidence analysis_confidence,
  error_message text,
  created_at timestamptz default now()
);

-- ============================================================
-- CORE: meal_corrections (user edits after AI analysis)
-- ============================================================

create table meal_corrections (
  id uuid primary key default uuid_generate_v4(),
  meal_id uuid not null references meals(id) on delete cascade,
  corrected_by uuid not null references profiles(id),
  field_name text not null,
  old_value jsonb,
  new_value jsonb,
  created_at timestamptz default now()
);

-- ============================================================
-- CORE: messages (in-app messaging between members)
-- ============================================================

create table messages (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  sender_id uuid not null references profiles(id),
  recipient_id uuid not null references profiles(id),
  body text not null,
  read_at timestamptz,
  created_at timestamptz default now()
);

-- ============================================================
-- CORE: notifications
-- ============================================================

create table notifications (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  workspace_type workspace_type not null,
  recipient_id uuid not null references profiles(id),
  channel notification_channel not null default 'in_app',
  template_key text not null, -- e.g. 'gym.client_inactive', 'family.meal_missed'
  title text not null,
  body text not null,
  metadata jsonb default '{}',
  sent_at timestamptz,
  read_at timestamptz,
  created_at timestamptz default now()
);

create index idx_notifications_recipient on notifications(recipient_id, created_at desc);

-- ============================================================
-- GYM-SPECIFIC TABLES
-- ============================================================

create table client_profiles (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id uuid not null references profiles(id),
  programme_goal text,
  current_weight_kg numeric,
  target_weight_kg numeric,
  height_cm numeric,
  date_of_birth date,
  activity_level text,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(workspace_id, user_id)
);

create table trainer_client_assignments (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  trainer_id uuid not null references profiles(id),
  client_id uuid not null references profiles(id),
  assigned_at timestamptz default now(),
  is_active boolean default true,
  unique(workspace_id, trainer_id, client_id)
);

create table training_schedules (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  client_id uuid not null references profiles(id),
  day_of_week smallint not null check (day_of_week between 0 and 6), -- 0=Sun
  is_training_day boolean not null,
  session_time time,
  notes text
);

create table nutrition_targets (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  client_id uuid not null references profiles(id),
  created_by_trainer_id uuid references profiles(id),
  applies_on text not null default 'all_days', -- 'all_days', 'training_days', 'rest_days'
  protein_grams_min numeric,
  protein_grams_max numeric,
  calories_min numeric,
  calories_max numeric,
  carbohydrates_grams_min numeric,
  carbohydrates_grams_max numeric,
  fat_grams_min numeric,
  fat_grams_max numeric,
  meals_per_day_target smallint,
  effective_from date not null default current_date,
  effective_until date,
  is_active boolean default true,
  created_at timestamptz default now()
);

create table coach_notes (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  trainer_id uuid not null references profiles(id),
  client_id uuid not null references profiles(id),
  body text not null,
  is_private boolean default true, -- trainer-only by default
  created_at timestamptz default now()
);

create table gym_goal_configs (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  client_id uuid not null references profiles(id),
  created_by_trainer_id uuid references profiles(id),
  metric text not null,
  target_value numeric,
  minimum_value numeric,
  maximum_value numeric,
  applies_on text default 'all_days',
  trainer_approval_required boolean default false,
  status goal_status default 'active',
  starts_at date,
  ends_at date,
  created_at timestamptz default now()
);

create table gym_meal_insights (
  id uuid primary key default uuid_generate_v4(),
  meal_id uuid not null references meals(id) on delete cascade,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  client_id uuid not null references profiles(id),
  -- Target contributions
  protein_target_contribution numeric,
  calorie_target_contribution numeric,
  macro_balance_protein text,
  macro_balance_carbohydrates text,
  macro_balance_fat text,
  -- Training context
  is_training_day boolean,
  is_pre_workout_meal boolean,
  is_post_workout_meal boolean,
  timing_observation text,
  -- Target status
  protein_status text, -- 'below' | 'within' | 'above' | 'unknown'
  calorie_status text,
  meal_timing_status text,
  -- Coach review
  coach_review_recommended boolean default false,
  coach_review_reason text,
  created_at timestamptz default now()
);

create table coach_reports (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  client_id uuid not null references profiles(id),
  trainer_id uuid references profiles(id),
  week_starting date not null,
  status report_status default 'draft',
  -- Content
  body_json jsonb not null default '{}',
  trainer_note text,
  -- Approval
  approved_by uuid references profiles(id),
  approved_at timestamptz,
  sent_at timestamptz,
  auto_send_enabled boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table coach_review_queue (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  trainer_id uuid not null references profiles(id),
  client_id uuid not null references profiles(id),
  reason text not null, -- 'low_logging' | 'protein_target_missed' | etc.
  severity text not null default 'low', -- 'low' | 'medium' | 'high'
  resolved boolean default false,
  resolved_at timestamptz,
  created_at timestamptz default now()
);

-- ============================================================
-- FAMILY-SPECIFIC TABLES
-- ============================================================

create table support_relationships (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  older_adult_id uuid not null references profiles(id),
  supporter_id uuid not null references profiles(id),
  relationship_label text, -- e.g. "daughter", "son", "caregiver"
  is_active boolean default true,
  created_at timestamptz default now(),
  unique(workspace_id, older_adult_id, supporter_id)
);

-- What the older adult permits the supporter to see
create table sharing_permissions (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  older_adult_id uuid not null references profiles(id),
  supporter_id uuid not null references profiles(id),
  can_see_meal_photos boolean default false,
  can_see_meal_descriptions boolean default true,
  can_see_weekly_summaries boolean default true,
  can_see_goal_progress boolean default true,
  can_see_alerts boolean default true,
  can_see_messages boolean default true,
  can_propose_goals boolean default true,
  updated_at timestamptz default now(),
  unique(workspace_id, older_adult_id, supporter_id)
);

create table consent_records (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  older_adult_id uuid not null references profiles(id),
  supporter_id uuid not null references profiles(id),
  consent_type text not null, -- 'data_sharing', 'goal_proposal', 'alert_sharing'
  granted boolean not null,
  granted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz default now()
);

create table appetite_checkins (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id uuid not null references profiles(id),
  meal_id uuid references meals(id),
  rating smallint check (rating between 1 and 5),
  notes text,
  checked_in_at timestamptz default now()
);

create table hydration_checkins (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id uuid not null references profiles(id),
  glasses_count smallint,
  checked_in_at timestamptz default now()
);

create table family_goal_configs (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  older_adult_id uuid not null references profiles(id),
  proposed_by_id uuid references profiles(id),
  proposed_by_role text not null, -- 'self' | 'family_supporter' | 'caregiver' | 'dietitian'
  metric text not null,
  weekly_target integer,
  consent_required boolean default true,
  accepted_by_meal_logger boolean default false,
  accepted_at timestamptz,
  status goal_status default 'active',
  description text,
  starts_at date,
  ends_at date,
  created_at timestamptz default now()
);

create table personal_baselines (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id uuid not null references profiles(id),
  -- Rolling 4-week baselines recalculated weekly
  avg_meals_per_day numeric,
  avg_protein_sources_per_week numeric,
  avg_fruit_servings_per_week numeric,
  avg_vegetable_servings_per_week numeric,
  avg_portion_size_signal text, -- 'usual' | 'possibly_lower' | 'mixed'
  avg_appetite_rating numeric,
  avg_hydration_checkins_per_week numeric,
  baseline_week_ending date not null, -- the Sunday ending the 4-week window
  meals_in_window integer,
  data_completeness numeric check (data_completeness between 0 and 1),
  created_at timestamptz default now(),
  unique(workspace_id, user_id, baseline_week_ending)
);

create table family_meal_insights (
  id uuid primary key default uuid_generate_v4(),
  meal_id uuid not null references meals(id) on delete cascade,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  supported_person_id uuid not null references profiles(id),
  -- Meal content signals
  meal_regularity_contribution text,
  protein_source_detected boolean,
  fruit_detected boolean,
  vegetable_detected boolean,
  food_variety_contribution text,
  -- Eating signals
  quantity_signal text, -- 'usual' | 'possibly_lower' | 'unknown'
  appetite_signal text, -- 'normal' | 'low' | 'unknown'
  hydration_signal text, -- 'recorded' | 'not_recorded' | 'unknown'
  -- Baseline comparison
  baseline_change_detected boolean default false,
  baseline_change_description text,
  baseline_change_confidence analysis_confidence,
  -- Alert
  family_alert_candidate boolean default false,
  family_alert_reason text,
  created_at timestamptz default now()
);

create table family_weekly_summaries (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  supported_person_id uuid not null references profiles(id),
  week_starting date not null,
  -- Overall status
  weekly_status text not null, -- 'going_well'|'improving'|'worth_watching'|'needs_attention'|'insufficient_data'
  summary_text text,
  -- Indicators (stored as jsonb for flexibility)
  indicators jsonb default '{}',
  meals_shared integer,
  data_completeness numeric,
  suggested_action text,
  generated_at timestamptz default now(),
  unique(workspace_id, supported_person_id, week_starting)
);

create table family_alerts (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  supported_person_id uuid not null references profiles(id),
  alert_type text not null, -- 'meals_missing' | 'portion_decline' | 'low_appetite' | etc.
  -- Alert content
  observed_pattern text not null,
  time_period_days integer not null,
  data_completeness numeric,
  confidence analysis_confidence not null,
  suggested_action text,
  -- Severity is deliberately limited for family product
  severity text not null default 'awareness', -- 'awareness' only; no 'high'
  dismissed boolean default false,
  dismissed_by uuid references profiles(id),
  dismissed_at timestamptz,
  created_at timestamptz default now()
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table profiles enable row level security;
alter table workspaces enable row level security;
alter table workspace_members enable row level security;
alter table meals enable row level security;
alter table notifications enable row level security;
alter table sharing_permissions enable row level security;
alter table coach_notes enable row level security;

-- Profiles: users see their own profile
create policy "profiles: own row" on profiles
  for all using (auth.uid() = id);

-- Workspaces: members can see workspaces they belong to
create policy "workspaces: member access" on workspaces
  for select using (
    id in (
      select workspace_id from workspace_members
      where user_id = auth.uid() and is_active = true
    )
  );

-- Meals: logger can see own meals; workspace members with permission can see others
create policy "meals: logger sees own" on meals
  for select using (meal_logger_id = auth.uid());

-- Coach notes: trainer-only, never visible to clients via RLS
create policy "coach_notes: trainer only" on coach_notes
  for select using (trainer_id = auth.uid());

-- Notifications: recipients see their own
create policy "notifications: own" on notifications
  for select using (recipient_id = auth.uid());

-- ============================================================
-- FUNCTIONS & TRIGGERS
-- ============================================================

-- Auto-update updated_at
create or replace function update_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger meals_updated_at before update on meals
  for each row execute function update_updated_at();

create trigger workspaces_updated_at before update on workspaces
  for each row execute function update_updated_at();

create trigger profiles_updated_at before update on profiles
  for each row execute function update_updated_at();

-- Auto-create profile on auth signup
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

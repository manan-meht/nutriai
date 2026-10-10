-- ─── Nutrition Guidance: an opt-in mode on top of meal tracking ────────────
-- Tracking stays exactly as it is. Guidance adds daily targets, a
-- consumed-versus-remaining view and next-meal suggestions. Everything here
-- is additive and nullable: a contact with no row in any of these tables is
-- in Tracking, which is every contact that exists today.
--
-- ─── Why the anchor is adults_contacts, not profiles ───────────────────────
-- The person whose nutrition is tracked is an adults_contacts row, and most
-- of them have no account at all — a parent who only ever messages the
-- WhatsApp bot is a contact, not a user. Hanging guidance off profiles
-- would make the feature available only to account holders, which is the
-- opposite of who it is for. gym_clients is deliberately out of scope for
-- this release; coaching is its own product now.
--
-- ─── Why targets are versioned rows rather than columns ────────────────────
-- adults_contacts already carries custom_macro_targets, which is a single
-- current value. A history view has to show the target that applied ON THE
-- DAY being looked at — a week where someone ate 1,800 kcal against a 1,700
-- target did not become a good week because the target was later raised to
-- 1,900. So targets are rows with effective dates, and the daily view joins
-- to whichever row covers that date.

-- ─── Policy versions and their review state ────────────────────────────────
-- A target-setting policy is engineering output until a qualified person
-- signs it off, and the difference has to be a fact in the database rather
-- than a claim in a commit message. Activation checks this table: an
-- unreviewed policy can run in development and staging but cannot be
-- offered to the public.

create table nutrition_policy_versions (
  version      text primary key,
  status       text not null default 'unreviewed'
               check (status in ('unreviewed', 'reviewed', 'retired')),
  summary      text not null,
  reviewed_by  text,
  reviewed_at  timestamptz,
  review_notes text,
  created_at   timestamptz not null default now(),

  -- A version cannot claim review without saying who and when. Keeps
  -- "reviewed" from being set by a stray update that forgot the provenance.
  constraint nutrition_policy_versions_review_provenance
    check (status <> 'reviewed' or (reviewed_by is not null and reviewed_at is not null))
);

alter table nutrition_policy_versions enable row level security;

comment on table nutrition_policy_versions is
  'One row per target-setting policy version. status=reviewed means a qualified reviewer signed it off; until then activation is limited to non-production environments.';

-- ─── Per-person guidance state ─────────────────────────────────────────────

create table nutrition_guidance (
  adults_contact_id uuid primary key references adults_contacts (id) on delete cascade,

  mode text not null default 'tracking' check (mode in ('tracking', 'guidance')),

  -- Activation is consent, so it records who performed it and under which
  -- policy. Returning to Tracking sets deactivated_at and leaves everything
  -- else intact — the brief is explicit that switching back preserves
  -- meals, preferences, targets and history, so nothing is deleted here.
  activated_at   timestamptz,
  deactivated_at timestamptz,

  -- Who actually opted in. The caregiver paying for the account is NOT
  -- permitted to activate on someone else's behalf, so this records the
  -- channel the consent arrived through and is checked on the server.
  -- 'self_account'      — the tracked person is the account holder
  --                       (relationship_type = 'self').
  -- 'end_user_session'  — the tracked person authenticated as themselves,
  --                       via WhatsApp OTP or an access code.
  -- 'whatsapp'          — the tracked person opted in from the bot thread,
  --                       which for a WhatsApp-only contact is the only
  --                       channel they have.
  activated_via text check (activated_via in ('self_account', 'end_user_session', 'whatsapp')),
  activated_by_profile_id uuid references profiles (id) on delete set null,
  activated_policy_version text references nutrition_policy_versions (version),

  -- Setup answers that shape suggestions rather than targets. Prefilled
  -- from adults_contacts where it already knows (timezone, dietary_profile,
  -- nutrition_goals) and confirmed rather than re-asked.
  meals_per_day     smallint check (meals_per_day between 1 and 8),
  usual_meal_times  jsonb,
  cooking_access    text check (cooking_access in ('full_kitchen', 'limited', 'none', 'unknown')),
  cuisines          text[] not null default '{}',
  allergies         text[] not null default '{}',
  avoided_foods     text[] not null default '{}',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Guidance cannot be on without a record of who turned it on and under
  -- which policy. This is the database half of the permission rule.
  constraint nutrition_guidance_activation_provenance
    check (mode <> 'guidance' or (activated_at is not null and activated_via is not null
           and activated_policy_version is not null))
);

alter table nutrition_guidance enable row level security;

comment on table nutrition_guidance is
  'Per-tracked-person guidance mode and the preferences that shape suggestions. Absence of a row means Tracking. Switching back to Tracking preserves every row here and in the target/meal tables.';

comment on column nutrition_guidance.activated_via is
  'The channel the tracked person consented through. A caregiver cannot activate for someone else, so this is never set from a caregiver session acting on another contact.';

-- ─── Suitability screening, kept apart on purpose ──────────────────────────
-- Separate table rather than columns on nutrition_guidance because the
-- brief requires these answers not be exposed to family viewers by default,
-- and the reliable way to not leak a column is for it not to be in the row
-- the viewer's query selects. Service-role access only.

create table nutrition_guidance_screening (
  adults_contact_id uuid primary key references adults_contacts (id) on delete cascade,

  -- The answers themselves, kept as a blob so adding a question is not a
  -- migration. Never returned to a caregiver viewing someone else.
  answers jsonb not null default '{}'::jsonb,

  -- 'supported'                  — the standard policy may run.
  -- 'needs_professional_review'  — minors, pregnancy or breastfeeding,
  --                                underweight, eating-disorder concerns,
  --                                or conditions/medications needing
  --                                therapeutic nutrition oversight. These
  --                                get ordinary tracking and a referral,
  --                                never automated restrictive targets.
  outcome text not null default 'needs_professional_review'
          check (outcome in ('supported', 'needs_professional_review')),
  outcome_reasons text[] not null default '{}',

  screened_at timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table nutrition_guidance_screening enable row level security;

comment on table nutrition_guidance_screening is
  'Suitability screening answers and outcome. Deliberately a separate table from nutrition_guidance so a caregiver reading a contact cannot select these columns by accident. Service-role only.';

-- ─── Versioned targets ─────────────────────────────────────────────────────

create table nutrition_targets (
  id uuid primary key default gen_random_uuid(),
  adults_contact_id uuid not null references adults_contacts (id) on delete cascade,

  policy_version text not null references nutrition_policy_versions (version),

  -- Half-open, in the tracked person's own local dates: effective_from is
  -- inclusive, effective_to exclusive, null meaning "still current". Dates
  -- rather than timestamps because a target applies to a DAY, and which day
  -- a moment belongs to is a question about the person's timezone.
  effective_from date not null,
  effective_to   date,

  calories_kcal integer not null check (calories_kcal > 0),
  protein_g     integer not null check (protein_g >= 0),
  carbs_g       integer not null check (carbs_g >= 0),
  fat_g         integer not null check (fat_g >= 0),
  -- Stored alongside the macros because the engine computes it and
  -- meal_logs has carried total_fiber_min/max since migration 0025, so a
  -- daily fiber total is as real as a daily protein total. Unlike the
  -- others it is not derived from the calorie figure at all — it is a flat
  -- target by age and sex — which is why the explanation says so.
  fiber_g       integer not null check (fiber_g >= 0),

  -- Everything that went into the number, so a target can be explained and
  -- recomputed later: weight, height, age, sex, activity, goals, the
  -- maintenance estimate, the goal adjustment, and the units each was in.
  inputs jsonb not null,

  -- Plain-language account of how the number was reached, shown on the
  -- review step before activation and on "View targets".
  explanation text not null,

  -- A target revision requires the tracked person's approval and creates a
  -- new row; it never edits an existing one.
  approved_at timestamptz not null default now(),
  approved_via text not null check (approved_via in ('self_account', 'end_user_session', 'whatsapp')),

  created_at timestamptz not null default now(),

  constraint nutrition_targets_effective_range
    check (effective_to is null or effective_to > effective_from)
);

-- The daily view asks "which target covered this date for this person?" on
-- every load, which is this index exactly.
create index nutrition_targets_contact_effective_idx
  on nutrition_targets (adults_contact_id, effective_from desc);

-- At most one open-ended target per person. Two rows with effective_to null
-- would make "today's target" ambiguous, and the ambiguity would surface as
-- a number that changes between page loads.
create unique index nutrition_targets_one_current_idx
  on nutrition_targets (adults_contact_id)
  where effective_to is null;

alter table nutrition_targets enable row level security;

comment on table nutrition_targets is
  'Versioned daily targets with effective dates. Historical views must join on the date being viewed, not read the current row — a past week is not re-judged against a target set afterwards.';

-- ─── Recommendations ───────────────────────────────────────────────────────
-- Stored so a suggestion can be shown again, and so it can be marked stale
-- when the day it was computed against changes underneath it.

create table meal_recommendations (
  id uuid primary key default gen_random_uuid(),
  adults_contact_id uuid not null references adults_contacts (id) on delete cascade,

  -- The local date the suggestion was for, in the tracked person's timezone.
  for_date date not null,

  -- 'suggest'  — "suggest my next meal", we choose the food.
  -- 'evaluate' — "I know what's cooking", they name the food and we portion it.
  kind text not null check (kind in ('suggest', 'evaluate')),

  -- What was asked, including any foods they said were available. Stored as
  -- given and treated as untrusted input everywhere downstream.
  request jsonb not null default '{}'::jsonb,

  target_id uuid references nutrition_targets (id) on delete set null,

  -- The confirmed meals the projection was computed against. Together with
  -- the target this is what makes a stored recommendation checkable: if the
  -- set has changed, the "if you eat this" totals are no longer true.
  source_meal_ids uuid[] not null default '{}',
  source_fingerprint text not null,

  -- Foods, portions with explicit cooked/raw labelling, macros, the short
  -- explanation and the substitutions. Schema-validated before it is
  -- written; see the recommendation service.
  recommendation jsonb,

  -- Deterministic arithmetic, never model output: consumed + suggested
  -- against the applicable target.
  projected jsonb,

  status text not null default 'fresh' check (status in ('fresh', 'stale', 'failed')),
  failure_reason text,

  created_at timestamptz not null default now()
);

create index meal_recommendations_contact_date_idx
  on meal_recommendations (adults_contact_id, for_date desc, created_at desc);

alter table meal_recommendations enable row level security;

comment on table meal_recommendations is
  'A suggested meal and its projected totals. Never a consumption record — only meal_logs is that. status=stale means the meals or target it was computed against have since changed.';

comment on column meal_recommendations.source_fingerprint is
  'Hash of the confirmed meal set and target this was computed against, so a correction or a late confirmation can mark the projection stale instead of leaving a wrong number on screen.';

-- ─── Weight entries and weekly check-ins ───────────────────────────────────

create table weight_entries (
  id uuid primary key default gen_random_uuid(),
  adults_contact_id uuid not null references adults_contacts (id) on delete cascade,
  recorded_on date not null,
  weight_kg numeric(5, 2) not null check (weight_kg > 0 and weight_kg < 500),
  source text not null default 'checkin' check (source in ('checkin', 'profile', 'whatsapp')),
  created_at timestamptz not null default now(),

  -- One weight per person per day. A second reading the same day replaces
  -- the first rather than making the trend depend on which was read last.
  unique (adults_contact_id, recorded_on)
);

create index weight_entries_contact_date_idx
  on weight_entries (adults_contact_id, recorded_on desc);

alter table weight_entries enable row level security;

create table guidance_checkins (
  id uuid primary key default gen_random_uuid(),
  adults_contact_id uuid not null references adults_contacts (id) on delete cascade,

  -- Local Monday of the week being reviewed, in the person's timezone.
  week_start date not null,

  -- Deliberately coarse 1-5 scales. Finer resolution would imply a
  -- precision these answers do not have, and invite scoring.
  hunger        smallint check (hunger between 1 and 5),
  energy        smallint check (energy between 1 and 5),
  manageability smallint check (manageability between 1 and 5),
  notes text,

  -- Recorded, and shown as a review state. This release does not change
  -- targets automatically from a weight trend: a calorie estimate cannot
  -- establish a weight change, and a revision needs explicit approval.
  review_state text not null default 'recorded'
               check (review_state in ('recorded', 'revision_suggested', 'revision_approved', 'dismissed')),

  created_at timestamptz not null default now(),

  unique (adults_contact_id, week_start)
);

create index guidance_checkins_contact_week_idx
  on guidance_checkins (adults_contact_id, week_start desc);

alter table guidance_checkins enable row level security;

comment on table guidance_checkins is
  'Optional weekly check-in. Stored and surfaced; never used to move a target on its own. Avoids streaks and pass/fail scoring by design.';

-- ─── Seed the first policy version, unreviewed ─────────────────────────────
-- Unreviewed is the honest starting state and it is what gates public
-- activation. Flipping it to reviewed is a deliberate act by a qualified
-- person, recorded with their name and the date.

insert into nutrition_policy_versions (version, status, summary)
values (
  'v1-mifflin-2026-10',
  'unreviewed',
  'Reuses the existing validated macro engine in packages/health-scoring: Mifflin-St Jeor maintenance estimate, activity factor, per-goal calorie adjustment and per-goal protein/fat allocation, with carbohydrate as the remainder. Adds suitability screening and explicit safety limits on top.'
);

-- ─── Guidance: turned on by the account holder, and for coach clients ──────
-- Product decision, 2026-10-27. 0068 let only the tracked person turn
-- Guidance on. Most tracked people never open the app: a parent who only
-- messages the WhatsApp bot, or a gym client their coach logs for. So the
-- account holder who tracks them may now turn it on for them: a family
-- caregiver, or a coach.
--
-- Two changes follow.
--
-- 1. Consent is still recorded honestly. activated_via and approved_via gain
--    'caregiver' and 'coach', so a target set on someone's behalf can always
--    be told apart from one they approved themselves. Reusing 'self_account'
--    would have made the audit trail say the person consented when they did
--    not.
--
-- 2. Coach clients become Guidance subjects. 0068 hung every table off
--    adults_contacts and left gym_clients out. The three tables activation
--    writes (nutrition_guidance, nutrition_guidance_screening and
--    nutrition_targets) now take either an adults_contact_id or a
--    gym_client_id, with a check that exactly one is set. The other three
--    0068 tables back features not built yet, and stay family-only until
--    they are.
--
--    nutrition_guidance and nutrition_guidance_screening were keyed by
--    adults_contact_id. They get a surrogate id instead, and a unique
--    constraint per subject column. Upserts use ON CONFLICT (column), which
--    needs a plain unique constraint: a partial unique index cannot be
--    inferred from ON CONFLICT (column). Postgres treats NULLs as distinct,
--    so many gym rows with a null adults_contact_id do not collide.
--
-- Additive for existing rows: every row written under 0068 has an
-- adults_contact_id, so it satisfies the one-subject check unchanged.
-- Safe to re-run.

-- ─── 1. Consent channels ───────────────────────────────────────────────────

alter table nutrition_guidance drop constraint if exists nutrition_guidance_activated_via_check;
alter table nutrition_guidance add constraint nutrition_guidance_activated_via_check
  check (activated_via in ('self_account', 'end_user_session', 'whatsapp', 'caregiver', 'coach'));

alter table nutrition_targets drop constraint if exists nutrition_targets_approved_via_check;
alter table nutrition_targets add constraint nutrition_targets_approved_via_check
  check (approved_via in ('self_account', 'end_user_session', 'whatsapp', 'caregiver', 'coach'));

comment on column nutrition_guidance.activated_via is
  'Who turned Guidance on. self_account, end_user_session and whatsapp are the tracked person; caregiver and coach are the account holder acting on their behalf.';

-- ─── 2. Coach clients as subjects ──────────────────────────────────────────

-- nutrition_guidance
alter table nutrition_guidance add column if not exists id uuid not null default gen_random_uuid();
alter table nutrition_guidance add column if not exists gym_client_id uuid references gym_clients (id) on delete cascade;
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'nutrition_guidance_pkey'
             and conrelid = 'nutrition_guidance'::regclass
             and pg_get_constraintdef(oid) like '%adults_contact_id%') then
    alter table nutrition_guidance drop constraint nutrition_guidance_pkey;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'nutrition_guidance_pkey') then
    alter table nutrition_guidance add constraint nutrition_guidance_pkey primary key (id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'nutrition_guidance_adults_contact_id_key') then
    alter table nutrition_guidance add constraint nutrition_guidance_adults_contact_id_key unique (adults_contact_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'nutrition_guidance_gym_client_id_key') then
    alter table nutrition_guidance add constraint nutrition_guidance_gym_client_id_key unique (gym_client_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'nutrition_guidance_one_subject') then
    alter table nutrition_guidance add constraint nutrition_guidance_one_subject
      check (num_nonnulls(adults_contact_id, gym_client_id) = 1);
  end if;
end
$$;
-- Only now: a primary-key column cannot lose NOT NULL, so this waits for
-- the key to move to id above.
alter table nutrition_guidance alter column adults_contact_id drop not null;

-- nutrition_guidance_screening
alter table nutrition_guidance_screening add column if not exists id uuid not null default gen_random_uuid();
alter table nutrition_guidance_screening add column if not exists gym_client_id uuid references gym_clients (id) on delete cascade;
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'nutrition_guidance_screening_pkey'
             and conrelid = 'nutrition_guidance_screening'::regclass
             and pg_get_constraintdef(oid) like '%adults_contact_id%') then
    alter table nutrition_guidance_screening drop constraint nutrition_guidance_screening_pkey;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'nutrition_guidance_screening_pkey') then
    alter table nutrition_guidance_screening add constraint nutrition_guidance_screening_pkey primary key (id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'nutrition_guidance_screening_adults_contact_id_key') then
    alter table nutrition_guidance_screening add constraint nutrition_guidance_screening_adults_contact_id_key unique (adults_contact_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'nutrition_guidance_screening_gym_client_id_key') then
    alter table nutrition_guidance_screening add constraint nutrition_guidance_screening_gym_client_id_key unique (gym_client_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'nutrition_guidance_screening_one_subject') then
    alter table nutrition_guidance_screening add constraint nutrition_guidance_screening_one_subject
      check (num_nonnulls(adults_contact_id, gym_client_id) = 1);
  end if;
end
$$;
-- Only now: a primary-key column cannot lose NOT NULL, so this waits for
-- the key to move to id above.
alter table nutrition_guidance_screening alter column adults_contact_id drop not null;

-- nutrition_targets: already has a surrogate id. One current row per coach
-- client, mirroring nutrition_targets_one_current_idx for family contacts.
alter table nutrition_targets add column if not exists gym_client_id uuid references gym_clients (id) on delete cascade;
alter table nutrition_targets alter column adults_contact_id drop not null;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'nutrition_targets_one_subject') then
    alter table nutrition_targets add constraint nutrition_targets_one_subject
      check (num_nonnulls(adults_contact_id, gym_client_id) = 1);
  end if;
end
$$;
create index if not exists nutrition_targets_gym_client_effective_idx
  on nutrition_targets (gym_client_id, effective_from desc);
create unique index if not exists nutrition_targets_one_current_gym_idx
  on nutrition_targets (gym_client_id)
  where effective_to is null and gym_client_id is not null;

-- WhatsApp-first onboarding: the human always sends the first message (a
-- prefilled "JOIN <TYPE> <TOKEN>" deep link), never the bot. This sidesteps
-- the Meta requirement that businesses can't freely message someone who
-- hasn't messaged them first (that needs an approved template) — since the
-- invitee taps "send" themselves, no template/business-verification
-- dependency exists for onboarding.
--
-- Design notes (deviating slightly from a fully generic spec to fit this
-- schema):
--  * `target_profile_id` is a single polymorphic column (adults_contacts.id
--    for family/self, gym_clients.id for coach_client) instead of separate
--    family_account_id/coach_id/client_id columns — those would have been
--    redundant here since "coach_id" is always just created_by_user_id, and
--    a single contact/client id fully identifies the target either way.
--  * For the self flow, target_profile_id starts NULL — no adults_contacts
--    row is created until the invite is actually claimed (the whole point
--    of self-tracking is the person messages from their own number; asking
--    them to type that same number into a web form first is redundant).
--  * No RLS policies are defined — invite reads/writes go through the
--    service-role client with ownership checks done in the calling server
--    action (same posture as the meal-review console tables in 0013).

create table whatsapp_invites (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  invite_type text not null check (invite_type in ('family', 'self', 'coach_client')),
  created_by_user_id uuid not null references profiles(id),
  workspace_id uuid not null,
  -- adults_contacts.id (family/self) or gym_clients.id (coach_client).
  -- Null for a 'self' invite until claimed, since the profile doesn't
  -- exist yet at invite-creation time.
  target_profile_id uuid,
  intended_phone text,
  status text not null default 'pending' check (status in ('pending', 'claimed', 'expired', 'revoked')),
  claimed_by_whatsapp_number text,
  claimed_at timestamptz,
  expires_at timestamptz not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index whatsapp_invites_token_idx on whatsapp_invites (token);
create index whatsapp_invites_workspace_idx on whatsapp_invites (workspace_id);
create index whatsapp_invites_target_profile_idx on whatsapp_invites (target_profile_id);
create index whatsapp_invites_status_idx on whatsapp_invites (status);

alter table whatsapp_invites enable row level security;

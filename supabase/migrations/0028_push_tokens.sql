-- Push notification device tokens.
--
-- Generic by design — not family-specific. One row per (profile, device):
-- a caregiver could have the app installed on more than one Android phone,
-- and each gets its own Expo push token. The "family meal logged" trigger
-- is the first consumer, gated at the call site (see saveMeal() in
-- src/lib/whatsapp/conversation-handler.ts) rather than in this schema, so
-- adding a second notification type (e.g. coach/gym, meal reminders) or a
-- second trigger later needs no migration — just another call to the same
-- send helper (src/lib/notifications/push.ts).
--
-- iOS isn't in scope yet (Android-only per the current request), but the
-- table shape doesn't assume a platform, so adding iOS tokens later is just
-- inserting rows with platform = 'ios' — no schema change needed.

create table push_tokens (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  expo_push_token text not null,
  platform text not null check (platform in ('android', 'ios')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- A given physical device/Expo installation should only ever have one
  -- current token per profile — re-registering (e.g. after reinstall)
  -- upserts in place rather than accumulating stale duplicates.
  unique (profile_id, expo_push_token)
);

create index push_tokens_profile_id_idx on push_tokens(profile_id);

-- RLS: tokens are written by the authenticated user themselves (the mobile
-- app registers its own device) and otherwise only read by the service-role
-- client when sending a notification, which bypasses RLS.
alter table push_tokens enable row level security;

create policy "Users can manage their own push tokens"
  on push_tokens for all
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

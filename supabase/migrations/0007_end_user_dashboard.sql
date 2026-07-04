-- Backend for the optional End User Dashboard: WhatsApp-OTP-verified,
-- session-cookie-based access for the end user themself (the adults_contact
-- or gym_client whose meals are being logged), separate from the existing
-- caregiver/coach Supabase-Auth login. No new relationship table is needed
-- for "who has access" — today's model is single-caregiver-owns-contact
-- (adults_contacts.caregiver_id / gym_clients.trainer_id), unlike the
-- unused legacy profiles-based sharing_permissions/support_relationships
-- tables from an earlier, superseded product design.

create table end_user_otp_codes (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null,
  contact_type text not null check (contact_type in ('adults', 'gym')),
  whatsapp_number text not null,
  code_hash text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  attempt_count int not null default 0,
  created_at timestamptz not null default now()
);

create index end_user_otp_codes_lookup on end_user_otp_codes (whatsapp_number, created_at desc);

create table end_user_sessions (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null,
  contact_type text not null check (contact_type in ('adults', 'gym')),
  session_token_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  last_seen_at timestamptz not null default now(),
  device_label text
);

create index end_user_sessions_contact on end_user_sessions (contact_id, contact_type);

-- One row per contact, created on first verification. Lets the end user
-- pause sharing (hide new meals from the caregiver/coach view) or request
-- their contact record be removed, without touching the caregiver's data
-- or requiring the caregiver's involvement to action the pause itself.
create table end_user_access_settings (
  contact_id uuid primary key,
  contact_type text not null check (contact_type in ('adults', 'gym')),
  paused_at timestamptz,
  removal_requested_at timestamptz,
  updated_at timestamptz not null default now()
);

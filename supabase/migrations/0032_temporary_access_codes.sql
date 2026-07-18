-- Temporary Access Codes — a Beta-safe fallback for participant login that
-- doesn't depend on WhatsApp/SMS OTP delivery (see
-- END_USER_OTP_PEPPER/MSG91/Twilio setup, which has been unreliable to
-- stand up). A family owner or coach generates a one-time code and shares
-- it manually (usually over WhatsApp); the participant enters it on the
-- exact same "I was invited" verification screen already used for OTP.
--
-- Extends end_user_otp_codes rather than creating a new
-- temporary_access_codes table (per the "don't create a new table if an
-- existing one can be safely extended" instruction) — that table already
-- is a one-time hashed-code store keyed by contact_id/contact_type/
-- whatsapp_number with expiry and attempt tracking; verifyOtp's existing
-- logic works unchanged for a manually-generated code, since both are the
-- same kind of row. Only what's missing gets added: who generated it (and
-- in what role), revocation, and a temporary lock after too many failed
-- attempts.
alter table end_user_otp_codes
  add column if not exists generated_by_user_id uuid,
  add column if not exists generated_by_role text check (generated_by_role in ('family_owner', 'coach')),
  add column if not exists revoked_at timestamptz,
  add column if not exists locked_until timestamptz,
  add column if not exists updated_at timestamptz not null default now();

-- Consent screen ("Review your Tistra Health access") — one row per
-- contact already exists here for pause/removal; consent_accepted_at
-- fits the same "one row per contact, contact owns this" shape rather
-- than a new table.
alter table end_user_access_settings
  add column if not exists consent_accepted_at timestamptz;

-- Audit trail for the access-code lifecycle. No existing generic audit
-- table exists in this schema, so this is new — deliberately narrow
-- (event name + minimal context), not a general-purpose event log.
create table if not exists end_user_audit_events (
  id uuid primary key default gen_random_uuid(),
  event text not null check (event in (
    'code_generated', 'code_regenerated', 'code_revoked',
    'code_verification_failed', 'code_used', 'participant_access_granted'
  )),
  contact_id uuid not null,
  contact_type text not null check (contact_type in ('adults', 'gym')),
  actor_user_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists end_user_audit_events_contact_idx
  on end_user_audit_events (contact_id, contact_type, created_at desc);

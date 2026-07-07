-- Optional WhatsApp reminders nudging a tracked person to share a meal
-- photo. Defaults to 8am/12pm/7pm, but both the timezone and the times
-- themselves are editable by whoever adds/edits the contact — country-code
-- based timezone guessing is only ever a starting point (many countries
-- span multiple zones), never authoritative.
--
-- Added to both adults_contacts and gym_clients since the sending
-- mechanism (a plain WhatsApp text) is identical for either.
alter table adults_contacts
  add column if not exists timezone text not null default 'Asia/Kolkata',
  add column if not exists reminders_enabled boolean not null default false,
  add column if not exists reminder_times jsonb not null default '["08:00", "12:00", "19:00"]'::jsonb;

alter table gym_clients
  add column if not exists timezone text not null default 'Asia/Kolkata',
  add column if not exists reminders_enabled boolean not null default false,
  add column if not exists reminder_times jsonb not null default '["08:00", "12:00", "19:00"]'::jsonb;

-- Idempotency log so a reminder is never sent twice for the same contact/
-- slot/local-day even if the periodic sender check runs more than once
-- within the same window (e.g. an external cron pinger retrying, or two
-- overlapping invocations) — the unique index is the actual guarantee,
-- not just the application-level check-then-insert.
create table if not exists meal_reminder_sends (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null,
  contact_type text not null check (contact_type in ('adults', 'gym')),
  local_date date not null,
  reminder_time text not null,
  sent_at timestamptz not null default now()
);

create unique index if not exists meal_reminder_sends_dedupe_idx
  on meal_reminder_sends (contact_id, contact_type, local_date, reminder_time);

alter table meal_reminder_sends enable row level security;

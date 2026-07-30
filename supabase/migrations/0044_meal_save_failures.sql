-- Failed meal_logs inserts (see saveMeal() in
-- src/lib/whatsapp/conversation-handler.ts) previously left zero trace
-- anywhere — by design, the row is never written on failure (so the user
-- is never falsely told "saved"), but that also meant a persistent
-- (non-transient) failure couldn't be diagnosed after the fact without a
-- live log tail during the exact window it happened. This table captures
-- the real Postgres error for every failed attempt so it can be queried
-- directly instead.
create table meal_save_failures (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references workspaces(id) on delete set null,
  adults_contact_id uuid references adults_contacts(id) on delete set null,
  client_id uuid references gym_clients(id) on delete set null,
  error_message text not null,
  analysis jsonb not null,
  created_at timestamptz not null default now()
);

comment on table meal_save_failures is
  'Audit log of meal_logs insert failures from the WhatsApp conversation handler (saveMeal()), keyed loosely to whichever contact/client the attempt was for. No cleanup job yet — low volume expected.';

create index meal_save_failures_workspace_id_idx on meal_save_failures (workspace_id);
create index meal_save_failures_created_at_idx on meal_save_failures (created_at);

-- No owner column meaningful to an RLS policy here (this is purely a
-- service-role diagnostic log, same as payment_webhook_events and the
-- whatsapp_processed_* dedup tables) — RLS with no policies denies
-- anon/authenticated access outright.
alter table meal_save_failures enable row level security;

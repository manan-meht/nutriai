-- WhatsApp (Meta) redelivers webhooks whenever our handler doesn't ack
-- within its timeout window — expected any time a photo analysis (LLM
-- call) runs long. Without this, a single retried delivery of the same
-- wamid was processed as a brand-new message: two independent AI analysis
-- runs, each sending its own (slightly different) reply to the user, plus
-- "still processing" messages from the conversation lock rejecting the
-- redelivered attempts that overlapped with the first run.
--
-- This table is a simple claim: the webhook handler tries to insert the
-- inbound message's wamid before doing any work; if the insert conflicts
-- (already present), it's a redelivery of a message we've already started
-- or finished processing, and is skipped entirely — no AI call, no reply.
create table whatsapp_processed_messages (
  message_id text primary key,
  processed_at timestamptz not null default now()
);

comment on table whatsapp_processed_messages is
  'Idempotency claim table for inbound WhatsApp webhook messages, keyed by Meta''s wamid. No cleanup job yet — small per-row size and low volume relative to other tables makes unbounded growth an acceptable tradeoff for now; add a retention job if this becomes a real storage concern.';

-- No owner column exists (this isn't a per-contact table), so there's no
-- meaningful policy to write — only the service-role webhook handler ever
-- touches this table, which bypasses RLS entirely. Enabling RLS with no
-- policies still denies anon/authenticated access outright, matching
-- payment_webhook_events' identical internal-only-table convention
-- (0001_entitlements.sql).
alter table whatsapp_processed_messages enable row level security;

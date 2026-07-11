-- The wamid dedup in 0024 only catches Meta redelivering the exact same
-- webhook message. It does not catch the WhatsApp client itself silently
-- resending a photo as a second, distinct message (its own wamid) after a
-- flaky send — invisible to the user as "one photo," but two independent
-- messages to us, each producing its own AI analysis and its own meal_logs
-- row for the same food.
--
-- WhatsApp media ids are unique per upload, so claiming a media id the same
-- way as a message id closes that gap: the second message carrying the same
-- photo is skipped entirely, no AI call, no second log entry.
create table whatsapp_processed_media (
  media_id text primary key,
  processed_at timestamptz not null default now()
);

comment on table whatsapp_processed_media is
  'Idempotency claim table for inbound WhatsApp image messages, keyed by Meta''s media id, so the same photo resent as a second WhatsApp message (distinct wamid) is not analyzed/logged twice. No cleanup job yet, same rationale as whatsapp_processed_messages.';

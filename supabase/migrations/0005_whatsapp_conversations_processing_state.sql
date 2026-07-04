-- Allows the WhatsApp conversation-handler's compare-and-swap lock
-- (see src/lib/whatsapp/conversation-handler.ts, claimConversationLock) to
-- write a transient "processing" state while a message is being analyzed.
--
-- Without this, every lock-claim attempt failed with:
--   new row for relation "whatsapp_conversations" violates check
--   constraint "whatsapp_conversations_state_check"
-- since the original constraint only allowed idle/awaiting_confirmation/
-- awaiting_correction. This is what caused the permanent
-- "Still working on your last message" reply for every photo message —
-- the lock could never actually be acquired.

alter table whatsapp_conversations drop constraint whatsapp_conversations_state_check;

alter table whatsapp_conversations add constraint whatsapp_conversations_state_check
  check (state = any (array[
    'idle'::text,
    'awaiting_confirmation'::text,
    'awaiting_correction'::text,
    'processing'::text
  ]));

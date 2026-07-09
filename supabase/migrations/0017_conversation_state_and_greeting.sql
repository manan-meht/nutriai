-- Extends whatsapp_conversations to support the richer confirm/correct/
-- clarify state machine (see src/lib/whatsapp/conversation-handler.ts):
--
--   idle -> awaiting_confirmation -> (saved, back to idle)
--   idle/awaiting_correction -> awaiting_clarification (uncertain/zero-macro food)
--   awaiting_confirmation -> awaiting_correction_confirmation (correction
--     conflicts strongly with the photo, e.g. "tea" corrected to "wine")
--
-- Also adds last_greeted_at so the bot only sends the full onboarding
-- greeting once per day / after a long gap, instead of on every "hi".

alter table whatsapp_conversations drop constraint whatsapp_conversations_state_check;

alter table whatsapp_conversations add constraint whatsapp_conversations_state_check
  check (state = any (array[
    'idle'::text,
    'awaiting_confirmation'::text,
    'awaiting_correction'::text,
    'awaiting_clarification'::text,
    'awaiting_correction_confirmation'::text,
    'processing'::text
  ]));

alter table whatsapp_conversations
  add column if not exists last_greeted_at timestamptz;

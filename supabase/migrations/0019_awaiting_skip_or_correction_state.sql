-- Adds the "awaiting_skip_or_correction" state (see
-- src/lib/whatsapp/conversation-handler.ts) — used when the user replies
-- with a bare negative ("no", "nope", "nah", "no thanks") to a pending meal
-- estimate. A bare negative is ambiguous (it could mean "discard this" or
-- "let me correct it"), so instead of guessing, the bot asks a follow-up
-- and parks the pending meal in this state until the user clarifies with
-- either an explicit discard ("skip") or an actual correction.

alter table whatsapp_conversations drop constraint whatsapp_conversations_state_check;

alter table whatsapp_conversations add constraint whatsapp_conversations_state_check
  check (state = any (array[
    'idle'::text,
    'awaiting_confirmation'::text,
    'awaiting_correction'::text,
    'awaiting_clarification'::text,
    'awaiting_correction_confirmation'::text,
    'awaiting_skip_or_correction'::text,
    'processing'::text
  ]));

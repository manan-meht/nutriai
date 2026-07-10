-- Supports the confidence-based auto-save flow (see
-- src/lib/whatsapp/conversation-handler.ts and src/lib/ai/food-analyzer.ts):
-- high/medium-confidence meals are now auto-saved instead of waiting for
-- an explicit "Yes", and can be removed afterwards with "Undo" while still
-- within the recent-edit window. Adds the "awaiting_edit_or_undo" state,
-- used when the user replies with a bare "no" to a just-auto-saved meal —
-- ambiguous between "remove this" and "let me correct something," so the
-- bot asks which rather than guessing (mirrors awaiting_skip_or_correction,
-- added in 0019, for the pre-save case).
--
-- No changes to meal_logs are required: "Undo" is implemented as a plain
-- delete of the just-saved row (meal_submissions/ai_meal_classifications
-- reference it via `meal_log_id ... on delete set null`, per
-- 0013_meal_review_console.sql, so review-console data survives with the
-- link cleared rather than being deleted itself).

alter table whatsapp_conversations drop constraint whatsapp_conversations_state_check;

alter table whatsapp_conversations add constraint whatsapp_conversations_state_check
  check (state = any (array[
    'idle'::text,
    'awaiting_confirmation'::text,
    'awaiting_correction'::text,
    'awaiting_clarification'::text,
    'awaiting_correction_confirmation'::text,
    'awaiting_skip_or_correction'::text,
    'awaiting_edit_or_undo'::text,
    'processing'::text
  ]));

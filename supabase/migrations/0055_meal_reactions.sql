-- Family-loop reactions: a caregiver taps 👍/🎉/❤️ on a meal card and the
-- person who logged the meal gets a WhatsApp line ("Manan saw your lunch
-- and sent you a 🎉"). The retention insight behind it: for most tracked
-- contacts the reward for logging isn't macros, it's being seen by their
-- family — this closes that loop.
--
-- One row per (meal, reactor). The FIRST reaction is what triggers the
-- WhatsApp send; changing the emoji later updates the row silently (no
-- resend), so a caregiver can never accidentally spam the contact by
-- toggling emojis. That send-once rule is enforced in the server action
-- (reactToMeal), with this table's unique constraint as its backstop.

create table meal_reactions (
  id uuid primary key default gen_random_uuid(),
  meal_log_id uuid not null references meal_logs(id) on delete cascade,
  /** The caregiver (auth user) who reacted — profiles mirrors auth users. */
  reactor_profile_id uuid not null references profiles(id),
  emoji text not null check (emoji in ('👍', '🎉', '❤️')),
  /** Whether the WhatsApp notification was actually delivered to the
   * contact — false when the send failed (usually the 24h customer-service
   * window being closed for an old meal). Kept for debugging/metrics, not
   * user-facing. */
  whatsapp_delivered boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (meal_log_id, reactor_profile_id)
);

create index meal_reactions_meal_idx on meal_reactions (meal_log_id);

-- Same access posture as the other internal tables (see migration 0013):
-- RLS on with no policies — only the service-role client (server actions)
-- reads or writes; anon/authenticated keys get nothing.
alter table meal_reactions enable row level security;

const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

export type InviteStatus = 'connected' | 'stale' | 'not_connected';

/** Three states, not two — see conversation-handler.ts's WhatsApp 24h
 * customer-service window comment (send-meal-reminders/route.ts) for why
 * "connected at some point" isn't the same as "reminders will actually be
 * delivered right now":
 * - "not_connected": inviteAcceptedAt never set — never messaged the bot.
 * - "stale": inviteAcceptedAt is set, but lastMessageAt is more than 24h
 *   ago (or missing) — meal reminders won't be delivered until the
 *   contact messages again, even though they're a genuine, active user.
 * - "connected": messaged within the last 24h. */
export function inviteStatusFor(contact: { inviteAcceptedAt?: string; lastMessageAt?: string }): InviteStatus {
  if (!contact.inviteAcceptedAt) return 'not_connected';
  if (!contact.lastMessageAt) return 'stale';
  return Date.now() - new Date(contact.lastMessageAt).getTime() > STALE_AFTER_MS ? 'stale' : 'connected';
}

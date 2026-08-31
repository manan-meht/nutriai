-- Dead push tokens were never detected or removed.
--
-- An Expo push goes out in two stages: the send returns a *ticket* (the
-- message was accepted for delivery), and a *receipt*, fetched afterwards,
-- says what FCM/APNs actually did with it. src/lib/notifications/push.ts
-- only ever checked the HTTP status of the send, so a token whose device
-- had reinstalled the app — FCM answers "DeviceNotRegistered" — looked
-- exactly like a successful delivery. The row stayed, the next meal was
-- "sent" to it again, and the caregiver was never notified.
--
-- Found the hard way: a family-plan caregiver stopped receiving meal
-- notifications entirely, and all nine of their registered tokens turned
-- out to be DeviceNotRegistered. The oldest was 6 weeks old; the newest had
-- been refreshed 3 days earlier. Nothing in the system could tell.
--
-- Note that push_tokens's unique(profile_id, expo_push_token) does NOT make
-- this self-correcting, despite what 0028's comment claims: a reinstall
-- mints a BRAND NEW Expo token, so it inserts a new row and simply orphans
-- the old one. One profile had accumulated 34. Pruning is the only thing
-- that bounds the table.
--
-- These two columns let the send record which ticket a token's last message
-- got, so the cron sweep in /api/cron/send-meal-reminders can look the
-- receipt up later (Expo needs a few minutes) and delete what's dead.

alter table push_tokens
  add column last_ticket_id text,
  add column last_sent_at timestamptz;

-- Partial index: the sweep only ever looks for tokens with an unresolved
-- ticket, which is a small fraction of the table at any moment.
create index push_tokens_pending_receipt_idx
  on push_tokens (last_sent_at)
  where last_ticket_id is not null;

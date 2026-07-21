-- Tracks whether the "your trial ends soon" reminder email has been sent
-- for this entitlement's current trial, so the reminder cron (see
-- src/app/api/cron/send-trial-reminders/route.ts) doesn't re-send it every
-- time it runs. Nullable/additive — existing rows are unaffected.
alter table entitlements add column if not exists trial_reminder_sent_at timestamptz;

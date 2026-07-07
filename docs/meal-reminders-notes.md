# Meal reminders — setup notes

Optional WhatsApp reminders nudging a tracked person to share a meal photo.
Defaults to 8am/12pm/7pm in their own timezone; both the timezone and times
are editable per-contact (Add/Edit contact modals).

## What's already built

- `adults_contacts` / `gym_clients`: `timezone`, `reminders_enabled`, `reminder_times` columns (migration `0016`).
- `meal_reminder_sends`: dedupe log so a reminder is never sent twice for the same contact/slot/local-day.
- `POST /api/cron/send-meal-reminders`: checks every enabled contact, sends any due reminder, protected by `CRON_SECRET`.
- `src/lib/reminders/schedule.ts`: pure, tested timezone-aware "is this reminder due" logic.

## What you still need to set up

Cloudflare Pages has **no built-in Cron Triggers** (those only exist for standalone Workers) — this endpoint has to be pinged periodically by something external. Two options, pick one:

### Option A — external cron ping service (fastest, no extra Cloudflare deploy)

Use a free service like [cron-job.org](https://cron-job.org) or [EasyCron](https://www.easycron.com):
- URL: `https://tistrahealth.com/api/cron/send-meal-reminders`
- Method: `POST`
- Header: `Authorization: Bearer <your CRON_SECRET>`
- Interval: every 15 minutes

### Option B — a small companion Cloudflare Worker with a Cron Trigger

If you'd rather keep everything inside Cloudflare, create a minimal second Worker (separate from this Pages project) with a `wrangler.toml` Cron Trigger (`*/15 * * * *`) whose only job is to `fetch()` the endpoint above with the same header. More setup, but no third-party dependency.

Either way, sending is idempotent — pinging more often than necessary just does less work, it will never double-send (enforced by `meal_reminder_sends`' unique index, not just the time-window check).

## Reminder message

Currently a fixed, non-templated WhatsApp text (`src/lib/reminders/messages.ts`). Since this is a business-initiated message to someone who may not have messaged first that day, the same Meta rule discussed for onboarding (see `src/lib/invites`) applies: if the recipient hasn't messaged the bot within the last 24 hours, this free-form send will be rejected by the WhatsApp API and silently fail (the route logs the error but doesn't retry). Once an approved reminder template exists, swap this to `sendTemplateMessage` for reliability outside the 24-hour customer-service window.

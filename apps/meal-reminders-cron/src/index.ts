export interface Env {
  TARGET_URL: string;
  CRON_SECRET: string;
}

// Cloudflare Pages has no built-in Cron Triggers (those only exist for
// standalone Workers) — this tiny Worker's only job is to exist as
// something WITH a Cron Trigger, and ping the main app's reminder-sending
// route on schedule. See docs/meal-reminders-notes.md for the full
// picture: the actual reminder logic (which contacts are due, dedup,
// sending) all lives in the main app; this is purely the "wake it up
// every 5 minutes" mechanism Cloudflare Pages itself can't provide.
//
// That single route (src/app/api/cron/send-meal-reminders) also resolves
// stale WhatsApp clarification questions (auto-saves a meal as a best
// guess after 10+ minutes of silence) — folded into the same route
// rather than a second one specifically to keep this Worker's target
// count at one. A standalone route for that previously pushed the main
// app's Worker bundle over Cloudflare Pages' 25 MiB limit and failed a
// deploy (each additional route file costs real fixed overhead); one
// shared, idempotent route pinged from here avoids that entirely.
export default {
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      fetch(env.TARGET_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${env.CRON_SECRET}` },
      }).then(async (res) => {
        if (!res.ok) {
          console.error(`[meal-reminders-cron] send-meal-reminders returned ${res.status}: ${await res.text().catch(() => "")}`);
        }
      })
    );
  },

  // Workers require a fetch handler even when only used for a Cron
  // Trigger — this just confirms the Worker is alive if hit manually.
  async fetch(): Promise<Response> {
    return new Response("nutriai-meal-reminders-cron is running. See wrangler.toml for its schedule.");
  },
};

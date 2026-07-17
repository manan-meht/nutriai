export interface Env {
  TARGET_URL: string;
  STALE_CLARIFICATIONS_TARGET_URL: string;
  CRON_SECRET: string;
}

// Cloudflare Pages has no built-in Cron Triggers (those only exist for
// standalone Workers) — this tiny Worker's only job is to exist as
// something WITH a Cron Trigger, and ping the main app's reminder-sending
// route on schedule. See docs/meal-reminders-notes.md for the full
// picture: the actual reminder logic (which contacts are due, dedup,
// sending) all lives in the main app; this is purely the "wake it up
// every 15 minutes" mechanism Cloudflare Pages itself can't provide.
//
// It also pings resolve-stale-clarifications on the same schedule — that
// route auto-saves (as a best guess) any meal that's been sitting on an
// unanswered clarification question for 10+ minutes and releases the
// conversation lock. Piggybacking on this Worker's existing 5-minute-or-
// tighter trigger (rather than standing up a second Worker) is fine since
// that route is idempotent too (it only acts on rows still stuck in
// "awaiting_clarification" past the threshold).
export default {
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    const ping = (url: string, label: string) =>
      fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${env.CRON_SECRET}` },
      }).then(async (res) => {
        if (!res.ok) {
          console.error(`[meal-reminders-cron] ${label} returned ${res.status}: ${await res.text().catch(() => "")}`);
        }
      });

    ctx.waitUntil(ping(env.TARGET_URL, "send-meal-reminders"));
    ctx.waitUntil(ping(env.STALE_CLARIFICATIONS_TARGET_URL, "resolve-stale-clarifications"));
  },

  // Workers require a fetch handler even when only used for a Cron
  // Trigger — this just confirms the Worker is alive if hit manually.
  async fetch(): Promise<Response> {
    return new Response("nutriai-meal-reminders-cron is running. See wrangler.toml for its schedule.");
  },
};

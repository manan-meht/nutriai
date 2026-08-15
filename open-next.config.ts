// OpenNext adapter config for Cloudflare Workers. Replaces
// @cloudflare/next-on-pages (Pages), whose 25 MiB uncompressed Functions
// limit the app outgrew in Aug 2026 — Workers enforces 10 MiB *compressed*
// instead, which this bundle fits with room (measured ~8.2 MiB gzip).
// Minimal config: no ISR/queue/cache overrides — this app does no ISR and
// every dynamic route talks straight to Supabase.
import { defineCloudflareConfig } from "@opennextjs/cloudflare";

export default defineCloudflareConfig();

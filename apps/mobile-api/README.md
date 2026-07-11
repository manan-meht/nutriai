# nutriai-mobile-api

Read-only API for the Tistra Health mobile app (Expo/React Native), covering
login/session verification and dashboard reads for the **gym**, **adults**,
and **self** products.

## Why this is a separate app, not part of the main Next.js app

The main app (`nutriai-fresh`, deployed as its own Cloudflare Pages project)
is already at ~99% of Cloudflare's 25 MiB Worker bundle size limit. Adding
these routes there — even fully consolidated into 2 files — pushed the
total to ~26 MiB and reproduced the "Failed to publish your Function"
deploy failure the main app was already hitting. Deploying this as its own
Cloudflare Pages project gives it an independent 25 MiB budget instead of
competing with the main app's for space.

## Shared read/mapping logic lives in @nutriai/nutrition-core

This repo is an npm workspace (see the root `package.json`'s `workspaces`
field). `src/lib/adults.ts`, `src/lib/gym.ts`, and `src/lib/entitlements.ts`
are thin wrappers around `packages/nutrition-core`, which the main app's
`src/app/(adults)/adults/dashboard/actions.ts`,
`src/app/(gym)/gym/dashboard/actions.ts`, and
`src/lib/entitlements/entitlements.ts` also delegate their read/mapping
logic to — so a schema or mapping change made in one place is picked up by
both apps. Each app still supplies its own Supabase client (cookie-based
here vs bearer-token there) and its own business rules on top (e.g. this
app's entitlement read-only enforcement is currently hardcoded off for
Beta, independently of the main app's billing feature flags — see
`src/lib/entitlements.ts`). Write actions (add/remove/invite/goals) stay
exclusively in the main app; this app never needs them.

## Auth

The mobile app authenticates directly against Supabase Auth (no custom
login endpoint) and sends its session as `Authorization: Bearer
<access_token>` on every request — see `src/lib/supabase.ts`. RLS-scoped
queries use a request-scoped client built from that token; the workspace
lookup (which has no RLS policy for the owner) uses the service-role key,
same as the main app.

## Routes

- `GET /adults/workspace` — workspace, entitlement/trial status, caregiver profile
- `GET /adults/contacts` — list of family members / self-tracking profile
- `GET /adults/contacts/:contactId` — a contact's detail + meal history
- `GET /gym/workspace` — workspace, entitlement/trial status, coach profile
- `GET /gym/clients` — list of clients
- `GET /gym/clients/:clientId` — a client's detail + meals + workouts + biomarkers

All require a valid bearer token; return 401 without one, 404 for an
unknown/not-yours id.

## Deployment

Create a new Cloudflare Pages project connected to this same GitHub repo,
with its root/build directory set to `apps/mobile-api`. Build command:
`npx @cloudflare/next-on-pages`. Deploy command:
`npx wrangler pages deploy .vercel/output/static --project-name=nutriai-mobile-api`
(the Pages project must already exist — `npx wrangler pages project create
nutriai-mobile-api --production-branch=main` once, if the dashboard created
a plain Workers project instead of a Pages one). Needs
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and
`SUPABASE_SERVICE_ROLE_KEY` set as environment variables (same values as
the main app). Route mobile traffic to it via a subdomain (e.g.
`api.<yourdomain>`) or a Cloudflare path rule.

Cloudflare Pages runs `npm install` against the whole workspace (it detects
the root `package-lock.json` even with root directory set to
`apps/mobile-api`) before running the build command above, so
`@nutriai/nutrition-core` resolves the same way it does locally — no extra
configuration needed for that.

**This app's build must use webpack, not Turbopack** (`next build
--webpack` — already set as the `build` script in `package.json`, which
`next-on-pages` invokes). Turbopack's workspace-root inference is
unreliable for an npm-workspace member whose `node_modules` (including
`next` itself) is hoisted to the monorepo root: with `turbopack.root` left
at this app's own directory, Turbopack can't walk up far enough to find
`next/package.json`; pointing `turbopack.root` at the monorepo root instead
makes Next infer the *wrong* project directory and pull in the main app's
`src/middleware.ts`. Webpack has neither problem. Revisit this once a Next
release fixes Turbopack's monorepo root detection.

**Required compatibility flag:** in the Pages project's Settings →
Functions (or Runtime) → Compatibility flags, add `nodejs_compat` to both
Production and Preview separately — the two are independent, and it's easy
to only set one. Without it, every route 500s with "Error - no
nodejs_compat compatibility flag" — `@supabase/supabase-js` relies on
Node.js APIs under the hood that aren't available in the Workers runtime
by default. **A fresh deployment is required after setting/changing the
flags** — Cloudflare does not apply flag changes retroactively to a
deployment that already ran.

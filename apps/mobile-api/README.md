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

## Code duplication is intentional

`src/lib/adults.ts`, `src/lib/gym.ts`, and `src/lib/entitlements.ts` mirror
the read paths of the main app's `src/app/(adults)/adults/dashboard/actions.ts`,
`src/app/(gym)/gym/dashboard/actions.ts`, and
`src/lib/entitlements/entitlements.ts` — copied, not imported, since this is
a separately deployed app with no build-time access to the main repo's
source tree. **Keep these in sync manually** if the underlying schema or
mapping logic changes on the main side. If this pattern needs to scale
beyond these two products, moving the shared logic into a real npm
workspace package (e.g. `packages/nutrition-core`) shared by both apps is
the next step — not done here to avoid a same-day restructuring of the
main app while it's already mid-incident on deploy size.

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

**Required compatibility flag:** in the Pages project's Settings →
Functions (or Runtime) → Compatibility flags, add `nodejs_compat` to both
Production and Preview. Without it, every route 500s with "Error - no
nodejs_compat compatibility flag" — `@supabase/supabase-js` relies on
Node.js APIs under the hood that aren't available in the Workers runtime
by default.

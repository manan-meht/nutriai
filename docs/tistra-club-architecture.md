# Tistra Club — architecture decisions

Tistra Club is the consumer-facing coaching marketplace (Singapore MVP),
sharing one backend with Tistra Health. This document records the decisions
taken from the Step 0 inspection of the existing repo, especially the places
where the existing architecture pushed back on the original spec.

Status: **P0 in progress.** See "Sequencing" at the bottom for what exists.

---

## What already existed (and is being reused)

| Concern | What's there | Decision |
|---|---|---|
| Monorepo | `apps/*` (mobile Expo, mobile-api, cron), `packages/*` (nutrition-core, dashboard-core, health-scoring, end-user-core) | Add marketplace under the same layout. No restructure. |
| Web app | Next.js 16 App Router on **Cloudflare Workers** via OpenNext (migrated Aug 2026) | Club ships inside the existing Next app, routed by domain — not a separate deployment. |
| Database | Supabase Postgres, **no ORM** — raw PostgREST client + 55 hand-applied SQL migrations | Marketplace schema is hand-written SQL following existing conventions. No ORM introduced. |
| Auth | Supabase Auth; `profiles` table mirrors auth users with a `role` column | Reused. No new user/auth system. |
| Coaches | Already exist: a coach is the **owner of a `workspaces` row with `type='gym'`**, with `gym_clients` beneath them | `coach_profiles` **extends** that owner (FK to `profiles`), rather than inventing a parallel coach identity. |
| Payments | Stripe, but **subscription mode only** (`mode: "subscription"`, price IDs, billing webhooks) | Stripe **Connect is genuinely new**. Built as a separate provider module beside the existing billing code, not folded into it. |
| Storage | Supabase Storage, private buckets + signed URLs (`meal-photos`, `contact-avatars`) | Coach media reuses this pattern — new private bucket, signed reads. No new provider. |
| Maps/places | **None exists** | New provider abstraction required (see below). |
| PWA | **None** — no manifest, no service worker | New for Club. |
| Feature flags | `src/lib/billing/feature-flags.ts`, env-var driven with a `flag()` helper | Club flags follow the same pattern. |

---

## ADR-001 — One auth user across Club and Coach OS (and the `scopedEmail` conflict)

**The spec asks** that one account can be consumer, coach, or both, without
separate auth systems.

**The conflict:** `src/lib/auth.ts` currently *scopes emails per product*:

```
gym:    manan@gmail.com  ->  manan@gmail.com          (unscoped)
adults: manan@gmail.com  ->  manan+nutriai-adults@gmail.com
```

So today one human signing up for both family and gym has **two separate
Supabase auth users**. That is the opposite of what the marketplace needs.

**Decision:** Tistra Club uses **unscoped emails**, exactly like the gym
product. Consequences:

- A coach (gym workspace owner) and a Club consumer with the same email are
  **automatically the same auth user** — one account, two roles, no bridging
  table and no migration.
- Roles are derived, not stored as an identity: you are a coach if you own a
  `coach_profiles` row; you are a consumer if you book. Both can be true.
- The adults/family product keeps its `+nutriai-adults` scoping. Unifying it
  would mean migrating existing users' auth identities — real risk, zero
  benefit to this MVP. Left alone deliberately.

**Implication to watch:** a family caregiver who later becomes a Club
consumer will have two accounts (their `+nutriai-adults` one and their Club
one). Acceptable for the Singapore MVP; revisit if Club and Family users
overlap materially in practice.

---

## ADR-002 — Club is a product on the existing domain router, not a new app

`src/lib/product/resolve-product.ts` already resolves a product from the
hostname (`coach.tistrahealth.com` → gym, `family.` → adults). Club becomes a
third product resolved the same way, so `tistra.club` maps to `club` when the
domain is acquired, with `?product=club` for local development.

**Rejected alternative:** a separate `apps/marketplace` Next app. It would
have needed its own auth session handling, its own Workers deployment, its
own secret set (we have three secret stores already — see the Aug 2026
incident), and cross-app session sharing. Sharing one Next app gives Club the
existing session, middleware, and deploy pipeline for free.

**Branding is configurable** (spec requirement): all Club-facing copy reads
its product name, support email and legal URLs from
`src/lib/club/branding.ts`, seeded from env. The string "Tistra Health"
appears nowhere in Club UI.

---

## ADR-003 — Money as integer cents, ledger as source of truth

Never floating point (spec). All amounts are `integer` cents in SGD, with an
explicit `currency` column from day one so a second market doesn't require a
migration.

The `payments` / `refunds` tables are an **internal ledger**, written from
verified webhook state — not derived by querying Stripe. Stripe IDs are
stored for reconciliation, but our tables answer "what did we charge, what
did the coach earn, what did the platform take."

---

## ADR-004 — Provider abstractions for the three external services we don't have

None of maps, routing, or Connect exist in the repo today, and local
development must not need real accounts (spec). Each gets an interface with
two implementations selected by env:

| Provider | Interface | Real | Mock |
|---|---|---|---|
| Places/geocoding | `PlacesProvider` | Google Places | Fixed Singapore neighbourhood fixtures |
| Travel time | `TravelTimeProvider` | Google Routes matrix | Haversine distance ÷ assumed speed, **clearly marked** |
| Payments | `MarketplacePaymentsProvider` | Stripe Connect | In-memory accounts + simulated webhooks |
| Calendar | `CalendarProvider` | Google Calendar OAuth | Static busy-block fixtures |

The mock travel provider **never returns zero** travel time (spec) — it
returns a distance-derived estimate and flags `estimated: true` so the
availability engine can widen its buffer.

---

## ADR-005 — Availability is a pure function over inputs, not a query

`calculateAvailableSlots()` is deliberately **pure and synchronous**: all I/O
(Google busy blocks, existing bookings, travel-time lookups) happens in the
caller, which passes plain data in. That makes the hardest logic in the
product exhaustively unit-testable without a database, network, or clock —
and it's the only way travel-feasibility, buffers, notice windows and
exceptions can be reasoned about together.

Slot generation subtracts, in order: working hours → availability exceptions
→ Google busy → existing bookings → buffers → minimum notice → maximum
advance → **travel feasibility against the neighbouring bookings on that
day**.

---

## ADR-006 — Booking holds use a DB-level exclusion, not application checks

Double-booking is a correctness problem, not a UX problem. A hold is a row in
`booking_holds` with a server-set `expires_at`; the uniqueness of a
(coach, time-range) slot is enforced by a **Postgres exclusion constraint on
a tstzrange** covering live holds and confirmed bookings together. Two
simultaneous checkouts cannot both win: the second insert fails at the
database, not in a race-prone read-then-write in application code.

Holds expire server-side (`expires_at` in the past = not blocking), so a
crashed client can't hold a slot hostage.

---

## ADR-007 — Health data sharing is opt-in, summarised, and revocable instantly

`client_coach_permissions` defaults to **off**. A coach with permission
receives only a computed summary (7-day averages, Food Balance Score,
consistency) from the existing Tistra Health APIs — never raw meal rows,
never photos. Revocation is a timestamp check on read, so it takes effect on
the next request with no cache to purge. Every grant/revoke writes an audit
row (PDPA).

---

## Sequencing

P0 order per the spec: auth → coach profile → skills/services → discovery →
location → calendar → availability → booking → payments → confirmation →
coach schedule → cancellation.

- [x] Step 0 inspection + these decisions
- [x] Migration `0056` — marketplace schema (P0 tables)
- [x] Skills taxonomy + Singapore seed
- [x] Availability engine + travel abstraction, unit-tested
- [ ] Booking holds + state machine
- [ ] Discovery API + ranking
- [ ] Stripe Connect (test mode) + ledger + webhooks
- [ ] Google Calendar OAuth + free/busy
- [ ] Consumer PWA screens (Stitch designs)
- [ ] Coach OS screens
- [ ] P1: sessions, progress, reviews, rebooking, health sharing

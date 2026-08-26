# Pending work

Everything open as of **25 Aug 2026**. Each item says what's true now, what
the decision is, and where the code lives — so picking one up doesn't mean
re-deriving the context first.

Status of each was re-verified against the live DB / live site on 25 Aug,
not carried over from memory.

---

## Ship first

### 1. Deploy the GEO/SEO commit
Commit `aa69963` is on `main`, **not pushed and not deployed**. None of it is
live until `npm run worker:deploy` runs — `nutriai-web` has no CI, so pushing
to main changes nothing on its own.

After deploying, check:
- `https://tistrahealth.com/llms.txt` → 200, `text/plain`
- Google Rich Results Test on the homepage → **FAQ** detected

---

## Live now, needs a decision

### 2. Felicia is discoverable but not bookable
`Felicia Ong` — `status=published`, `stripe_payouts_enabled=false`.
Verified still true.

Discovery does **not** filter on payouts, but checkout **does**:
[actions.ts:98](src/app/(club)/club/actions.ts#L98) and
[:263](src/app/(club)/club/actions.ts#L263) redirect with *"This coach can't
take payments yet."* A client who picks a slot hits a dead end. No money is
charged and nothing breaks, but she may field an enquiry she can't complete.

**Decision:** leave her live while the bank issue is sorted, or revert to
draft. Her Stripe blocker was a DBS/POSB branch-code lookup failing with an
empty branch dropdown — a fresh onboarding link and waiting for the dropdown
to populate is the fix, and it works fine on mobile.

### 3. Coach landing preview shows a coach who can't take bookings
[coach-preview.ts](src/lib/landing/coach-preview.ts) orders by `published_at
desc` and takes 3, so publishing Felicia pushed **Lift with Jo** off
`coach.tistra.club`. The recruitment landing page now shows a payouts-disabled
coach in place of a fully live one. Cached 5 minutes.

**Decision:** prefer coaches who can actually take bookings, widen to 4, or
leave it.

---

## Revenue — commercial decisions

### 4. Class packs bypass the founding offer in both directions
Verified: [pack-purchases.ts:41](src/lib/club/pack-purchases.ts#L41) calls
`splitAmount(pack.price_cents, feePercent)` and never touches
`resolveBookingFee`. So:

- Buying a pack pays **full commission**, no founding discount
- A booking paid from pack credit **never consumes** the free allowance

A coach selling packs gets no founding benefit; a coach selling single
sessions gets 10 free. Not necessarily wrong — but it's not what the landing
page implies.

**Decision:** intended or not.

### 5. PayLah is named in the disclaimer but isn't enabled
The coach landing disclaimer says *"Card and PayLah charges are set by the
payment provider, not by Tistra."* No `payment_method_types` config exists
anywhere in [src/lib/club/](src/lib/club/) — every booking is priced at the
card rate (3.4% + S$0.50 domestic).

**Decision:** enable PayLah in Stripe, or drop it from the wording.

---

## Data quality

### 6. "Visible quantities" shows on meals that never had a photo
Verified: 68 of 441 submissions (15%) have `image_url = NULL` — all WhatsApp,
all text-described. 23 still pending review.

Two fixes, both small:

- **Relabel.** [ReviewForm.tsx:328](src/components/admin/ReviewForm.tsx#L328)
  renders the panel on nothing more than the field being non-empty. One shared
  prompt serves both paths, so
  [food-analyzer.ts:202](src/lib/ai/food-analyzer.ts#L202) asks for
  `visible_quantity` — *"what you actually counted/saw"* — even with no image
  attached. Should read "Estimated quantities (from description)".
- **Distinguish the two nulls.** [actions.ts:321](src/app/(admin)/admin/actions.ts#L321)
  collapses "user typed it" and "we failed to sign the URL" into the same
  `null`, so a real broken-photo bug looks identical to a text-logged meal.
  The coaches admin already solved this with a `hasUploadedPhoto` flag.

Why it matters beyond cosmetics: confirmed review items feed
`food_knowledge_base`, so "Correct" on a text-only meal enters the knowledge
base weighted the same as a photo-verified one.

### 7. Felicia has a duplicate location
Verified:
- `iinkine skating` (typo) — **inactive**, so already hidden. Harmless.
- **Two active `Serangoon / Serangoon` locations** — one primary, one not.
  Both active, so this one *is* client-visible.

**Action:** deactivate the non-primary duplicate.

---

## Compliance

### 8. GDPR gaps still open
The consent banner shipped. These did not:

- [ ] Article 9 lawful basis for health data (meal/nutrition data is special category)
- [ ] Lawful basis disclosure in the privacy policy
- [ ] EU representative under Article 27
- [ ] Data subject rights list
- [ ] Retention periods
- [ ] Transfer safeguards
- [ ] Named processors (Supabase, Stripe, OpenAI, Google, Resend, Meta/WhatsApp)

---

## Growth

### 9. tistrahealth.com has no Google Ads tag
Verified: 0 occurrences of `AW-18404074450` on the homepage. The tag is on
`tistra.club` and `coach.tistra.club` only.

**Decision:** whether Health should be tracked at all.

### 10. Google Ads conversion fires only on profile publish
That's the deepest point in the coach funnel — signup → photo → bio → skills
→ services → location → availability → Stripe → publish. Ads has very few
conversions to optimise on.

**Suggested:** add a signup-level conversion so the algorithm has signal.

### 11. Add the FAQ to /family
`/family` currently gets the entity graph but no `FAQPage`
([family/page.tsx:34](src/app/(public)/family/page.tsx#L34)) — the FAQ answers
render only on `/`. It's the highest caregiver-intent page, so the questions
fit it better than the neutral homepage.

**Tradeoff:** duplicate answer text on two URLs. `@id` scoping already handles
the schema side; this is purely the duplicate-content call.

### 12. /pricing missing from sitemap.ts
The page is live and static but unlisted in
[sitemap.ts](src/app/sitemap.ts). One-line fix.

---

## Housekeeping

### 13. Demo "Manan Mehta" coach profiles
Two rows, both `is_demo=true` — one published, one draft, both with faked
`stripe_payouts_enabled=true`, plus 4 seeded child rows (skill `c26282e0…`,
location `716e803e…`, service `5b86896b…`, availability `5455d89f…`).

Verified **not** visible publicly — 0 occurrences on `tistra.club/coaches`,
because discovery splits on `is_demo` and real coaches now exist. Lower
priority than it looked; clean up when convenient.

### 14. Three `tistrahealth+…` accounts not flagged as test
They're yours, but they're genuinely onboarded (contacts + photos), so
flagging them isn't obviously right. Would take the Health user count 54 → 51.

**Decision:** real users or test accounts.

### 15. MCP connectors need authorizing
`claude.ai` and `Stripe` connectors aren't authorized in this workspace —
claude.ai via connector settings, Stripe via `claude mcp` in an interactive
session. Nothing so far has needed them.

# nutriai-mobile

Expo/React Native app for Tistra Health — gym, adults, and self product
flows, talking to the standalone `apps/mobile-api` Cloudflare Pages
project (see its README) for all data.

## Flows

Three deliberately separate screens/route trees per product — Self and
Family share identical login logic today (both scope to the same
`"adults"` account tag) but are kept as separate files so they can diverge
later without disentangling shared code:

- `app/select-product.tsx` — the app's effective "home" for a logged-out
  user (no marketing pages here)
- `app/login/{self,family,coach}.tsx` — thin wrappers around the shared
  `<LoginForm>` component
- `app/(app)/{self,family,coach}/...` — the three dashboard areas. Self
  skips straight to its one meal-history view (no list screen, since
  there's only ever one contact); Family and Coach show a list first (see
  `<PeopleDashboard>`) then a detail view (see `<PersonDetail>`, shared by
  both — and by Self too).

Self vs. Family can't be told apart from the account's email alone (both
carry the same `+nutriai-adults` tag) — `detectTier()` in
`src/lib/product.ts` fetches `/adults/workspace` and reads `workspace.plan`
after login to decide which of the two to route to.

## SDK version

Pinned to whatever your Expo Go app currently supports (check Expo Go's
own Profile/Settings tab for its supported SDK number) — a brand-new SDK
release is often ahead of what's been rolled out to the app stores' Expo
Go builds yet. If you see "Project is incompatible, download the latest
version of Expo Go" even with the latest Expo Go installed, downgrade via
`npx expo install expo@^<version>.0.0 --fix`, then **fully clean-reinstall
node_modules and package-lock.json from the repo root** — a partial
downgrade reliably leaves stale nested copies of `expo-router`,
`react-native`, etc. in this app's own `node_modules` that shadow the
correctly-updated hoisted ones, which is a much more confusing failure
than the original SDK mismatch.

## Google/Facebook sign-in setup

`src/lib/oauth.ts` opens an in-app browser session (via `expo-web-browser`)
that redirects back to the app through the custom URL scheme
`tistrahealth://` (set in `app.json`). This needs provider-side
configuration before it'll work — none of this can be done from code:

1. **Supabase** — Authentication → URL Configuration → Redirect URLs: add
   `tistrahealth://auth-callback`.
2. **Google Cloud Console** — the OAuth client Supabase's Google provider
   uses needs `tistrahealth://auth-callback` (or your Supabase project's
   own callback URL, depending on how the main app's Google provider is
   already configured — see Supabase's Auth → Providers → Google page for
   the exact authorized redirect URI it expects) added to its authorized
   redirect URIs.
3. **Facebook Developers** — same idea, under the Facebook Login product's
   Valid OAuth Redirect URIs.

Since the main web app already has Google/Facebook sign-in working (see
`src/components/auth/AuthForm.tsx`), the Supabase-side provider
configuration (client ID/secret) is already done — this is purely about
adding the mobile app's redirect URI to the existing setup, not
configuring the providers from scratch.

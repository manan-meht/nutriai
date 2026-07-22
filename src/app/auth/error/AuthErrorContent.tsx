"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

// Reached when the post-confirmation session handoff fails. Two distinct
// cases land here, distinguished by the "reason" the callback route sets:
//   - "exchange"/missing_code: most often the confirmation/OAuth link was
//     opened in a different browser/app than the one that started the
//     flow (e.g. an email app's in-app browser), so the PKCE code_verifier
//     needed to finish exchangeCodeForSession() isn't present. The email
//     itself is very likely already confirmed by this point.
//   - "provider": the OAuth provider (Google/Facebook) itself returned an
//     error — access denied, misconfiguration, etc.
// The previous copy unconditionally told everyone to "sign in with email
// and password," which is a dead end for accounts that only ever
// authenticated via Google/Facebook and have no password set — this page
// has no way to know which method the visitor originally used, so it
// points back at every method rather than assuming one.
//
// A client component reading useSearchParams() rather than a server
// component reading the `searchParams` prop — that would make this an
// edge-runtime dynamic route, and this page alone cost ~1.3 MB as one,
// which helped push the whole deployment's aggregate Cloudflare Pages
// Functions size over the 25 MiB limit. Reading the param client-side lets
// the page itself stay static.
export function AuthErrorContent() {
  const searchParams = useSearchParams();
  const isProviderError = searchParams.get("reason") === "provider";

  return (
    <div className="min-h-screen flex items-center justify-center bg-white px-6">
      <div className="max-w-sm w-full text-center">
        <p className="text-4xl mb-4">{isProviderError ? "⚠️" : "✅"}</p>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          {isProviderError ? "Sign-in didn't go through" : "Almost there"}
        </h1>
        <p className="text-gray-500 text-sm mb-8">
          {isProviderError ? (
            <>
              Something went wrong with that sign-in method. Please try again — if you keep seeing this,
              try a different sign-in method (Google, or email and password) below.
            </>
          ) : (
            <>
              Your email is likely already confirmed — this step just couldn&apos;t finish signing you in
              automatically (common if the link was opened in a different browser or app). Please sign in
              again below, using whichever method you originally signed up with (email/password, Google,
              or Facebook).
            </>
          )}
        </p>
        <Link
          href="/login"
          className="inline-block bg-[#6750A4] hover:bg-[#4F378A] text-white px-6 py-3 rounded-full font-semibold transition-colors"
        >
          Sign in
        </Link>
        <div className="mt-4">
          <Link href="/" className="text-sm font-medium text-gray-500 underline underline-offset-2">
            Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}

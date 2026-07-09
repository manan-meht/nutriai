import Link from "next/link";

// Reached when the post-confirmation session handoff fails — most often
// because the confirmation link was opened in a different browser/app
// than the one that started signup (e.g. an email app's in-app browser),
// so the PKCE code_verifier needed to finish exchangeCodeForSession() isn't
// present. The email itself is very likely already confirmed by this point
// (Supabase's own /verify step runs before redirecting here), so this
// reads as "go sign in" rather than a scary unexplained failure.
export default function AuthErrorPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-white px-6">
      <div className="max-w-sm w-full text-center">
        <p className="text-4xl mb-4">✅</p>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Almost there</h1>
        <p className="text-gray-500 text-sm mb-8">
          Your email is likely already confirmed — this step just couldn&apos;t finish signing you in
          automatically (common if the link was opened in a different browser or app). Please sign in
          with your email and password to continue.
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

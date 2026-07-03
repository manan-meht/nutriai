import Link from "next/link";

export default function AuthErrorPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-white px-6">
      <div className="max-w-sm w-full text-center">
        <p className="text-4xl mb-4">⚠️</p>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Something went wrong</h1>
        <p className="text-gray-500 text-sm mb-8">
          We couldn&apos;t complete sign-in. The link may have expired or already been used.
        </p>
        <Link href="/" className="text-sm font-medium text-gray-700 underline underline-offset-2">
          Back to home
        </Link>
      </div>
    </div>
  );
}

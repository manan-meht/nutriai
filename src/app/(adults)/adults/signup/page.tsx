export const runtime = "edge";
import Link from "next/link";
import { AuthForm } from "@/components/auth/AuthForm";

export default function AdultsSignupPage({
  searchParams,
}: {
  searchParams?: Record<string, string>;
}) {
  const next = searchParams?.next ?? "/adults/dashboard";

  return (
    <div className="min-h-screen flex items-center justify-center bg-white px-6 py-12">
      <div className="max-w-sm w-full">
        <Link href="/" className="text-sm text-gray-400 hover:text-gray-600 mb-8 block">
          ← Back
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Create a family account</h1>
        <p className="text-gray-500 text-sm mb-8">
          Free to try. Your parent sets their own sharing preferences.
        </p>
        <AuthForm product="adults" mode="signup" next={next} />
      </div>
    </div>
  );
}

import Link from "next/link";
import { AuthForm } from "@/components/auth/AuthForm";

export default function GymLoginPage({
  searchParams,
}: {
  searchParams?: Record<string, string>;
}) {
  const next = searchParams?.next ?? "/gym/dashboard";

  return (
    <div className="min-h-screen flex items-center justify-center bg-white px-6 py-12">
      <div className="max-w-sm w-full">
        <Link href="/" className="text-sm text-gray-400 hover:text-gray-600 mb-8 block">
          ← Back
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Sign in to Tistra Coach</h1>
        <p className="text-gray-500 text-sm mb-8">
          Welcome back. Your clients&apos; data is waiting.
        </p>
        <AuthForm product="gym" mode="signin" next={next} />
      </div>
    </div>
  );
}

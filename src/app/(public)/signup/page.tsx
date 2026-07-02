export const runtime = "edge";
export const dynamic = "force-dynamic";

import { headers } from "next/headers";
import Link from "next/link";
import { AuthForm } from "@/components/auth/AuthForm";
import { resolveProductFromHostname } from "@/lib/product/resolve-product";

export default async function SignupPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string>>;
}) {
  const headerStore = await headers();
  const hostname = headerStore.get("host") ?? "localhost:3000";
  const params = (await searchParams) ?? {};

  const rawParams = new URLSearchParams(
    Object.entries(params)
      .filter((e): e is [string, string] => typeof e[1] === "string")
  );

  const product = resolveProductFromHostname(hostname, rawParams) ?? "adults";
  const next = params.next ?? (product === "gym" ? "/gym/dashboard" : "/adults/dashboard");

  const title = product === "gym" ? "Create a Tistra Coach account" : "Create a Tistra Family account";

  return (
    <div className="min-h-screen flex items-center justify-center bg-white px-6 py-12">
      <div className="max-w-sm w-full">
        <Link href="/" className="text-sm text-gray-400 hover:text-gray-600 mb-8 block">
          ← Back
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 mb-1">{title}</h1>
        <p className="text-gray-500 text-sm mb-8">Get started for free.</p>
        <AuthForm product={product} mode="signup" next={next} />
      </div>
    </div>
  );
}

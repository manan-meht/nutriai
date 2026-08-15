export const dynamic = "force-dynamic";

import { headers } from "next/headers";
import type { Metadata } from "next";
import Link from "next/link";
import { AuthForm } from "@/components/auth/AuthForm";
import { resolveProductFromHostname } from "@/lib/product/resolve-product";
import { faviconForProduct } from "@/lib/product/icons";

interface LoginPageProps {
  searchParams?: Promise<Record<string, string>>;
}

export async function generateMetadata({ searchParams }: LoginPageProps): Promise<Metadata> {
  const headerStore = await headers();
  const hostname = headerStore.get("host") ?? "localhost:3000";
  const params = (await searchParams) ?? {};
  const rawParams = new URLSearchParams(
    Object.entries(params).filter((e): e is [string, string] => typeof e[1] === "string")
  );
  const product = resolveProductFromHostname(hostname, rawParams) ?? "adults";
  return { icons: { icon: faviconForProduct(product) } };
}

export default async function LoginPage({
  searchParams,
}: LoginPageProps) {
  const headerStore = await headers();
  const hostname = headerStore.get("host") ?? "localhost:3000";
  const params = (await searchParams) ?? {};

  const rawParams = new URLSearchParams(
    Object.entries(params)
      .filter((e): e is [string, string] => typeof e[1] === "string")
  );

  const product = resolveProductFromHostname(hostname, rawParams) ?? "adults";
  const next = params.next ?? (product === "gym" ? "/gym/dashboard" : "/adults/dashboard");

  const title = "Sign in to Tistra Health";

  return (
    <div className="min-h-screen flex items-center justify-center bg-white px-6 py-12">
      <div className="max-w-sm w-full">
        <Link href="/" className="text-sm text-gray-400 hover:text-gray-600 mb-8 block">
          ← Back
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 mb-1">{title}</h1>
        <p className="text-gray-500 text-sm mb-8">Welcome back.</p>
        <AuthForm product={product} mode="signin" next={next} />
      </div>
    </div>
  );
}

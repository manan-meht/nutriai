export const dynamic = "force-dynamic";

import { headers } from "next/headers";
import type { Metadata } from "next";
import Link from "next/link";
import { AuthForm } from "@/components/auth/AuthForm";
import { resolveProductFromHostname } from "@/lib/product/resolve-product";
import { faviconForProduct } from "@/lib/product/icons";
import type { AuthSurface } from "@/lib/auth";
import { isClubHost } from "@/lib/club/host";

/** Where a successful sign-in should land, per surface.
 *
 * Club is host-dependent: on club.tistrahealth.com the middleware already
 * rewrites "/" to the discovery page, so sending someone to "/club" there
 * only puts the internal prefix in their address bar. On any other host
 * (someone signing in at tistrahealth.com/login?product=club) "/" is the
 * Tistra Health homepage, so the prefix is exactly what's needed. */
function defaultNextFor(surface: AuthSurface, hostname: string): string {
  if (surface === "gym") return "/coach/dashboard";
  if (surface === "club") {
    return isClubHost(hostname) ? "/" : "/club";
  }
  return "/adults/dashboard";
}


/** Which auth surface this request belongs to. Kept separate from
 * ProductType: Tistra Club is a third sign-in surface, not a third value of
 * the gym/adults product used throughout the workspace code. */
function resolveAuthSurface(hostname: string, params: URLSearchParams): AuthSurface {
  if (isClubHost(hostname)) return "club";
  if (params.get("product") === "club") return "club";
  return resolveProductFromHostname(hostname, params) ?? "adults";
}


interface SignupPageProps {
  searchParams?: Promise<Record<string, string>>;
}

export async function generateMetadata({ searchParams }: SignupPageProps): Promise<Metadata> {
  const headerStore = await headers();
  const hostname = headerStore.get("host") ?? "localhost:3000";
  const params = (await searchParams) ?? {};
  const rawParams = new URLSearchParams(
    Object.entries(params).filter((e): e is [string, string] => typeof e[1] === "string")
  );
  const surface = resolveAuthSurface(hostname, rawParams);
  return { icons: { icon: faviconForProduct(surface === "club" ? "adults" : surface) } };
}

export default async function SignupPage({
  searchParams,
}: SignupPageProps) {
  const headerStore = await headers();
  const hostname = headerStore.get("host") ?? "localhost:3000";
  const params = (await searchParams) ?? {};

  const rawParams = new URLSearchParams(
    Object.entries(params)
      .filter((e): e is [string, string] => typeof e[1] === "string")
  );

  const product = resolveAuthSurface(hostname, rawParams);
  // Same as the login page: "gym" is Tistra Coach, whose home is the Coach
  // OS, not the older /gym/dashboard nutrition view.
  let next = params.next ?? defaultNextFor(product, hostname);
  // Carries a /pricing plan/interval choice through signup so the dashboard
  // (which starts checkout — see requiresCardBeforeTrial) knows what to
  // check the new workspace out for, instead of defaulting to "monthly".
  if (params.plan || params.interval) {
    const extra = new URLSearchParams();
    if (params.plan) extra.set("plan", params.plan);
    if (params.interval) extra.set("interval", params.interval);
    next = `${next}${next.includes("?") ? "&" : "?"}${extra.toString()}`;
  }

  const title =
    product === "gym" ? "Create a Tistra Coach account"
    : product === "club" ? "Create a Tistra Club account"
    : "Create a Tistra Health account";

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

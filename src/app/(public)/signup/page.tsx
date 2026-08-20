export const dynamic = "force-dynamic";

import { headers } from "next/headers";
import type { Metadata } from "next";
import Link from "next/link";
import { AuthForm } from "@/components/auth/AuthForm";
import { resolveProductFromHostname } from "@/lib/product/resolve-product";
import { faviconForProduct } from "@/lib/product/icons";
import type { AuthSurface } from "@/lib/auth";
import { isClubHost } from "@/lib/club/host";
import { isCoachHost } from "@/lib/coach/routes";
import { COACH_CANONICAL_ORIGIN } from "@/lib/club/host";

/** Where a successful sign-in should land, per surface.
 *
 * Club is host-dependent: on club.tistrahealth.com the middleware already
 * rewrites "/" to the discovery page, so sending someone to "/club" there
 * only puts the internal prefix in their address bar. On any other host
 * (someone signing in at tistrahealth.com/login?product=club) "/" is the
 * Tistra Health homepage, so the prefix is exactly what's needed. */
function defaultNextFor(surface: AuthSurface, hostname: string): string {
  if (surface === "gym") {
    // Coach OS is served from the root of the coach host; the /coach prefix
    // is only needed when signing in from somewhere else.
    return isCoachHost(hostname) ? "/dashboard" : "/coach/dashboard";
  }
  if (surface === "club") {
    // Signing in lands on the swipe feed — greeting, motivating line, then
    // one coach per swipe. The list stays a tab away at the root.
    return isClubHost(hostname) ? "/" : "/club/browse";
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
  // The title is what a coach sees in the browser tab and what gets shared.
  // Inheriting the root layout's Tistra Health title told them they were
  // signing up for the wrong product.
  const title =
    surface === "gym" ? "Create a Tistra Coach account"
    : surface === "club" ? "Create a Tistra Club account"
    : "Create a Tistra Health account";
  return {
    title,
    icons: { icon: faviconForProduct(surface === "club" ? "adults" : surface) },
    // Coach signup has one canonical home, on the coach product's own host.
    ...(surface === "gym"
      ? { alternates: { canonical: `${COACH_CANONICAL_ORIGIN}/signup` } }
      : {}),
  };
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
        <ProductFooter product={product} />
      </div>
    </div>
  );
}

/** Whose product this signup belongs to, said once at the bottom.
 *
 * Tistra Coach and Tistra Club are business surfaces and get the Tistra
 * family line; Tistra Health keeps its own footer, since its medical
 * disclaimer (in AuthForm) is the notice that matters there. */
function ProductFooter({ product }: { product: AuthSurface }) {
  if (product === "adults") return null;
  const name = product === "gym" ? "Tistra Coach" : "Tistra Club";
  return (
    <footer className="mt-10 border-t border-gray-100 pt-6 text-center text-xs text-gray-400">
      <p>
        <span className="font-medium text-gray-500">{name}</span> — A Tistra product.
      </p>
      <nav className="mt-2 flex justify-center gap-4">
        <Link href="/privacy" className="hover:text-gray-600 hover:underline">Privacy</Link>
        <Link href="/terms" className="hover:text-gray-600 hover:underline">Terms</Link>
      </nav>
    </footer>
  );
}

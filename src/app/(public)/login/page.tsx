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
  const surface = resolveAuthSurface(hostname, rawParams);
  return { icons: { icon: faviconForProduct(surface === "club" ? "adults" : surface) } };
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

  const product = resolveAuthSurface(hostname, rawParams);
  // The "gym" product is Tistra Coach, and its home is the Coach OS
  // (/coach/dashboard) — NOT /gym/dashboard, which is the older
  // nutrition-tracking dashboard. Sending a coach there after sign-in
  // dropped them into the wrong product entirely.
  const next = params.next ?? defaultNextFor(product, hostname);

  // Coaching is a separate product on its own domain, so this shared page
  // must introduce itself as whichever product the visitor came for.
  const title =
    product === "gym" ? "Sign in to Tistra Coach"
    : product === "club" ? "Sign in to Tistra Club"
    : "Sign in to Tistra Health";

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

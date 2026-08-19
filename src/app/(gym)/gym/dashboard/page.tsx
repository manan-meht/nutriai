import { redirect } from "next/navigation";

// The standalone gym dashboard has moved inside Coach OS as the Nutrition
// feature (/coach/nutrition). Coach OS is the overarching system now: the
// dashboard, calendar, clients and payments around it are free, and
// nutrition tracking is the paid feature within it.
//
// Kept as a redirect rather than deleted because a dozen places still link
// here — middleware, sign-out, checkout, subscription management, the
// login/signup next-hrefs — plus any bookmark a coach already has. Query
// params are forwarded so the ?checkout=success and ?plan=&interval=
// hand-offs from Checkout and /pricing keep working; /coach/nutrition
// handles both.
//
// The data layer for this route lives on in ./actions.ts, which the
// Nutrition page imports.

export default async function GymDashboardRedirect({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string>>;
}) {
  const params = (await searchParams) ?? {};
  const qs = new URLSearchParams(
    Object.entries(params).filter((e): e is [string, string] => typeof e[1] === "string")
  ).toString();
  redirect(`/coach/nutrition${qs ? `?${qs}` : ""}`);
}

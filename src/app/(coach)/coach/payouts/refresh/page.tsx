import { redirect } from "next/navigation";

// Stripe calls this when an onboarding link has expired — they last only
// minutes. Sending the coach back to settings is enough: the Payouts
// section mints a fresh link on the next click.
export const dynamic = "force-dynamic";

export default function PayoutRefreshPage() {
  redirect("/settings?payouts=expired");
}

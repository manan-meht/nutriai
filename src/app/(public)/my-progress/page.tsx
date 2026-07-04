export const dynamic = "force-dynamic";
export const runtime = "edge";

import { redirect } from "next/navigation";
import { END_USER_DASHBOARD_ENABLED } from "@/lib/billing/feature-flags";
import { getEndUserSession } from "@/lib/end-user/session";
import { MyProgressEntryForm } from "@/components/end-user/MyProgressEntryForm";

export default async function MyProgressEntryPage() {
  if (!END_USER_DASHBOARD_ENABLED) redirect("/");

  const session = await getEndUserSession();
  if (session) redirect("/my-progress/dashboard");

  return (
    <main className="min-h-screen flex items-center justify-center bg-neutral-50 px-4 py-12">
      <div className="w-full max-w-sm">
        <h1 className="text-xl font-semibold text-neutral-900 text-center mb-2">
          Confirm it&apos;s you to view your private dashboard
        </h1>
        <p className="text-sm text-neutral-500 text-center mb-8">
          We&apos;ll send a secure code to your WhatsApp.
        </p>
        <MyProgressEntryForm />
      </div>
    </main>
  );
}

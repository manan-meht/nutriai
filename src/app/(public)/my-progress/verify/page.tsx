export const dynamic = "force-dynamic";
export const runtime = "edge";

import { redirect } from "next/navigation";
import { END_USER_DASHBOARD_ENABLED, PARENT_DASHBOARD_ACCESS_ENABLED } from "@/lib/billing/feature-flags";
import { getEndUserSession } from "@/lib/end-user/session";
import { MyProgressVerifyForm } from "@/components/end-user/MyProgressVerifyForm";

interface VerifyPageProps {
  searchParams?: Promise<{ number?: string }>;
}

export default async function MyProgressVerifyPage({ searchParams }: VerifyPageProps) {
  if (!END_USER_DASHBOARD_ENABLED && !PARENT_DASHBOARD_ACCESS_ENABLED) redirect("/");

  const session = await getEndUserSession();
  if (session) redirect("/my-progress/dashboard");

  const params = (await searchParams) ?? {};
  const number = params.number ?? "";
  if (!number) redirect("/my-progress");

  return (
    <main className="min-h-screen flex items-center justify-center bg-neutral-50 px-4 py-12">
      <div className="w-full max-w-sm">
        <h1 className="text-xl font-semibold text-neutral-900 text-center mb-2">
          Enter the code we sent you
        </h1>
        <p className="text-sm text-neutral-500 text-center mb-8">
          Check your phone at {number} for a 6-digit code.
        </p>
        <MyProgressVerifyForm whatsappNumber={number} />
      </div>
    </main>
  );
}

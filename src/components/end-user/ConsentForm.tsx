"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { acceptConsentAction, declineConsentAction } from "@/app/(public)/my-progress/actions";

interface ConsentFormProps {
  inviterName: string | null;
  inviterRole: "family_owner" | "coach";
}

export function ConsentForm({ inviterName, inviterRole }: ConsentFormProps) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  const name = inviterName ?? (inviterRole === "coach" ? "Your coach" : "Your family member");
  const copy =
    inviterRole === "coach"
      ? `${name} invited you to Tistra Health. They may see your meal updates and nutrition summaries to support your coaching.`
      : `${name} invited you to Tistra Health. They may see your meal updates and nutrition summaries so they can support you.`;

  async function handleAccept() {
    setSubmitting(true);
    const result = await acceptConsentAction();
    setSubmitting(false);
    if (result.ok) router.push("/my-progress/dashboard");
  }

  async function handleDecline() {
    setSubmitting(true);
    await declineConsentAction();
    router.push("/my-progress");
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-neutral-600 text-center">{copy}</p>
      <div className="space-y-3">
        <button
          onClick={handleAccept}
          disabled={submitting}
          className="w-full rounded-lg bg-neutral-900 text-white py-3 text-base font-medium disabled:opacity-50"
        >
          Accept and continue
        </button>
        <button
          onClick={handleDecline}
          disabled={submitting}
          className="w-full rounded-lg border border-neutral-300 text-neutral-700 py-3 text-base font-medium disabled:opacity-50"
        >
          Decline
        </button>
      </div>
      <p className="text-xs text-neutral-400 text-center">
        You can manage or revoke sharing access later.
      </p>
    </div>
  );
}

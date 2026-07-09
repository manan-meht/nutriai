"use client";

import { useEffect, useRef, useState } from "react";
import { getOrCreateSelfInvite, regenerateSelfInvite } from "@/app/(adults)/adults/dashboard/actions";
import { InviteCard } from "@/components/shared/invites/InviteCard";

interface Props {
  workspaceId: string;
  defaultFullName: string;
  onDone: () => void;
  onSkip: () => void;
}

const POLL_INTERVAL_MS = 5000;

// Shown once, right after self-tracking signup (see /me and the ?self=1
// redirect param). WhatsApp-first: the user taps a wa.me link and messages
// the bot themselves ("JOIN SELF <token>") rather than the bot messaging
// them first — see src/lib/invites. Their personal adults_contacts profile
// (relationship_type "self") is only created once that message arrives
// (conversation-handler.ts's handleInviteClaim), not by this card.
export function SelfSetupCard({ workspaceId, defaultFullName, onDone, onSkip }: Props) {
  const [started, setStarted] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  function startPolling() {
    if (pollRef.current) return;
    pollRef.current = setInterval(async () => {
      const result = await getOrCreateSelfInvite(workspaceId, defaultFullName);
      if (!("error" in result) && result.status === "claimed") {
        if (pollRef.current) clearInterval(pollRef.current);
        onDone();
      }
    }, POLL_INTERVAL_MS);
  }

  return (
    <div className="mb-8 rounded-2xl border border-[var(--color-dashboard-primary)]/20 bg-[var(--color-dashboard-primary-light)] p-6">
      <h2 className="text-lg font-bold text-gray-900 mb-1">Start tracking yourself</h2>
      <p className="text-sm text-gray-600 mb-4">
        Message Tistra Health on WhatsApp yourself to start logging meals — this creates your personal tracked profile
        as soon as you send the message.
      </p>

      {!started ? (
        <button
          onClick={() => {
            setStarted(true);
            startPolling();
          }}
          className="bg-[var(--color-dashboard-primary)] hover:bg-[var(--color-dashboard-primary-hover)] text-white font-semibold rounded-lg px-5 py-2.5 text-sm"
        >
          Start tracking on WhatsApp
        </button>
      ) : (
        <InviteCard
          title="Your self-tracking invite"
          description="Tap the button below, then hit send in WhatsApp — you'll be connected the moment we receive it."
          load={() => getOrCreateSelfInvite(workspaceId, defaultFullName)}
          regenerate={() => regenerateSelfInvite(workspaceId)}
          pendingLabel="Pending — waiting for your message on WhatsApp."
        />
      )}

      <button type="button" onClick={onSkip} className="text-xs text-gray-400 underline mt-3">
        Skip for now
      </button>
    </div>
  );
}

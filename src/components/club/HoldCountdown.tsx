"use client";

import { useEffect, useState } from "react";
import { CLUB_TOKENS as T } from "@/components/coach/tokens";

/** Shows how long the slot stays reserved. Purely informational — expiry is
 * enforced server-side against expires_at, so a paused tab or a fiddled
 * clock cannot extend a hold. */
export function HoldCountdown({ expiresAt }: { expiresAt: string }) {
  const target = new Date(expiresAt).getTime();
  const [msLeft, setMsLeft] = useState(() => target - Date.now());

  useEffect(() => {
    const id = setInterval(() => setMsLeft(target - Date.now()), 1000);
    return () => clearInterval(id);
  }, [target]);

  const expired = msLeft <= 0;
  const total = Math.max(0, Math.floor(msLeft / 1000));
  const label = `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;

  return (
    <p
      role="status"
      aria-live="polite"
      className="mt-2 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium"
      style={{
        backgroundColor: expired ? T.errorContainer : T.warningContainer,
        color: expired ? T.onErrorContainer : T.warning,
      }}
    >
      {expired ? "This hold has expired — pick a time again" : `Time held for ${label}`}
    </p>
  );
}

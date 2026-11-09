"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Result = { ok: boolean; message?: string };

/** Runs a Guidance server action, shows its message on failure, and
 * refreshes the page's server data on success so every card agrees. */
export function useGuidanceAction() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(action: () => Promise<Result>, onDone?: () => void) {
    setError(null);
    startTransition(async () => {
      try {
        const result = await action();
        if (!result.ok) {
          setError(("message" in result && result.message) || "That didn't work. Please try again.");
          if ("kind" in result && (result as { kind?: string }).kind === "invalid") router.refresh();
          return;
        }
        onDone?.();
        router.refresh();
      } catch {
        setError("That didn't work. Please try again.");
      }
    });
  }

  return { run, pending, error };
}

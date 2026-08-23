"use client";

import { useEffect, useState } from "react";

/** True for the error Next.js raises when a page posts a Server Action id
 * that the running deployment no longer has.
 *
 * Action ids are content-hashed per build, so every deploy invalidates the
 * ids held by any page a person already had open. Nothing is wrong with
 * their account or their data — the tab is simply older than the server.
 * It happened to a real user mid-task, three deploys inside eight minutes,
 * and the app offered her a dead end. */
function isStaleDeployment(error: Error & { digest?: string }): boolean {
  const text = `${error.message ?? ""} ${error.digest ?? ""}`;
  return (
    /Failed to find Server Action/i.test(text) ||
    /Server Action .*(was not found|not found)/i.test(text) ||
    /from an older or newer deployment/i.test(text)
  );
}

// Route-level error boundary. Catches render/hydration errors anywhere
// under the root layout, so a client-side exception shows something
// readable instead of the browser's blank "This page couldn't load".
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const stale = isStaleDeployment(error);
  const [reloading, setReloading] = useState(false);

  useEffect(() => {
    // Reaches the Workers log via the browser only in dev, but keeps the
    // message in the user's console where support can ask for it.
    console.error("[app-error]", error.digest ?? "", error.message, error.stack);
  }, [error]);

  useEffect(() => {
    if (!stale || reloading) return;
    // A fresh document is the fix, and reset() is not — it re-renders the
    // same stale bundle and fails again. Reload once, guarded by a
    // sessionStorage flag so a genuinely broken page cannot loop.
    const KEY = "tistra:stale-deploy-reload";
    try {
      if (sessionStorage.getItem(KEY)) return;
      sessionStorage.setItem(KEY, String(Date.now()));
    } catch {
      // Private mode or blocked storage: fall through to the manual button.
      return;
    }
    setReloading(true);
    window.location.reload();
  }, [stale, reloading]);

  useEffect(() => {
    // Clear the guard once a page renders normally again, so a later
    // deploy can auto-recover too.
    if (!stale) {
      try {
        sessionStorage.removeItem("tistra:stale-deploy-reload");
      } catch {
        // nothing to do
      }
    }
  }, [stale]);

  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: "48px 24px", color: "#1A1B22" }}>
      <div style={{ maxWidth: 560, margin: "0 auto" }}>
        <h1 style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>
          {stale ? "Tistra was just updated" : "Something went wrong"}
        </h1>
        <p style={{ color: "#4A4455", marginTop: 12, lineHeight: 1.6 }}>
          {stale
            ? "This page was open while we released an update, so it lost touch with the server. Reloading picks up the new version — nothing you entered has been lost from your account."
            : "This page hit an unexpected error. Trying again often works — if it keeps happening, the details below help us fix it."}
        </p>
        <div style={{ display: "flex", gap: 12, marginTop: 24, flexWrap: "wrap" }}>
          <button
            onClick={stale ? () => window.location.reload() : reset}
            style={{
              background: "#6750A4", color: "#fff", border: 0, borderRadius: 999,
              padding: "12px 28px", fontSize: 15, fontWeight: 500, cursor: "pointer",
            }}
          >
            {stale ? (reloading ? "Reloading…" : "Reload the page") : "Try again"}
          </button>
          <a
            href="/"
            style={{
              border: "1px solid #CCC3D8", borderRadius: 999, padding: "12px 28px",
              fontSize: 15, fontWeight: 500, textDecoration: "none", color: "#1A1B22",
            }}
          >
            Go home
          </a>
        </div>
        <details style={{ marginTop: 32 }}>
          <summary style={{ cursor: "pointer", color: "#4A4455", fontSize: 14 }}>Technical details</summary>
          <pre
            style={{
              marginTop: 12, padding: 12, background: "#F4F2FD", borderRadius: 8,
              fontSize: 12, whiteSpace: "pre-wrap", wordBreak: "break-word", color: "#4A4455",
            }}
          >
            {error.digest ? `digest: ${error.digest}\n` : ""}
            {error.message || "No error message available."}
          </pre>
        </details>
      </div>
    </main>
  );
}

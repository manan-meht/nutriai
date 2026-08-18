"use client";

import { useEffect } from "react";

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
  useEffect(() => {
    // Reaches the Workers log via the browser only in dev, but keeps the
    // message in the user's console where support can ask for it.
    console.error("[app-error]", error.digest ?? "", error.message, error.stack);
  }, [error]);

  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: "48px 24px", color: "#1A1B22" }}>
      <div style={{ maxWidth: 560, margin: "0 auto" }}>
        <h1 style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>Something went wrong</h1>
        <p style={{ color: "#4A4455", marginTop: 12, lineHeight: 1.6 }}>
          This page hit an unexpected error. Trying again often works — if it keeps happening,
          the details below help us fix it.
        </p>
        <div style={{ display: "flex", gap: 12, marginTop: 24, flexWrap: "wrap" }}>
          <button
            onClick={reset}
            style={{
              background: "#6750A4", color: "#fff", border: 0, borderRadius: 999,
              padding: "12px 28px", fontSize: 15, fontWeight: 500, cursor: "pointer",
            }}
          >
            Try again
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

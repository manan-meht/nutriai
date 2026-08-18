"use client";

// Last-resort boundary: catches errors thrown in the root layout itself,
// where the normal error.tsx can't help. Must render its own <html>/<body>
// because the layout that would have provided them is what failed.
//
// Added Aug 2026 after a client-side exception on the coach login produced
// only the browser's own "This page couldn't load" shell — no message, no
// digest, nothing to act on. An error the user can read us back is worth
// far more than a blank failure.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 0, padding: "48px 24px", color: "#1A1B22" }}>
        <div style={{ maxWidth: 560, margin: "0 auto" }}>
          <h1 style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>Something went wrong</h1>
          <p style={{ color: "#4A4455", marginTop: 12, lineHeight: 1.6 }}>
            This page hit an unexpected error. Trying again often works.
          </p>
          <button
            onClick={reset}
            style={{
              marginTop: 24, background: "#6750A4", color: "#fff", border: 0,
              borderRadius: 999, padding: "12px 28px", fontSize: 15, fontWeight: 500, cursor: "pointer",
            }}
          >
            Try again
          </button>
          <ErrorDetail error={error} />
        </div>
      </body>
    </html>
  );
}

/** The digest is the only thing that ties a user's report to a server log,
 * so it is always shown rather than hidden behind a dev-only flag. The
 * message is included too: without it, "something went wrong" is
 * unactionable for the person trying to help. */
function ErrorDetail({ error }: { error: Error & { digest?: string } }) {
  return (
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
  );
}

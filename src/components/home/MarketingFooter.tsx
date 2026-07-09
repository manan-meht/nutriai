import Link from "next/link";

export type MarketingFooterVariant = "home" | "family" | "coach" | "me";

const TAGLINE: Record<MarketingFooterVariant, string> = {
  home: "Simple nutrition awareness for everyday people, families, and coaches.",
  family: "Simple nutrition visibility for the people you care about.",
  coach: "Effortless accountability for modern fitness coaching.",
  me: "Healthy habits, simplified. Stress-free awareness for your daily routine.",
};

// Shared footer for all 4 public marketing pages (/, /family, /coach,
// /me) — only the tagline below "Tistra Health" varies per page; the
// copyright is identical everywhere. The "switch to coaching view"
// prompt only makes sense on a page that isn't already the coaching view,
// so it's hidden on both the home and coach variants; on /coach the
// cross-link instead points visitors toward the non-coaching products
// (Family, Me) rather than back to the page they're already on.
export function MarketingFooter({ variant }: { variant: MarketingFooterVariant }) {
  return (
    <footer className="border-t border-gray-200 py-12 px-6 text-sm text-gray-500">
      <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div>
          <p className="font-semibold text-gray-900 mb-1">Tistra Health</p>
          <p className="text-xs">
            {TAGLINE[variant]}
          </p>
        </div>

        {variant === "coach" ? (
          <div className="flex flex-col gap-1 text-xs">
            <span className="text-gray-400">Tracking for yourself or a family member?</span>
            <div className="flex gap-3">
              <Link href="/me" className="text-gray-600 hover:text-gray-900 underline underline-offset-2">
                For myself →
              </Link>
              <Link href="/family" className="text-gray-600 hover:text-gray-900 underline underline-offset-2">
                For family →
              </Link>
            </div>
          </div>
        ) : variant !== "home" && (
          <div className="flex flex-col gap-1 text-xs">
            <span className="text-gray-400">Are you a trainer or fitness professional?</span>
            <Link href="/coach" className="text-gray-600 hover:text-gray-900 underline underline-offset-2">
              Switch to the coaching view →
            </Link>
          </div>
        )}

        <div className="flex flex-col items-start md:items-end gap-1 text-xs text-gray-400">
          <span>©2026 Tistra Pte Ltd</span>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 md:justify-end">
            <Link href="/terms" className="text-gray-500 hover:text-gray-900 underline underline-offset-2">
              Terms &amp; Conditions
            </Link>
            <span aria-hidden="true">·</span>
            <Link href="/privacy" className="text-gray-500 hover:text-gray-900 underline underline-offset-2">
              Privacy Policy
            </Link>
            <span aria-hidden="true">·</span>
            <span>
              Support:{" "}
              <a
                href="mailto:tistrahealth@gmail.com?subject=Tistra%20Health%20Support"
                className="text-gray-500 hover:text-gray-900 underline underline-offset-2"
              >
                tistrahealth@gmail.com
              </a>
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}

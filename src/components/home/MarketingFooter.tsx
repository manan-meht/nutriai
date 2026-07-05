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
// prompt only makes sense on a page that isn't already about picking a
// product, so it's hidden on the home variant.
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

        {variant !== "home" && (
          <div className="flex flex-col gap-1 text-xs">
            <span className="text-gray-400">Are you a trainer or fitness professional?</span>
            <Link href="/coach" className="text-gray-600 hover:text-gray-900 underline underline-offset-2">
              Switch to the coaching view →
            </Link>
          </div>
        )}

        <div className="text-xs text-gray-400">
          ©2026 Tistra Pte Ltd
        </div>
      </div>
    </footer>
  );
}

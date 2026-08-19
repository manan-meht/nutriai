import Link from "next/link";
import { CLUB_TOKENS as T } from "@/components/coach/tokens";
import { CLUB_BRANDING } from "@/lib/club/config";

// Consumer marketplace chrome. Mobile-first per the Stitch designs: a
// bottom tab bar with safe-area padding, and a light top bar carrying the
// brand. Branding comes from CLUB_BRANDING so the product can be renamed
// (or spun onto tistra.club) without touching components.

export type ClubTab = "discover" | "bookings" | "profile";

const TABS: Array<{ key: ClubTab; label: string; href: string; icon: string }> = [
  { key: "discover", label: "Discover", href: "/", icon: "◎" },
  { key: "bookings", label: "Bookings", href: "/bookings", icon: "▤" },
  { key: "profile", label: "Profile", href: "/profile", icon: "◑" },
];

export function ClubChrome({
  active,
  children,
  hideNav,
}: {
  active?: ClubTab;
  children: React.ReactNode;
  /** Booking/checkout screens hide the tab bar so the sticky CTA owns the
   * bottom of the screen — competing bars is the classic mobile-web tell. */
  hideNav?: boolean;
}) {
  return (
    <div className="min-h-screen" style={{ backgroundColor: T.surface, color: T.onSurface }}>
      <header
        className="sticky top-0 z-30 border-b backdrop-blur"
        style={{ borderColor: T.outlineVariant, backgroundColor: "rgba(251,248,255,0.9)" }}
      >
        <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-3.5">
          <Link href="/" className="text-[15px] font-semibold tracking-[-0.01em]">
            {CLUB_BRANDING.productName}
          </Link>
        </div>
      </header>

      <main className={`mx-auto max-w-3xl px-5 pt-6 ${hideNav ? "pb-40" : "pb-28"}`}>{children}</main>

      {!hideNav && (
        <nav
          className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-3 border-t"
          style={{
            backgroundColor: T.surfaceContainerLowest,
            borderColor: T.outlineVariant,
            paddingBottom: "env(safe-area-inset-bottom)",
          }}
        >
          {TABS.map((t) => (
            <Link
              key={t.key}
              href={t.href}
              aria-current={t.key === active ? "page" : undefined}
              className="flex min-h-[56px] flex-col items-center justify-center gap-1 text-[11px] font-medium"
              style={{ color: t.key === active ? T.primary : T.onSurfaceVariant }}
            >
              <span aria-hidden="true" className="text-base">{t.icon}</span>
              {t.label}
            </Link>
          ))}
        </nav>
      )}
    </div>
  );
}

/** Sticky bottom action used by the profile and booking screens — the
 * primary CTA must stay reachable without scrolling back (spec). */
export function StickyAction({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="fixed inset-x-0 bottom-0 z-40 border-t px-5 py-4"
      style={{
        backgroundColor: T.surfaceContainerLowest,
        borderColor: T.outlineVariant,
        paddingBottom: "calc(1rem + env(safe-area-inset-bottom))",
      }}
    >
      <div className="mx-auto max-w-3xl">{children}</div>
    </div>
  );
}

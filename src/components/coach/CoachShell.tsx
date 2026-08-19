import Link from "next/link";
import { CLUB_TOKENS } from "./tokens";

// Coach OS chrome: persistent sidebar on desktop, bottom bar on mobile.
//
// Server component — nothing here needs interactivity beyond navigation,
// and keeping it on the server means the Coach OS shell costs no client
// JavaScript. Active state is passed in rather than read from a hook for
// the same reason.

export type CoachNavKey = "dashboard" | "calendar" | "clients" | "nutrition" | "payments" | "settings";

const NAV: Array<{ key: CoachNavKey; label: string; href: string; icon: string }> = [
  { key: "dashboard", label: "Dashboard", href: "/coach/dashboard", icon: "▦" },
  { key: "calendar", label: "Calendar", href: "/coach/calendar", icon: "▤" },
  { key: "clients", label: "Clients", href: "/coach/clients", icon: "◎" },
  // Nutrition tracking is the one paid feature inside an otherwise free
  // Coach OS. It sits in the main nav rather than behind an upsell banner:
  // a coach should be able to see what they'd be buying.
  { key: "nutrition", label: "Nutrition", href: "/coach/nutrition", icon: "◍" },
  { key: "payments", label: "Payments", href: "/coach/payments", icon: "▭" },
  { key: "settings", label: "Settings", href: "/coach/settings", icon: "⚙" },
];

export function CoachShell({
  active,
  coachName,
  photoUrl,
  children,
}: {
  active: CoachNavKey;
  coachName: string;
  photoUrl?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen" style={{ backgroundColor: CLUB_TOKENS.surface, color: CLUB_TOKENS.onSurface }}>
      <div className="flex">
        {/* Desktop sidebar */}
        <aside
          className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r px-4 py-6 md:flex"
          style={{ backgroundColor: CLUB_TOKENS.surfaceContainerLow, borderColor: CLUB_TOKENS.outlineVariant }}
        >
          <div className="mb-8 flex items-center gap-3 px-2">
            <Avatar name={coachName} photoUrl={photoUrl} />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{coachName}</p>
              <p className="truncate text-xs" style={{ color: CLUB_TOKENS.onSurfaceVariant }}>
                Tistra Coach
              </p>
            </div>
          </div>
          <nav className="flex flex-col gap-1">
            {NAV.map((item) => (
              <Link
                key={item.key}
                href={item.href}
                aria-current={item.key === active ? "page" : undefined}
                className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-medium transition-colors"
                style={
                  item.key === active
                    ? { backgroundColor: CLUB_TOKENS.primaryContainer, color: CLUB_TOKENS.primary }
                    : { color: CLUB_TOKENS.onSurfaceVariant }
                }
              >
                <span aria-hidden="true" className="text-base">{item.icon}</span>
                {item.label}
              </Link>
            ))}
          </nav>
        </aside>

        <main className="min-w-0 flex-1 px-5 pb-28 pt-8 md:px-10 md:pb-12">{children}</main>
      </div>

      {/* Mobile bottom navigation. Essential actions are never swipe-only
          (spec) — every destination is a tap target here. */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t md:hidden"
        style={{
          backgroundColor: CLUB_TOKENS.surfaceContainerLowest,
          borderColor: CLUB_TOKENS.outlineVariant,
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        {NAV.map((item) => (
          <Link
            key={item.key}
            href={item.href}
            aria-current={item.key === active ? "page" : undefined}
            className="flex min-h-[56px] flex-col items-center justify-center gap-1 text-[11px] font-medium"
            style={{ color: item.key === active ? CLUB_TOKENS.primary : CLUB_TOKENS.onSurfaceVariant }}
          >
            <span aria-hidden="true" className="text-base">{item.icon}</span>
            {item.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

function Avatar({ name, photoUrl }: { name: string; photoUrl?: string | null }) {
  if (photoUrl) {
    // eslint-disable-next-line @next/next/no-img-element -- signed Supabase Storage URL, not a local asset
    return <img src={photoUrl} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />;
  }
  const initials = name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  return (
    <div
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold"
      style={{ backgroundColor: CLUB_TOKENS.primaryContainer, color: CLUB_TOKENS.primary }}
      aria-hidden="true"
    >
      {initials}
    </div>
  );
}

/** Page heading used across every Coach OS screen, so the editorial rhythm
 * (small date/eyebrow above a large display line) stays consistent. */
export function CoachPageHeader({
  eyebrow,
  title,
  action,
}: {
  eyebrow?: string;
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && (
          <p className="text-sm" style={{ color: CLUB_TOKENS.onSurfaceVariant }}>
            {eyebrow}
          </p>
        )}
        <h1 className="mt-1 text-[2rem] font-semibold leading-10 tracking-[-0.02em] text-balance">{title}</h1>
      </div>
      {action}
    </header>
  );
}

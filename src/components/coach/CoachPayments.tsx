import { CLUB_TOKENS as T } from "./tokens";
import { PayoutsSection, type PayoutState } from "./PayoutsSection";
import { CoachPageHeader } from "./CoachShell";
import { Card, CardLabel } from "./CoachDashboard";
import { formatMoney, CLUB_MARKET } from "@/lib/club/config";
import type { CoachPaymentsSummary } from "@/lib/club/coach-queries";

const dateFmt = new Intl.DateTimeFormat("en-SG", {
  timeZone: CLUB_MARKET.timezone,
  day: "numeric",
  month: "short",
  year: "numeric",
});

export function CoachPayments({ summary, payouts }: { payouts: PayoutState; summary: CoachPaymentsSummary }) {
  return (
    <>
      <CoachPageHeader title="Payments" />

      {/* Payouts are the one thing a coach must not be confused about, so
          an incomplete setup is stated plainly rather than implied by an
          empty table. */}
      {/* Payouts live here, not behind a disabled "coming soon" button —
          this is the page a coach opens when wondering where their money
          is. The same section appears in settings, where a new coach is
          working through their publish checklist. */}
      {!summary.payoutsEnabled && (
        <div className="mb-6">
          <PayoutsSection state={payouts} />
        </div>
      )}

      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardLabel>Lifetime earnings</CardLabel>
          <p className="mt-3 text-[2rem] font-semibold leading-none tracking-[-0.02em] tabular-nums">
            {formatMoney(summary.lifetimeEarningsCents, summary.currency)}
          </p>
          <p className="mt-1.5 text-xs" style={{ color: T.onSurfaceVariant }}>
            Your share, after platform fee
          </p>
        </Card>
        <Card>
          <CardLabel>Awaiting payout</CardLabel>
          <p className="mt-3 text-[2rem] font-semibold leading-none tracking-[-0.02em] tabular-nums">
            {formatMoney(summary.pendingPayoutCents, summary.currency)}
          </p>
          <p className="mt-1.5 text-xs" style={{ color: T.onSurfaceVariant }}>
            {summary.payoutsEnabled ? "Paid out on your payout schedule" : "Set up payouts to receive this"}
          </p>
        </Card>
        <Card>
          <CardLabel>Sessions paid</CardLabel>
          <p className="mt-3 text-[2rem] font-semibold leading-none tracking-[-0.02em] tabular-nums">
            {summary.recent.filter((r) => r.status === "succeeded").length}
          </p>
          <p className="mt-1.5 text-xs" style={{ color: T.onSurfaceVariant }}>
            In your recent history
          </p>
        </Card>
      </div>

      <h2 className="mb-4 text-xl font-semibold tracking-[-0.01em]">Recent payments</h2>

      {summary.recent.length === 0 ? (
        <div
          className="rounded-2xl border border-dashed px-6 py-12 text-center"
          style={{ borderColor: T.outlineVariant }}
        >
          <p className="text-[15px] font-medium">No payments yet.</p>
          <p className="mx-auto mt-2 max-w-sm text-sm" style={{ color: T.onSurfaceVariant }}>
            When a client books, they pay upfront. Your share appears here immediately, and every
            fee and refund is itemised.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-sm">
            <thead>
              <tr className="text-left" style={{ color: T.onSurfaceVariant }}>
                <Th>Date</Th>
                <Th>Client</Th>
                <Th align="right">Session</Th>
                <Th align="right">Fee</Th>
                <Th align="right">You earned</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {summary.recent.map((p) => (
                <tr key={p.id} className="border-t" style={{ borderColor: T.outlineVariant }}>
                  <Td>{dateFmt.format(new Date(p.createdAt))}</Td>
                  <Td>{p.clientName}</Td>
                  <Td align="right">{formatMoney(p.grossCents, summary.currency)}</Td>
                  {/* Shown as a negative so the arithmetic reads at a glance
                      — a coach should never have to work out the split. */}
                  <Td align="right">
                    <span style={{ color: T.onSurfaceVariant }}>−{formatMoney(p.platformFeeCents, summary.currency)}</span>
                  </Td>
                  <Td align="right">
                    <span className="font-semibold">{formatMoney(p.coachAmountCents, summary.currency)}</span>
                  </Td>
                  <Td>
                    <PaymentStatus status={p.status} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function Th({ children, align }: { children: React.ReactNode; align?: "right" }) {
  return (
    <th
      scope="col"
      className={`px-3 py-2 text-xs font-semibold uppercase tracking-[0.05em] ${align === "right" ? "text-right" : ""}`}
    >
      {children}
    </th>
  );
}

function Td({ children, align }: { children: React.ReactNode; align?: "right" }) {
  return (
    <td className={`px-3 py-3 ${align === "right" ? "text-right tabular-nums" : ""}`}>{children}</td>
  );
}

function PaymentStatus({ status }: { status: string }) {
  const map: Record<string, { bg: string; fg: string; label: string }> = {
    succeeded: { bg: T.successContainer, fg: T.success, label: "Paid" },
    pending: { bg: T.warningContainer, fg: T.warning, label: "Pending" },
    failed: { bg: T.errorContainer, fg: T.error, label: "Failed" },
    refunded: { bg: T.surfaceContainer, fg: T.onSurfaceVariant, label: "Refunded" },
    partially_refunded: { bg: T.surfaceContainer, fg: T.onSurfaceVariant, label: "Part refund" },
  };
  const s = map[status] ?? map.pending;
  return (
    <span className="rounded-full px-2.5 py-0.5 text-xs font-medium" style={{ backgroundColor: s.bg, color: s.fg }}>
      {s.label}
    </span>
  );
}

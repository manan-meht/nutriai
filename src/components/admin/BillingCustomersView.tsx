import type { BillingCustomer, BillingCustomersSummary, ExclusionReason } from "@/lib/admin/billing-customers";

// Paying customers and trials with a card behind them.
//
// The excluded block is not decoration. Sandbox purchases and comped
// accounts sit in the entitlements table looking exactly like revenue, so
// they are shown separately and counted separately rather than hidden —
// hiding them would make the same mistake quietly instead of loudly.

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function renewalLabel(days: number | null): string {
  if (days === null) return "";
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return "today";
  return `in ${days}d`;
}

function planLabel(customer: BillingCustomer): string {
  const parts = [customer.plan ?? "—"];
  if (customer.billingInterval) parts.push(customer.billingInterval);
  return parts.join(" · ");
}

const EXCLUSION_COPY: Record<ExclusionReason, string> = {
  sandbox: "Sandbox / test purchase",
  comped: "Access granted manually, no purchase",
};

function Stat({ label, value, hint, muted }: { label: string; value: string | number; hint?: string; muted?: boolean }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4">
      <p className="text-xs text-gray-400 uppercase tracking-wide">{label}</p>
      <p className={`text-2xl font-bold mt-1 tabular-nums ${muted ? "text-gray-400" : "text-gray-900"}`}>{value}</p>
      {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
    </div>
  );
}

function CustomerTable({
  customers,
  dateLabel,
  emptyMessage,
  reasonOf,
}: {
  customers: Array<BillingCustomer & { reason?: ExclusionReason }>;
  dateLabel: string;
  emptyMessage: string;
  reasonOf?: boolean;
}) {
  if (customers.length === 0) {
    return (
      <div className="text-center py-10 text-gray-400 text-sm bg-white rounded-2xl border border-gray-100">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-gray-400 uppercase tracking-wide border-b border-gray-100">
            <th className="p-3">Account</th>
            <th className="p-3">Plan</th>
            <th className="p-3">Via</th>
            <th className="p-3">Market</th>
            <th className="p-3">{dateLabel}</th>
            {reasonOf && <th className="p-3">Why not counted</th>}
          </tr>
        </thead>
        <tbody>
          {customers.map((c) => (
            <tr key={`${c.workspaceId}-${c.status}`} className="border-b border-gray-50 last:border-0">
              <td className="p-3">
                <span className="text-gray-900 font-medium">{c.ownerEmail ?? "Unknown"}</span>
                {c.workspaceName && <span className="block text-xs text-gray-400">{c.workspaceName}</span>}
              </td>
              <td className="p-3 text-gray-600 capitalize whitespace-nowrap">{planLabel(c)}</td>
              <td className="p-3 text-gray-600 whitespace-nowrap">
                {c.paymentProvider ? c.paymentProvider.replace("_", " ") : "—"}
                {c.environment === "unknown" && c.paymentProvider && (
                  <span className="block text-xs text-gray-400">environment unknown</span>
                )}
              </td>
              <td className="p-3 text-gray-600">{c.billingMarket ?? "—"}</td>
              <td className="p-3 text-gray-600 whitespace-nowrap">
                {formatDate(c.status === "trialing" ? c.trialEndAt : c.currentPeriodEnd)}
                <span className="text-gray-400 text-xs ml-1">{renewalLabel(c.daysUntilRenewal)}</span>
                {c.cancelAtPeriodEnd && <span className="block text-xs text-amber-600">cancels at period end</span>}
              </td>
              {reasonOf && (
                <td className="p-3 text-gray-500 text-xs">{c.reason ? EXCLUSION_COPY[c.reason] : "—"}</td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function BillingCustomersView({ data }: { data: BillingCustomersSummary }) {
  const { paying, trialingWithCard, trialingWithoutCard, excluded } = data;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-lg font-bold text-gray-900">Billing</h1>
        <p className="text-sm text-gray-500 mt-1">
          Who is paying, and which trials have a payment method behind them.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Paying" value={paying.length} hint="real purchases" />
        <Stat label="Trial + card" value={trialingWithCard.length} hint="will convert unless cancelled" />
        <Stat label="Trial, no card" value={trialingWithoutCard.length} hint="will not convert on its own" muted />
        <Stat label="Not counted" value={excluded.length} hint="test and comped" muted />
      </div>

      <section className="space-y-3">
        <h2 className="text-base font-bold text-gray-900">Paying customers</h2>
        <CustomerTable
          customers={paying}
          dateLabel="Renews"
          emptyMessage="No paying customers yet."
        />
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-base font-bold text-gray-900">In free period, card added</h2>
          <p className="text-sm text-gray-500">
            A payment method is on file, so these become charges when the trial ends unless cancelled first.
          </p>
        </div>
        <CustomerTable
          customers={trialingWithCard}
          dateLabel="Trial ends"
          emptyMessage="No trials with a payment method on file."
        />
      </section>

      {trialingWithoutCard.length > 0 && (
        <section className="space-y-3">
          <div>
            <h2 className="text-base font-bold text-gray-900">In free period, no card</h2>
            <p className="text-sm text-gray-500">
              Nobody went through checkout for these, so they expire rather than convert.
            </p>
          </div>
          <CustomerTable customers={trialingWithoutCard} dateLabel="Trial ends" emptyMessage="" />
        </section>
      )}

      {excluded.length > 0 && (
        <section className="space-y-3">
          <div>
            <h2 className="text-base font-bold text-gray-900">Not counted as revenue</h2>
            <p className="text-sm text-gray-500">
              These hold a paid status but no real money moved. They are listed so the count above can be
              trusted, rather than being silently folded into it.
            </p>
          </div>
          <CustomerTable customers={excluded} dateLabel="Renews" emptyMessage="" reasonOf />
        </section>
      )}
    </div>
  );
}

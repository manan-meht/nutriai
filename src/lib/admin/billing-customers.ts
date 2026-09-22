// Who is actually paying, and who is in a trial that will start charging.
//
// The distinction this file exists to protect: a sandbox purchase looks
// identical to a real one in the entitlements table. Both are status
// "active" with an apple provider and a subscription id. At the time this
// was written every single "active" row was a test — two sandbox purchases
// (one made by Apple's own reviewer during App Review) and one comped
// account for Google Play review — so a dashboard that counted rows would
// have reported three paying customers against real revenue of zero.
//
// The environment is not on the entitlements row; it is in the webhook
// payload that created it. RevenueCat sends event.environment
// ("SANDBOX"/"PRODUCTION"), Stripe sends livemode. Both are read back from
// payment_webhook_events and matched to the owner.

/** Statuses meaning the customer has paid at least once and either has
 * access or is in a payment retry the store still expects to recover.
 * "cancelled"/"expired" are former customers; "not_started" never began. */
const PAID_STATUSES = new Set(["active", "cancel_at_period_end", "past_due", "grace_period"]);

export type BillingEnvironment = "production" | "sandbox" | "unknown";

/** Why a row is not counted as revenue, or null when it is. */
export type ExclusionReason = "sandbox" | "comped";

export interface EntitlementRowForBilling {
  workspaceId: string;
  ownerId: string | null;
  ownerEmail: string | null;
  workspaceName: string | null;
  plan: string | null;
  status: string;
  paymentProvider: string | null;
  /** Null means nobody ever went through a checkout for this row — a
   * legacy card-free trial, or access granted by hand. */
  providerSubscriptionId: string | null;
  providerPriceId: string | null;
  billingInterval: string | null;
  billingMarket: string | null;
  trialEndAt: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  environment: BillingEnvironment;
}

export interface BillingCustomer extends EntitlementRowForBilling {
  /** Days until the trial ends or the subscription renews; negative when
   * the date has passed. Null when there is no date to count to. */
  daysUntilRenewal: number | null;
}

export interface BillingCustomersSummary {
  /** Real money: a production purchase in a paid status. */
  paying: BillingCustomer[];
  /** Trial that has a payment method behind it, so it converts to a charge
   * unless cancelled. The pipeline worth watching. */
  trialingWithCard: BillingCustomer[];
  /** Trial with no payment method — a legacy card-free trial. Shown for
   * context: these do not convert on their own. */
  trialingWithoutCard: BillingCustomer[];
  /** Paid-status rows deliberately kept out of `paying`, with the reason. */
  excluded: Array<BillingCustomer & { reason: ExclusionReason }>;
}

function daysUntil(iso: string | null, now: number): number | null {
  if (!iso) return null;
  return Math.ceil((new Date(iso).getTime() - now) / 86_400_000);
}

/** Reads the environment out of a stored webhook payload. Unknown rather
 * than a guess when the payload says nothing — an unknown is surfaced in
 * the view instead of being quietly counted as revenue. */
export function environmentFromWebhookPayload(payload: unknown): BillingEnvironment {
  const body = payload as { livemode?: boolean; event?: { environment?: string } } | null;
  if (!body) return "unknown";
  const rc = body.event?.environment;
  if (rc === "SANDBOX") return "sandbox";
  if (rc === "PRODUCTION") return "production";
  if (typeof body.livemode === "boolean") return body.livemode ? "production" : "sandbox";
  return "unknown";
}

export function summariseBillingCustomers(
  rows: EntitlementRowForBilling[],
  now: number = Date.now()
): BillingCustomersSummary {
  const summary: BillingCustomersSummary = {
    paying: [],
    trialingWithCard: [],
    trialingWithoutCard: [],
    excluded: [],
  };

  for (const row of rows) {
    const customer: BillingCustomer = {
      ...row,
      daysUntilRenewal: daysUntil(row.status === "trialing" ? row.trialEndAt : row.currentPeriodEnd, now),
    };

    if (row.status === "trialing") {
      // A payment method exists only if a checkout produced a subscription.
      if (row.providerSubscriptionId) summary.trialingWithCard.push(customer);
      else summary.trialingWithoutCard.push(customer);
      continue;
    }

    if (!PAID_STATUSES.has(row.status)) continue;

    if (!row.providerSubscriptionId) {
      // Paid status with no purchase behind it: access granted by hand,
      // e.g. a reviewer comp. Real access, but not revenue.
      summary.excluded.push({ ...customer, reason: "comped" });
      continue;
    }
    if (row.environment === "sandbox") {
      summary.excluded.push({ ...customer, reason: "sandbox" });
      continue;
    }
    summary.paying.push(customer);
  }

  // Soonest renewal first — the next thing to happen is the useful order.
  const bySoonest = (a: BillingCustomer, b: BillingCustomer) =>
    (a.daysUntilRenewal ?? Number.MAX_SAFE_INTEGER) - (b.daysUntilRenewal ?? Number.MAX_SAFE_INTEGER);
  summary.paying.sort(bySoonest);
  summary.trialingWithCard.sort(bySoonest);
  summary.trialingWithoutCard.sort(bySoonest);

  return summary;
}

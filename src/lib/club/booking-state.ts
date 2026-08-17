// Booking state machine (spec: a proper state machine, never scattered
// booleans) and the refund arithmetic that hangs off it.
//
// Pure by design: transitions and refund amounts are decided here from
// plain data, and persisted by the caller. Anything that can silently move
// money or strand a coach belongs in code that a test can enumerate.

export type BookingStatus =
  | "PAYMENT_PENDING"
  | "CONFIRMED"
  | "COMPLETED"
  | "CANCELLED_BY_CLIENT"
  | "CANCELLED_BY_COACH"
  | "NO_SHOW_CLIENT"
  | "NO_SHOW_COACH"
  | "REFUND_PENDING"
  | "REFUNDED";

export type ActorKind = "client" | "coach" | "admin" | "system";

/** Terminal states hold no slot: their locks are released, and no further
 * transition is legal (except admin repair). */
export const TERMINAL_STATUSES: BookingStatus[] = [
  "COMPLETED",
  "CANCELLED_BY_CLIENT",
  "CANCELLED_BY_COACH",
  "NO_SHOW_CLIENT",
  "NO_SHOW_COACH",
  "REFUNDED",
];

/** States that still occupy the coach's calendar. Used to decide whether a
 * slot lock should exist — see releaseLockIfTerminal(). */
export const SLOT_HOLDING_STATUSES: BookingStatus[] = [
  "PAYMENT_PENDING",
  "CONFIRMED",
  "REFUND_PENDING",
];

/**
 * Who may perform each transition. Encoded as data so authorization is
 * enumerable rather than scattered across route handlers — a coach must
 * not be able to mark a client a no-show *before* the session, and a
 * client must never be able to confirm their own unpaid booking.
 */
const TRANSITIONS: Record<BookingStatus, Partial<Record<BookingStatus, ActorKind[]>>> = {
  PAYMENT_PENDING: {
    // Only ever from verified webhook state, never a client success page.
    CONFIRMED: ["system", "admin"],
    CANCELLED_BY_CLIENT: ["client", "system", "admin"], // includes hold expiry
    CANCELLED_BY_COACH: ["coach", "admin"],
  },
  CONFIRMED: {
    COMPLETED: ["coach", "admin"],
    CANCELLED_BY_CLIENT: ["client", "admin"],
    CANCELLED_BY_COACH: ["coach", "admin"],
    NO_SHOW_CLIENT: ["coach", "admin"],
    NO_SHOW_COACH: ["client", "admin"],
    REFUND_PENDING: ["admin", "system"],
  },
  COMPLETED: {
    // Post-hoc correction only, and only by an admin.
    REFUND_PENDING: ["admin"],
  },
  REFUND_PENDING: {
    REFUNDED: ["system", "admin"],
    CONFIRMED: ["admin"], // refund abandoned
  },
  CANCELLED_BY_CLIENT: { REFUND_PENDING: ["system", "admin"] },
  CANCELLED_BY_COACH: { REFUND_PENDING: ["system", "admin"] },
  NO_SHOW_CLIENT: { REFUND_PENDING: ["admin"] },
  NO_SHOW_COACH: { REFUND_PENDING: ["system", "admin"] },
  REFUNDED: {},
};

export function canTransition(from: BookingStatus, to: BookingStatus, actor: ActorKind): boolean {
  return TRANSITIONS[from]?.[to]?.includes(actor) ?? false;
}

export function assertTransition(from: BookingStatus, to: BookingStatus, actor: ActorKind): void {
  if (!canTransition(from, to, actor)) {
    throw new Error(`Illegal booking transition ${from} -> ${to} by ${actor}`);
  }
}

export function isTerminal(status: BookingStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

export function holdsSlot(status: BookingStatus): boolean {
  return SLOT_HOLDING_STATUSES.includes(status);
}

// ---- Cancellation and refunds ----------------------------------------

/** Frozen onto each booking at creation (spec) so a coach editing their
 * policy later cannot retroactively change what a client is owed. */
export interface CancellationPolicySnapshot {
  fullRefundHours: number;
  partialRefundPercent: number;
}

export interface RefundDecision {
  amountCents: number;
  /** Which rule produced the amount — stored on the refund row so support
   * can explain any number to a customer without re-deriving it. */
  policyApplied:
    | "full_refund_within_window"
    | "partial_refund_after_window"
    | "no_refund_after_window"
    | "coach_cancelled_full_refund"
    | "coach_no_show_full_refund"
    | "client_no_show_no_refund"
    | "not_refundable";
}

export function calculateRefund(input: {
  status: BookingStatus;
  /** Gross paid, integer cents, including any travel fee. */
  paidCents: number;
  sessionStartsAt: Date;
  cancelledAt: Date;
  policy: CancellationPolicySnapshot;
}): RefundDecision {
  const { status, paidCents, sessionStartsAt, cancelledAt, policy } = input;

  // A coach cancelling or failing to show is never the client's cost.
  if (status === "CANCELLED_BY_COACH") {
    return { amountCents: paidCents, policyApplied: "coach_cancelled_full_refund" };
  }
  if (status === "NO_SHOW_COACH") {
    return { amountCents: paidCents, policyApplied: "coach_no_show_full_refund" };
  }
  // The coach held the slot and turned up; the session is not refunded.
  if (status === "NO_SHOW_CLIENT") {
    return { amountCents: 0, policyApplied: "client_no_show_no_refund" };
  }
  if (status !== "CANCELLED_BY_CLIENT") {
    return { amountCents: 0, policyApplied: "not_refundable" };
  }

  const hoursBefore = (sessionStartsAt.getTime() - cancelledAt.getTime()) / 3_600_000;
  if (hoursBefore >= policy.fullRefundHours) {
    return { amountCents: paidCents, policyApplied: "full_refund_within_window" };
  }
  if (policy.partialRefundPercent <= 0) {
    return { amountCents: 0, policyApplied: "no_refund_after_window" };
  }
  // Round down: never refund more than the policy promises.
  return {
    amountCents: Math.floor((paidCents * policy.partialRefundPercent) / 100),
    policyApplied: "partial_refund_after_window",
  };
}

/** Which terminal status a cancellation should produce, from who acted. */
export function cancellationStatusFor(actor: "client" | "coach"): BookingStatus {
  return actor === "client" ? "CANCELLED_BY_CLIENT" : "CANCELLED_BY_COACH";
}

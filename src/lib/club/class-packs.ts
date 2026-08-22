import { splitAmount } from "./config";

/**
 * Class packs: a coach sells 5, 10 or 20 of one service at a lower price
 * per class, charged once upfront.
 *
 * The money model is the same one single bookings use — a single
 * destination charge, the coach paid immediately, the platform fee
 * inclusive — and that has a consequence worth stating plainly rather than
 * discovering during a dispute: the coach receives payment for classes
 * they have not yet delivered. Everything here is arithmetic on that fact.
 */

/** The only pack sizes offered. Fixed rather than free-form: a coach
 * inventing a 7-class pack helps nobody, and the check constraint in
 * migration 0061 enforces the same set. */
export const PACK_SIZES = [5, 10, 20] as const;
export type PackSize = (typeof PACK_SIZES)[number];

export function isPackSize(n: number): n is PackSize {
  return (PACK_SIZES as readonly number[]).includes(n);
}

/** Per-class price implied by a pack, rounded to the cent.
 *
 * Rounded DOWN so the advertised per-class figure is never more than the
 * client actually pays — "$88 a class" must not turn into $88.34 at
 * checkout. The rounding remainder stays in the pack total, which is the
 * number actually charged. */
export function perClassCents(packPriceCents: number, classCount: number): number {
  if (classCount <= 0) return 0;
  return Math.floor(packPriceCents / classCount);
}

/** How much cheaper a pack is per class, as a whole percentage.
 *
 * Rounded DOWN too, for the same reason: claiming "save 20%" when the true
 * figure is 19.6% is a claim we cannot support line by line. */
export function savingPercent(
  singlePriceCents: number,
  packPriceCents: number,
  classCount: number
): number {
  if (singlePriceCents <= 0 || classCount <= 0) return 0;
  const per = perClassCents(packPriceCents, classCount);
  if (per >= singlePriceCents) return 0;
  return Math.floor(((singlePriceCents - per) / singlePriceCents) * 100);
}

/** A pack must actually be a discount. A coach pricing 10 classes at or
 * above 10 singles has either mistyped or misunderstood, and the client
 * would be worse off for committing. */
export function packPriceProblem(
  singlePriceCents: number,
  packPriceCents: number,
  classCount: number
): string | null {
  if (!isPackSize(classCount)) return "Packs can be 5, 10 or 20 classes.";
  if (packPriceCents <= 0) return "Enter a price for the pack.";
  if (singlePriceCents <= 0) return "Set a price for the class first.";
  if (packPriceCents >= singlePriceCents * classCount) {
    return `A ${classCount}-class pack must cost less than ${classCount} single classes.`;
  }
  return null;
}

export interface PackCredits {
  classesTotal: number;
  classesUsed: number;
  status: string;
  expiresAt: string | null;
}

/** Whether a credit can be spent right now.
 *
 * Expiry is checked against the caller's clock rather than trusting the
 * stored status: a pack expires by the passage of time, and nothing sweeps
 * the table the moment it does. */
export function creditsRemaining(pack: PackCredits, now: Date = new Date()): number {
  if (pack.status !== "ACTIVE") return 0;
  if (pack.expiresAt && new Date(pack.expiresAt).getTime() <= now.getTime()) return 0;
  return Math.max(0, pack.classesTotal - pack.classesUsed);
}

export function isRedeemable(pack: PackCredits, now: Date = new Date()): boolean {
  return creditsRemaining(pack, now) > 0;
}

/**
 * What to refund when a client abandons a part-used pack.
 *
 * Classes already taken are charged at the SINGLE price, not the pack
 * price. Otherwise someone buys 10 at a discount, takes 3 at the cheap
 * rate, refunds the rest, and has beaten the coach's own single price —
 * the discount was bought with the commitment, and the commitment is what
 * they are handing back.
 *
 * Never negative: if the singles already taken exceed what was paid, the
 * refund is zero rather than a debt owed to the coach.
 */
export function refundableCents(input: {
  packPriceCents: number;
  singlePriceCents: number;
  classesTotal: number;
  classesUsed: number;
}): number {
  const { packPriceCents, singlePriceCents, classesUsed } = input;
  if (classesUsed <= 0) return packPriceCents;
  const chargedForUsed = singlePriceCents * classesUsed;
  return Math.max(0, packPriceCents - chargedForUsed);
}

/** The platform's cut of a pack, taken once at purchase on the whole
 * amount — the same inclusive fee a single booking pays, so buying a pack
 * is never a way to pay a different rate. */
export function packSplit(packPriceCents: number, feePercent: number) {
  return splitAmount(packPriceCents, feePercent);
}

/** When a pack bought now runs out. */
export function packExpiryDate(expiresAfterDays: number, purchasedAt: Date = new Date()): Date {
  return new Date(purchasedAt.getTime() + expiresAfterDays * 24 * 60 * 60 * 1000);
}

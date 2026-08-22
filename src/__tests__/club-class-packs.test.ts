import {
  PACK_SIZES,
  isPackSize,
  perClassCents,
  savingPercent,
  packPriceProblem,
  creditsRemaining,
  isRedeemable,
  refundableCents,
  packSplit,
  packExpiryDate,
} from "@/lib/club/class-packs";

// Class packs. The money is charged once, upfront, and the coach is paid
// immediately — so every rounding decision here is a claim made to a client
// before they commit, and every refund is money coming back out of a
// coach's balance.

describe("what a pack costs per class", () => {
  it("rounds the per-class price DOWN", () => {
    // 10 classes for S$883 is 88.30 exactly; 10 for S$888.88 is 88.888,
    // which must advertise as 88.88 and never 88.89 — the shown figure has
    // to be one the client will not be charged more than.
    expect(perClassCents(88300, 10)).toBe(8830);
    expect(perClassCents(88888, 10)).toBe(8888);
    expect(perClassCents(10000, 3)).toBe(3333);
  });

  it("does not divide by zero classes", () => {
    expect(perClassCents(50000, 0)).toBe(0);
  });

  it("rounds the advertised saving DOWN", () => {
    // 10 x S$100 singles vs a S$805 pack: 19.5% true, must not claim 20%.
    expect(savingPercent(10000, 80500, 10)).toBe(19);
    // A clean 20% stays 20%.
    expect(savingPercent(10000, 80000, 10)).toBe(20);
  });

  it("claims no saving when the pack is not cheaper", () => {
    expect(savingPercent(10000, 100000, 10)).toBe(0);
    expect(savingPercent(10000, 120000, 10)).toBe(0);
  });
});

describe("a pack has to actually be a discount", () => {
  it("rejects a pack priced at or above the singles it replaces", () => {
    expect(packPriceProblem(10000, 100000, 10)).toMatch(/must cost less/);
    expect(packPriceProblem(10000, 110000, 10)).toMatch(/must cost less/);
  });

  it("accepts a genuine discount", () => {
    expect(packPriceProblem(10000, 90000, 10)).toBeNull();
  });

  it("only allows the three offered sizes", () => {
    expect(PACK_SIZES).toEqual([5, 10, 20]);
    expect(isPackSize(7)).toBe(false);
    expect(packPriceProblem(10000, 60000, 7)).toMatch(/5, 10 or 20/);
  });

  it("refuses before the single price is set", () => {
    expect(packPriceProblem(0, 90000, 10)).toMatch(/price for the class/);
  });
});

describe("spending credits", () => {
  const base = { classesTotal: 10, classesUsed: 3, status: "ACTIVE", expiresAt: null };

  it("counts what is left", () => {
    expect(creditsRemaining(base)).toBe(7);
    expect(isRedeemable(base)).toBe(true);
  });

  it("is spent out at zero", () => {
    expect(creditsRemaining({ ...base, classesUsed: 10 })).toBe(0);
    expect(isRedeemable({ ...base, classesUsed: 10 })).toBe(false);
  });

  it("stops at expiry even while the row still says ACTIVE", () => {
    // Nothing sweeps the table the moment a pack expires, so the check is
    // against the clock, not the stored status.
    const expired = { ...base, expiresAt: "2026-01-01T00:00:00.000Z" };
    expect(creditsRemaining(expired, new Date("2026-06-01T00:00:00.000Z"))).toBe(0);
    expect(creditsRemaining(expired, new Date("2025-06-01T00:00:00.000Z"))).toBe(7);
  });

  it("never goes negative if the data is inconsistent", () => {
    expect(creditsRemaining({ ...base, classesUsed: 99 })).toBe(0);
  });

  it("refuses a pack that is not ACTIVE", () => {
    for (const status of ["PENDING", "REFUNDED", "EXPIRED", "CANCELLED"]) {
      expect(creditsRemaining({ ...base, status })).toBe(0);
    }
  });
});

describe("refunding a part-used pack", () => {
  it("charges classes already taken at the SINGLE price", () => {
    // 10 for S$800 (S$80 each) against a S$100 single. Three taken:
    // 800 - 300 = S$500 back, not 800 - 240.
    expect(
      refundableCents({ packPriceCents: 80000, singlePriceCents: 10000, classesTotal: 10, classesUsed: 3 })
    ).toBe(50000);
  });

  it("refunds everything when nothing has been used", () => {
    expect(
      refundableCents({ packPriceCents: 80000, singlePriceCents: 10000, classesTotal: 10, classesUsed: 0 })
    ).toBe(80000);
  });

  it("stops at zero rather than owing the coach money", () => {
    // Nine of ten taken at the single price already exceeds the pack price.
    expect(
      refundableCents({ packPriceCents: 80000, singlePriceCents: 10000, classesTotal: 10, classesUsed: 9 })
    ).toBe(0);
  });

  it("closes the loophole of buying cheap and refunding the rest", () => {
    // If used classes were charged at the PACK rate, a client could take 3
    // at S$80 and walk — beating the coach's own single price. The refund
    // must leave them having paid the single rate for what they took.
    const packPriceCents = 80000;
    const singlePriceCents = 10000;
    const used = 3;
    const refund = refundableCents({ packPriceCents, singlePriceCents, classesTotal: 10, classesUsed: used });
    const actuallyPaid = packPriceCents - refund;
    expect(actuallyPaid).toBe(singlePriceCents * used);
  });
});

describe("the platform's cut", () => {
  it("takes the same inclusive percentage as a single booking", () => {
    // A pack must not be a way to pay a different rate.
    expect(packSplit(80000, 10)).toEqual(splitOf(80000, 10));
  });

  function splitOf(gross: number, percent: number) {
    const fee = Math.round((gross * percent) / 100);
    return { platformFeeCents: fee, coachAmountCents: gross - fee };
  }
});

describe("expiry", () => {
  it("counts forward from the purchase", () => {
    const bought = new Date("2026-01-01T00:00:00.000Z");
    expect(packExpiryDate(365, bought).toISOString().slice(0, 10)).toBe("2027-01-01");
    expect(packExpiryDate(90, bought).toISOString().slice(0, 10)).toBe("2026-04-01");
  });
});

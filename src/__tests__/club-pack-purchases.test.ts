import { activatePackPurchase, spendPackCredit, usablePacks, refundPackCredit } from "@/lib/club/pack-purchases";

// Buying a pack and spending its credits.
//
// Two failures matter more than the rest, because neither is visible when
// it happens: crediting a pack twice when the webhook and the return page
// race, and two tabs spending the same last credit.

/** A PostgREST stand-in that records filters, so tests observe the QUERY
 * rather than trusting a hand-written return value. */
function stubDb(rows: Record<string, any[]>) {
  const updates: Array<{ table: string; patch: any; filters: Record<string, unknown> }> = [];
  const client: any = {
    from(table: string) {
      const b: any = {
        _f: {} as Record<string, unknown>,
        _patch: null as any,
        select: () => b,
        insert: (v: any) => { b._patch = v; return b; },
        update: (patch: any) => { b._patch = patch; return b; },
        eq: (col: string, val: unknown) => { b._f[col] = val; return b; },
        order: () => b,
        maybeSingle: () => b.then((r: any) => ({ ...r, data: r.data?.[0] ?? null })),
        single: () => b.then((r: any) => ({ ...r, data: r.data?.[0] ?? null })),
        then: (resolve: any) => {
          const all = rows[table] ?? [];
          const matched = all.filter((r) => Object.entries(b._f).every(([k, v]) => r[k] === v));
          if (b._patch) {
            updates.push({ table, patch: b._patch, filters: { ...b._f } });
            for (const r of matched) Object.assign(r, b._patch);
            return resolve({ data: matched.map((r) => ({ id: r.id })), error: null });
          }
          return resolve({ data: matched, error: null });
        },
      };
      return b;
    },
  };
  return { client, updates };
}

describe("crediting a pack is idempotent", () => {
  const pending = () => [{ id: "p1", status: "PENDING", pack_id: null, purchased_at: null, classes_used: 0, classes_total: 10 }];

  it("activates a pending purchase once", async () => {
    const { client, updates } = stubDb({ club_pack_purchases: pending() });
    const res = await activatePackPurchase(client, { purchaseId: "p1", paymentIntentId: "pi_1" });
    expect(res.ok).toBe(true);
    expect(updates.some((u) => u.patch.status === "ACTIVE")).toBe(true);
  });

  it("does not re-credit one that is already ACTIVE", async () => {
    // The webhook and the return page both settle; the second must be a
    // no-op rather than resetting the expiry clock.
    const rows = [{ id: "p1", status: "ACTIVE", pack_id: null, purchased_at: "2026-01-01" }];
    const { client, updates } = stubDb({ club_pack_purchases: rows });
    const res = await activatePackPurchase(client, { purchaseId: "p1" });
    expect(res.ok).toBe(true);
    expect(updates).toHaveLength(0);
  });

  it("guards the write on status PENDING as well", async () => {
    // Belt and braces for the race: the loser's UPDATE must match nothing.
    const { client, updates } = stubDb({ club_pack_purchases: pending() });
    await activatePackPurchase(client, { purchaseId: "p1" });
    expect(updates[0].filters.status).toBe("PENDING");
  });

  it("refuses a refunded or cancelled purchase", async () => {
    for (const status of ["REFUNDED", "CANCELLED", "EXPIRED"]) {
      const { client } = stubDb({ club_pack_purchases: [{ id: "p1", status, pack_id: null }] });
      const res = await activatePackPurchase(client, { purchaseId: "p1" });
      expect(res.ok).toBe(false);
      expect(res.message).toMatch(new RegExp(status.toLowerCase()));
    }
  });
});

describe("spending a credit", () => {
  const active = (used: number) => [{
    id: "p1", status: "ACTIVE", classes_total: 10, classes_used: used, expires_at: null,
  }];

  it("increments used, and links the booking to the pack", async () => {
    const { client, updates } = stubDb({ club_pack_purchases: active(3), bookings: [{ id: "b1" }] });
    const res = await spendPackCredit(client, { purchaseId: "p1", bookingId: "b1" });
    expect(res.ok).toBe(true);
    expect(updates[0].patch.classes_used).toBe(4);
    expect(updates.some((u) => u.table === "bookings" && u.patch.pack_purchase_id === "p1")).toBe(true);
  });

  it("compares-and-swaps, so two tabs cannot spend the same credit", async () => {
    // The update is filtered on the value that was READ. If another tab got
    // there first the filter matches nothing, rather than both incrementing.
    const { client, updates } = stubDb({ club_pack_purchases: active(9), bookings: [{ id: "b1" }] });
    await spendPackCredit(client, { purchaseId: "p1", bookingId: "b1" });
    expect(updates[0].filters.classes_used).toBe(9);
    expect(updates[0].filters.status).toBe("ACTIVE");
  });

  it("refuses when the pack is spent out", async () => {
    const { client } = stubDb({ club_pack_purchases: active(10) });
    const res = await spendPackCredit(client, { purchaseId: "p1", bookingId: "b1" });
    expect(res.ok).toBe(false);
    expect((res as any).message).toMatch(/no classes left/);
  });

  it("refuses an expired pack even while it still says ACTIVE", async () => {
    const rows = [{ id: "p1", status: "ACTIVE", classes_total: 10, classes_used: 0, expires_at: "2026-01-01T00:00:00.000Z" }];
    const { client } = stubDb({ club_pack_purchases: rows });
    const res = await spendPackCredit(client, { purchaseId: "p1", bookingId: "b1" }, new Date("2026-06-01T00:00:00.000Z"));
    expect(res.ok).toBe(false);
  });
});

describe("choosing which pack to spend", () => {
  it("offers the one closest to expiring first", async () => {
    // Otherwise a client loses credits they paid for while a newer pack
    // sits unused.
    const src = require("fs").readFileSync(
      require("path").join(__dirname, "..", "lib/club/pack-purchases.ts"), "utf-8");
    expect(src).toMatch(/\.order\("expires_at", \{ ascending: true/);
  });

  it("excludes spent-out and expired packs", async () => {
    const rows = [
      { id: "spent", status: "ACTIVE", classes_total: 5, classes_used: 5, expires_at: null, service_id: "s1", coach_profile_id: "c1", client_profile_id: "u1" },
      { id: "live", status: "ACTIVE", classes_total: 5, classes_used: 1, expires_at: null, service_id: "s1", coach_profile_id: "c1", client_profile_id: "u1" },
      // Another client's pack, to prove the query is scoped to the caller.
      { id: "someone-else", status: "ACTIVE", classes_total: 5, classes_used: 0, expires_at: null, service_id: "s1", coach_profile_id: "c1", client_profile_id: "u2" },
    ];
    const { client } = stubDb({ club_pack_purchases: rows });
    const packs = await usablePacks(client, { clientProfileId: "u1", serviceId: "s1" });
    expect(packs.map((p) => p.id)).toEqual(["live"]);
  });
});

describe("cancelling a booking returns the credit", () => {
  it("gives it back and unlinks the booking", async () => {
    const { client, updates } = stubDb({
      bookings: [{ id: "b1", pack_purchase_id: "p1" }],
      club_pack_purchases: [{ id: "p1", classes_used: 4 }],
    });
    await refundPackCredit(client, "b1");
    expect(updates.some((u) => u.table === "club_pack_purchases" && u.patch.classes_used === 3)).toBe(true);
    expect(updates.some((u) => u.table === "bookings" && u.patch.pack_purchase_id === null)).toBe(true);
  });

  it("cannot hand the same credit back twice", async () => {
    // A replayed cancellation finds no link and does nothing.
    const { client, updates } = stubDb({
      bookings: [{ id: "b1", pack_purchase_id: null }],
      club_pack_purchases: [{ id: "p1", classes_used: 4 }],
    });
    await refundPackCredit(client, "b1");
    expect(updates).toHaveLength(0);
  });

  it("does nothing for a booking that was paid normally", async () => {
    const { client, updates } = stubDb({ bookings: [{ id: "b1", pack_purchase_id: null }] });
    await refundPackCredit(client, "b1");
    expect(updates).toHaveLength(0);
  });
});

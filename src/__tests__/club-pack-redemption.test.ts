import fs from "fs";
import path from "path";
import { bookWithPackCredit } from "@/lib/club/pack-purchases";

// Booking with a class already paid for.
//
// The ordering is the design: spend the credit, THEN convert the hold. A
// failed conversion gives the credit back and the client is where they
// started. The reverse — convert then spend — leaves a confirmed booking
// nobody paid for, which cannot be undone from the client's side.

const src = (p: string) => fs.readFileSync(path.join(__dirname, "..", p), "utf-8");
const code = (p: string) => src(p).replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
const LIB = "lib/club/pack-purchases.ts";

/** Records the order operations hit the database. */
function stubDb(rows: Record<string, any[]>, opts: { convertFails?: boolean } = {}) {
  const order: string[] = [];
  const client: any = {
    from(table: string) {
      const b: any = {
        _f: {}, _patch: null,
        select: () => b,
        insert: (v: any) => { b._patch = v; order.push(`insert:${table}`); return b; },
        update: (patch: any) => { b._patch = patch; order.push(`update:${table}`); return b; },
        eq: (c: string, v: unknown) => { b._f[c] = v; return b; },
        order: () => b,
        single: () => b.then((r: any) => ({ ...r, data: r.data?.[0] ?? null })),
        maybeSingle: () => b.then((r: any) => ({ ...r, data: r.data?.[0] ?? null })),
        then: (res: any) => {
          if (table === "bookings" && b._patch && opts.convertFails) {
            return res({ data: null, error: { message: "slot taken" } });
          }
          const all = rows[table] ?? [];
          const matched = all.filter((r) => Object.entries(b._f).every(([k, v]) => r[k] === v));
          if (b._patch) {
            for (const r of matched) Object.assign(r, b._patch);
            return res({ data: matched.length ? matched.map((r) => ({ id: r.id })) : [{ id: "new" }], error: null });
          }
          // Copies, like PostgREST — a caller must not be able to observe
          // a later write through a row it read earlier.
          return res({ data: matched.map((r) => ({ ...r })), error: null });
        },
      };
      return b;
    },
  };
  return { client, order };
}

const future = new Date(Date.now() + 3600_000).toISOString();
const slotStart = new Date(Date.now() + 86_400_000).toISOString();
const slotEnd = new Date(Date.now() + 90_000_000).toISOString();

function world(overrides: Record<string, any[]> = {}) {
  return {
    booking_holds: [{ id: "h1", coach_profile_id: "c1", client_profile_id: "u1", service_id: "s1", booking_id: null, released_at: null, expires_at: future, starts_at: slotStart, ends_at: slotEnd }],
    club_pack_purchases: [{ id: "p1", client_profile_id: "u1", coach_profile_id: "c1", service_id: "s1", classes_total: 10, classes_used: 2, status: "ACTIVE", expires_at: null }],
    coach_services: [{ id: "s1", skill_id: "sk1", currency: "SGD" }],
    coach_profiles: [{ id: "c1", cancellation_full_refund_hours: 24, cancellation_partial_refund_percent: 50 }],
    bookings: [],
    booking_slot_locks: [],
    ...overrides,
  };
}

describe("a credit cannot pay for the wrong thing", () => {
  it("refuses a pack belonging to someone else", async () => {
    const rows = world();
    rows.club_pack_purchases[0].client_profile_id = "someone-else";
    const { client } = stubDb(rows);
    const res = await bookWithPackCredit(client, { holdId: "h1", purchaseId: "p1", clientProfileId: "u1" });
    expect(res.ok).toBe(false);
    expect((res as any).message).toMatch(/isn't yours/);
  });

  it("refuses a pack bought for a different class", async () => {
    const rows = world();
    rows.club_pack_purchases[0].service_id = "s2";
    const { client } = stubDb(rows);
    const res = await bookWithPackCredit(client, { holdId: "h1", purchaseId: "p1", clientProfileId: "u1" });
    expect(res.ok).toBe(false);
    expect((res as any).message).toMatch(/can't be used for this class/);
  });

  it("refuses a pack from a different coach", async () => {
    const rows = world();
    rows.club_pack_purchases[0].coach_profile_id = "c2";
    const { client } = stubDb(rows);
    const res = await bookWithPackCredit(client, { holdId: "h1", purchaseId: "p1", clientProfileId: "u1" });
    expect(res.ok).toBe(false);
  });

  it("refuses a hold that has expired", async () => {
    const rows = world();
    rows.booking_holds[0].expires_at = new Date(Date.now() - 1000).toISOString();
    const { client } = stubDb(rows);
    const res = await bookWithPackCredit(client, { holdId: "h1", purchaseId: "p1", clientProfileId: "u1" });
    expect(res.ok).toBe(false);
    expect((res as any).message).toMatch(/released/);
  });

  it("is idempotent for a hold already converted", async () => {
    const rows = world();
    rows.booking_holds[0].booking_id = "b-existing";
    const { client } = stubDb(rows);
    const res = await bookWithPackCredit(client, { holdId: "h1", purchaseId: "p1", clientProfileId: "u1" });
    expect(res).toEqual({ ok: true, bookingId: "b-existing" });
  });
});

describe("the ordering", () => {
  it("spends the credit before converting the hold", async () => {
    const { client, order } = stubDb(world());
    await bookWithPackCredit(client, { holdId: "h1", purchaseId: "p1", clientProfileId: "u1" });
    const spend = order.indexOf("update:club_pack_purchases");
    const convert = order.indexOf("insert:bookings");
    expect(spend).toBeGreaterThan(-1);
    expect(convert).toBeGreaterThan(spend);
  });

  it("gives the credit back when the conversion fails", async () => {
    // The recoverable half. Converting first would leave a confirmed
    // booking nobody paid for.
    const rows = world();
    const { client } = stubDb(rows, { convertFails: true });
    const res = await bookWithPackCredit(client, { holdId: "h1", purchaseId: "p1", clientProfileId: "u1" });
    expect(res.ok).toBe(false);
    expect(rows.club_pack_purchases[0].classes_used).toBe(2);
  });

  it("documents why, so the order is not 'tidied' later", () => {
    expect(src(LIB)).toMatch(/spend then convert|Order is the whole design/i);
  });
});

describe("the booking records how it was paid", () => {
  it("charges zero, because the money moved at purchase", async () => {
    // A per-class figure here would double-count in revenue.
    expect(code(LIB)).toMatch(/priceCents: 0/);
  });

  it("links the booking to the pack, so cancelling can return the credit", async () => {
    const { client, order } = stubDb(world());
    await bookWithPackCredit(client, { holdId: "h1", purchaseId: "p1", clientProfileId: "u1" });
    expect(order.filter((o) => o === "update:bookings").length).toBeGreaterThan(0);
    expect(code(LIB)).toMatch(/pack_purchase_id: pack\.id/);
  });
});

describe("what the client is offered", () => {
  const PAGE = "app/(club)/club/checkout/[holdId]/page.tsx";

  it("shows the credit option above the price", () => {
    // Someone holding a paid-for class should not read past a charge to
    // find it.
    const t = code(PAGE);
    expect(t.indexOf("Use 1 class from my pack")).toBeLessThan(t.indexOf("Pay separately instead"));
  });

  it("only appears when credits exist for this service", () => {
    expect(code(PAGE)).toMatch(/creditsLeft > 0 && \(/);
    expect(code(PAGE)).toMatch(/usablePacks\(admin, \{/);
  });

  it("does not let the client choose which pack to spend", () => {
    // Server picks the oldest-expiring, so nobody loses credits by
    // directing the spend at a later pack.
    const t = code("app/(club)/club/actions.ts");
    const fn = t.slice(t.indexOf("export async function payWithPackAction"));
    expect(fn).not.toMatch(/formData\.get\("purchaseId"\)/);
    expect(fn).toMatch(/packs\[0\]\.id/);
  });
});

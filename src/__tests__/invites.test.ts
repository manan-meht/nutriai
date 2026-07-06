process.env.TISTRA_WHATSAPP_NUMBER = "919999999999";
process.env.INVITE_EXPIRY_DAYS = "14";

import { generateInviteToken } from "@/lib/invites/token";
import { parseJoinCommand } from "@/lib/invites/parse-command";
import { buildJoinCommandText, buildWhatsAppInviteLink } from "@/lib/invites/messages";
import {
  createInvite,
  getInviteByToken,
  validateInviteForClaim,
  markInviteClaimed,
  revokeInvite,
  regenerateInvite,
  findLatestInvite,
  getOrCreateInvite,
  maskWhatsAppNumber,
} from "@/lib/invites/service";

// Minimal fake mirroring the query shapes service.ts actually issues:
// select().eq()...maybeSingle()/single(), insert().select().single(),
// update().eq()...(.eq()). Filters accumulate across chained .eq() calls
// regardless of where .order()/.limit() sit in the chain (matching the
// real Supabase client's builder semantics closely enough for these tests).
function makeFakeDb() {
  const rows: any[] = [];
  let idCounter = 0;

  function applyFilters(data: any[], filters: Array<[string, any]>) {
    return data.filter((row) => filters.every(([col, val]) => row[col] === val));
  }

  function query() {
    const filters: Array<[string, any]> = [];
    let orderCol: string | null = null;
    let orderAsc = true;

    const builder: any = {
      eq(col: string, val: any) {
        filters.push([col, val]);
        return builder;
      },
      order(col: string, opts?: { ascending?: boolean }) {
        orderCol = col;
        orderAsc = opts?.ascending ?? true;
        return builder;
      },
      limit() {
        return builder;
      },
      async maybeSingle() {
        let matches = applyFilters(rows, filters);
        if (orderCol) {
          matches = [...matches].sort((a, b) => (a[orderCol!] < b[orderCol!] ? 1 : -1) * (orderAsc ? -1 : 1));
        }
        return { data: matches[0] ?? null, error: null };
      },
      async single() {
        const result = await builder.maybeSingle();
        return result.data ? result : { data: null, error: { message: "not found" } };
      },
    };
    return builder;
  }

  return {
    from(table: string) {
      if (table !== "whatsapp_invites") throw new Error(`unexpected table ${table}`);
      return {
        select: () => query(),
        insert: (row: any) => {
          const withId = {
            id: `invite-${++idCounter}`,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            claimed_by_whatsapp_number: null,
            claimed_at: null,
            metadata: {},
            ...row,
          };
          rows.push(withId);
          return {
            select: () => ({
              single: async () => ({ data: withId, error: null }),
            }),
          };
        },
        update: (patch: any) => {
          const filters: Array<[string, any]> = [];
          const updateBuilder: any = {
            eq(col: string, val: any) {
              filters.push([col, val]);
              return updateBuilder;
            },
            then(resolve: any) {
              const matches = applyFilters(rows, filters);
              matches.forEach((r) => Object.assign(r, patch));
              resolve({ error: null });
            },
          };
          return updateBuilder;
        },
      };
    },
    _rows: rows,
  };
}

describe("generateInviteToken", () => {
  it("generates a 6-character token from the safe alphabet", () => {
    const token = generateInviteToken();
    expect(token).toMatch(/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/);
  });

  it("generates different tokens across calls", () => {
    const tokens = new Set(Array.from({ length: 20 }, () => generateInviteToken()));
    expect(tokens.size).toBeGreaterThan(1);
  });
});

describe("parseJoinCommand", () => {
  it("parses the canonical form", () => {
    expect(parseJoinCommand("JOIN FAMILY 8F42K3")).toEqual({ type: "family", token: "8F42K3" });
  });

  it("is case-insensitive and whitespace-tolerant", () => {
    expect(parseJoinCommand("join   self   9d31p2")).toEqual({ type: "self", token: "9D31P2" });
    expect(parseJoinCommand("  Join Family  8f42k3  ")).toEqual({ type: "family", token: "8F42K3" });
  });

  it("tolerates newlines within the message", () => {
    expect(parseJoinCommand("JOIN\nFAMILY\n8F42K3")).toEqual({ type: "family", token: "8F42K3" });
  });

  it("supports the 'start' alias", () => {
    expect(parseJoinCommand("start family 8F42K3")).toEqual({ type: "family", token: "8F42K3" });
  });

  it("parses coach client with or without a space", () => {
    expect(parseJoinCommand("JOIN COACHCLIENT A7K2Q9")).toEqual({ type: "coach_client", token: "A7K2Q9" });
    expect(parseJoinCommand("JOIN COACH CLIENT A7K2Q9")).toEqual({ type: "coach_client", token: "A7K2Q9" });
  });

  it("returns null for unrelated text", () => {
    expect(parseJoinCommand("hi there")).toBeNull();
    expect(parseJoinCommand("JOIN FAMILY")).toBeNull();
    expect(parseJoinCommand("JOIN BLAH 8F42K3")).toBeNull();
  });
});

describe("messages", () => {
  it("builds the exact join command text", () => {
    expect(buildJoinCommandText("family", "8F42K3")).toBe("JOIN FAMILY 8F42K3");
    expect(buildJoinCommandText("coach_client", "A7K2Q9")).toBe("JOIN COACHCLIENT A7K2Q9");
  });

  it("builds a correctly URL-encoded wa.me link using the env var", () => {
    const link = buildWhatsAppInviteLink("family", "8F42K3");
    expect(link).toBe("https://wa.me/919999999999?text=JOIN%20FAMILY%208F42K3");
  });

  it("throws if TISTRA_WHATSAPP_NUMBER is not configured", () => {
    const original = process.env.TISTRA_WHATSAPP_NUMBER;
    delete process.env.TISTRA_WHATSAPP_NUMBER;
    expect(() => buildWhatsAppInviteLink("self", "ABCDEF")).toThrow();
    process.env.TISTRA_WHATSAPP_NUMBER = original;
  });
});

describe("maskWhatsAppNumber", () => {
  it("keeps only the last 4 digits visible", () => {
    expect(maskWhatsAppNumber("919876543210")).toBe("••••••••3210");
  });
  it("handles null", () => {
    expect(maskWhatsAppNumber(null)).toBeNull();
  });
});

describe("invite lifecycle", () => {
  it("creates a family invite and finds it by token", async () => {
    const db = makeFakeDb();
    const invite = await createInvite(db, {
      inviteType: "family",
      createdByUserId: "user-1",
      workspaceId: "ws-1",
      targetProfileId: "contact-1",
    });
    expect(invite.status).toBe("pending");
    expect(invite.token).toHaveLength(6);

    const found = await getInviteByToken(db, invite.token);
    expect(found?.id).toBe(invite.id);
  });

  it("creates a self invite with no target profile and displayName metadata", async () => {
    const db = makeFakeDb();
    const invite = await createInvite(db, {
      inviteType: "self",
      createdByUserId: "user-1",
      workspaceId: "ws-1",
      metadata: { displayName: "Priya" },
    });
    expect(invite.targetProfileId).toBeNull();
    expect(invite.metadata.displayName).toBe("Priya");
  });

  it("creates a coach_client invite", async () => {
    const db = makeFakeDb();
    const invite = await createInvite(db, {
      inviteType: "coach_client",
      createdByUserId: "coach-1",
      workspaceId: "ws-2",
      targetProfileId: "client-1",
    });
    expect(invite.inviteType).toBe("coach_client");
    expect(invite.targetProfileId).toBe("client-1");
  });

  it("accepts a valid pending invite", async () => {
    const db = makeFakeDb();
    const invite = await createInvite(db, { inviteType: "family", createdByUserId: "u1", workspaceId: "ws1", targetProfileId: "c1" });
    expect(validateInviteForClaim(invite)).toEqual({ ok: true });
  });

  it("rejects an invalid (nonexistent) token", () => {
    expect(validateInviteForClaim(null)).toEqual({ ok: false, reason: "invalid" });
  });

  it("rejects a revoked invite as invalid", async () => {
    const db = makeFakeDb();
    const invite = await createInvite(db, { inviteType: "family", createdByUserId: "u1", workspaceId: "ws1", targetProfileId: "c1" });
    await revokeInvite(db, invite.id);
    const refetched = await getInviteByToken(db, invite.token);
    expect(validateInviteForClaim(refetched)).toEqual({ ok: false, reason: "invalid" });
  });

  it("rejects an already-claimed invite", async () => {
    const db = makeFakeDb();
    const invite = await createInvite(db, { inviteType: "family", createdByUserId: "u1", workspaceId: "ws1", targetProfileId: "c1" });
    await markInviteClaimed(db, invite.id, { claimedByWhatsappNumber: "919876543210" });
    const refetched = await getInviteByToken(db, invite.token);
    expect(validateInviteForClaim(refetched)).toEqual({ ok: false, reason: "claimed" });
  });

  it("rejects an expired invite", async () => {
    const db = makeFakeDb();
    const invite = await createInvite(db, { inviteType: "self", createdByUserId: "u1", workspaceId: "ws1" });
    const row = db._rows.find((r: any) => r.id === invite.id);
    row.expires_at = new Date(Date.now() - 1000).toISOString();
    const refetched = await getInviteByToken(db, invite.token);
    expect(validateInviteForClaim(refetched)).toEqual({ ok: false, reason: "expired" });
  });

  it("marks an invite claimed and sets target_profile_id for the self flow", async () => {
    const db = makeFakeDb();
    const invite = await createInvite(db, { inviteType: "self", createdByUserId: "u1", workspaceId: "ws1" });
    await markInviteClaimed(db, invite.id, { claimedByWhatsappNumber: "919876543210", targetProfileId: "new-contact-1" });
    const refetched = await getInviteByToken(db, invite.token);
    expect(refetched?.status).toBe("claimed");
    expect(refetched?.targetProfileId).toBe("new-contact-1");
    expect(refetched?.claimedByWhatsappNumber).toBe("919876543210");
  });

  it("regenerates an invite: old one revoked, new one pending with a different token", async () => {
    const db = makeFakeDb();
    const original = await createInvite(db, { inviteType: "coach_client", createdByUserId: "coach-1", workspaceId: "ws1", targetProfileId: "client-1" });
    const fresh = await regenerateInvite(db, original);

    expect(fresh.token).not.toBe(original.token);
    expect(fresh.status).toBe("pending");

    const oldRefetched = await getInviteByToken(db, original.token);
    expect(oldRefetched?.status).toBe("revoked");
  });

  it("finds the latest invite for a target_profile_id", async () => {
    const db = makeFakeDb();
    await createInvite(db, { inviteType: "family", createdByUserId: "u1", workspaceId: "ws1", targetProfileId: "c1" });
    await new Promise((r) => setTimeout(r, 2));
    const second = await createInvite(db, { inviteType: "family", createdByUserId: "u1", workspaceId: "ws1", targetProfileId: "c1" });

    const found = await findLatestInvite(db, { workspaceId: "ws1", inviteType: "family", targetProfileId: "c1" });
    expect(found?.id).toBe(second.id);
  });

  it("finds the latest self invite by created_by_user_id (no target_profile_id yet)", async () => {
    const db = makeFakeDb();
    const invite = await createInvite(db, { inviteType: "self", createdByUserId: "u1", workspaceId: "ws1" });
    const found = await findLatestInvite(db, { workspaceId: "ws1", inviteType: "self", createdByUserId: "u1" });
    expect(found?.id).toBe(invite.id);
  });

  it("getOrCreateInvite reuses a pending invite instead of creating a new one", async () => {
    const db = makeFakeDb();
    const first = await getOrCreateInvite(
      db,
      { workspaceId: "ws1", inviteType: "family", targetProfileId: "c1" },
      { inviteType: "family", createdByUserId: "u1", workspaceId: "ws1", targetProfileId: "c1" }
    );
    const second = await getOrCreateInvite(
      db,
      { workspaceId: "ws1", inviteType: "family", targetProfileId: "c1" },
      { inviteType: "family", createdByUserId: "u1", workspaceId: "ws1", targetProfileId: "c1" }
    );
    expect(second.id).toBe(first.id);
  });

  it("getOrCreateInvite creates a fresh invite when the existing one is revoked", async () => {
    const db = makeFakeDb();
    const first = await getOrCreateInvite(
      db,
      { workspaceId: "ws1", inviteType: "family", targetProfileId: "c1" },
      { inviteType: "family", createdByUserId: "u1", workspaceId: "ws1", targetProfileId: "c1" }
    );
    await revokeInvite(db, first.id);
    const second = await getOrCreateInvite(
      db,
      { workspaceId: "ws1", inviteType: "family", targetProfileId: "c1" },
      { inviteType: "family", createdByUserId: "u1", workspaceId: "ws1", targetProfileId: "c1" }
    );
    expect(second.id).not.toBe(first.id);
    expect(second.status).toBe("pending");
  });
});

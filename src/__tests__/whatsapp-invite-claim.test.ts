// Integration coverage for handleIncomingMessage's "JOIN <TYPE> <TOKEN>"
// handling — the WhatsApp-first onboarding entry point (see
// src/lib/invites). Pure validation/parsing logic already has thorough
// coverage in invites.test.ts; this file checks the actual wiring inside
// conversation-handler.ts: does a claim update/create the right profile
// row and send the right reply.

process.env.TISTRA_WHATSAPP_NUMBER = "919999999999";
process.env.INVITE_EXPIRY_DAYS = "14";

const sendTextMessage = jest.fn().mockResolvedValue(undefined);
jest.mock("@/lib/whatsapp/client", () => ({
  sendTextMessage: (...args: unknown[]) => sendTextMessage(...args),
  normalizePhone: (p: string) => p.replace(/\D/g, ""),
}));

jest.mock("@/lib/entitlements/entitlements", () => ({
  getEntitlementSnapshot: jest.fn().mockResolvedValue({ isReadOnly: false }),
}));

interface FakeTables {
  whatsapp_invites: any[];
  adults_contacts: any[];
  gym_clients: any[];
  workspaces: any[];
}

function makeFakeSupabase(tables: FakeTables) {
  function query(rows: any[]) {
    const filters: Array<[string, any]> = [];
    let orderCol: string | null = null;
    const builder: any = {
      select: () => builder,
      eq(col: string, val: any) {
        filters.push([col, val]);
        return builder;
      },
      order(col: string) {
        orderCol = col;
        return builder;
      },
      limit: () => builder,
      async maybeSingle() {
        let matches = rows.filter((r) => filters.every(([c, v]) => r[c] === v));
        if (orderCol) matches = [...matches].sort((a, b) => (a[orderCol!] < b[orderCol!] ? 1 : -1));
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
    from(table: keyof FakeTables) {
      const rows = tables[table];
      return {
        select: (_cols?: string) => query(rows),
        order: () => ({ data: rows }), // gym_clients/adults_contacts unmatched-lookup path
        insert: (row: any) => {
          const withId = { id: `${table}-${rows.length + 1}`, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), metadata: {}, ...row };
          rows.push(withId);
          return { select: () => ({ single: async () => ({ data: withId, error: null }) }) };
        },
        update: (patch: any) => {
          const filters: Array<[string, any]> = [];
          const updateBuilder: any = {
            eq(col: string, val: any) {
              filters.push([col, val]);
              return updateBuilder;
            },
            then(resolve: any) {
              rows.filter((r) => filters.every(([c, v]) => r[c] === v)).forEach((r) => Object.assign(r, patch));
              resolve({ error: null });
            },
          };
          return updateBuilder;
        },
      };
    },
  };
}

function setupTables(overrides: Partial<FakeTables> = {}): FakeTables {
  return { whatsapp_invites: [], adults_contacts: [], gym_clients: [], workspaces: [], ...overrides };
}

async function withFakeDb(tables: FakeTables, run: () => Promise<void>) {
  jest.resetModules();
  jest.doMock("@supabase/supabase-js", () => ({
    createClient: () => makeFakeSupabase(tables),
  }));
  sendTextMessage.mockClear();
  const { handleIncomingMessage } = await import("@/lib/whatsapp/conversation-handler");
  await run();
  return handleIncomingMessage;
}

describe("handleIncomingMessage — JOIN command claiming", () => {
  it("claims a family invite: updates the contact's number and sends the family welcome", async () => {
    const tables = setupTables({
      adults_contacts: [{ id: "contact-1", workspace_id: "ws-1", caregiver_id: "user-1", whatsapp_number: null }],
      whatsapp_invites: [
        {
          id: "invite-1", token: "8F42K3", invite_type: "family", created_by_user_id: "user-1",
          workspace_id: "ws-1", target_profile_id: "contact-1", status: "pending",
          expires_at: new Date(Date.now() + 86400000).toISOString(), metadata: {},
        },
      ],
    });

    let handleIncomingMessage!: (msg: any) => Promise<void>;
    await withFakeDb(tables, async () => {
      handleIncomingMessage = (await import("@/lib/whatsapp/conversation-handler")).handleIncomingMessage;
    });
    await handleIncomingMessage({ from: "911234567890", type: "text", text: "JOIN FAMILY 8F42K3" });

    expect(tables.adults_contacts[0].whatsapp_number).toBe("911234567890");
    // Drives the dashboard's "Accepted" badge (AdultsDashboardClient.tsx) —
    // without this, contacts onboarded via the WhatsApp-first flow stayed
    // stuck showing "pending" forever.
    expect(tables.adults_contacts[0].invite_accepted_at).toBeTruthy();
    expect(tables.whatsapp_invites[0].status).toBe("claimed");
    expect(sendTextMessage).toHaveBeenCalledWith("911234567890", expect.stringContaining("You're now connected"));
  });

  it("claims a self invite: creates a new adults_contacts profile and sets the workspace to the self plan", async () => {
    const tables = setupTables({
      workspaces: [{ id: "ws-2", plan: "family" }],
      whatsapp_invites: [
        {
          id: "invite-2", token: "9D31P2", invite_type: "self", created_by_user_id: "user-2",
          workspace_id: "ws-2", target_profile_id: null, status: "pending",
          expires_at: new Date(Date.now() + 86400000).toISOString(), metadata: { displayName: "Priya" },
        },
      ],
    });

    let handleIncomingMessage!: (msg: any) => Promise<void>;
    await withFakeDb(tables, async () => {
      handleIncomingMessage = (await import("@/lib/whatsapp/conversation-handler")).handleIncomingMessage;
    });
    await handleIncomingMessage({ from: "919876543210", type: "text", text: "JOIN SELF 9D31P2" });

    expect(tables.workspaces[0].plan).toBe("self");
    expect(tables.adults_contacts).toHaveLength(1);
    expect(tables.adults_contacts[0]).toMatchObject({ whatsapp_number: "919876543210", full_name: "Priya", relationship_type: "self" });
    expect(tables.whatsapp_invites[0].status).toBe("claimed");
    expect(tables.whatsapp_invites[0].target_profile_id).toBe(tables.adults_contacts[0].id);
    expect(sendTextMessage).toHaveBeenCalledWith("919876543210", expect.stringContaining("self tracking"));
  });

  it("claims a coach_client invite: updates the gym client's number and sends the coach welcome", async () => {
    const tables = setupTables({
      gym_clients: [{ id: "client-1", workspace_id: "ws-3", trainer_id: "coach-1", whatsapp_number: null }],
      whatsapp_invites: [
        {
          id: "invite-3", token: "A7K2Q9", invite_type: "coach_client", created_by_user_id: "coach-1",
          workspace_id: "ws-3", target_profile_id: "client-1", status: "pending",
          expires_at: new Date(Date.now() + 86400000).toISOString(), metadata: {},
        },
      ],
    });

    let handleIncomingMessage!: (msg: any) => Promise<void>;
    await withFakeDb(tables, async () => {
      handleIncomingMessage = (await import("@/lib/whatsapp/conversation-handler")).handleIncomingMessage;
    });
    await handleIncomingMessage({ from: "6597268559", type: "text", text: "JOIN COACHCLIENT A7K2Q9" });

    expect(tables.gym_clients[0].whatsapp_number).toBe("6597268559");
    expect(tables.whatsapp_invites[0].status).toBe("claimed");
    expect(sendTextMessage).toHaveBeenCalledWith("6597268559", expect.stringContaining("connected with your coach"));
  });

  it("replies with the invalid-invite message for an unknown token, without touching any profile", async () => {
    const tables = setupTables();
    let handleIncomingMessage!: (msg: any) => Promise<void>;
    await withFakeDb(tables, async () => {
      handleIncomingMessage = (await import("@/lib/whatsapp/conversation-handler")).handleIncomingMessage;
    });
    await handleIncomingMessage({ from: "911111111111", type: "text", text: "JOIN FAMILY ZZZZZZ" });

    expect(sendTextMessage).toHaveBeenCalledWith("911111111111", expect.stringContaining("invalid or expired"));
    expect(tables.adults_contacts).toHaveLength(0);
  });

  it("replies with the already-claimed message and does not re-link a claimed invite", async () => {
    const tables = setupTables({
      adults_contacts: [{ id: "contact-9", workspace_id: "ws-9", caregiver_id: "user-9", whatsapp_number: "911111111111" }],
      whatsapp_invites: [
        {
          id: "invite-9", token: "CLAIM1", invite_type: "family", created_by_user_id: "user-9",
          workspace_id: "ws-9", target_profile_id: "contact-9", status: "claimed",
          claimed_by_whatsapp_number: "911111111111", expires_at: new Date(Date.now() + 86400000).toISOString(), metadata: {},
        },
      ],
    });

    let handleIncomingMessage!: (msg: any) => Promise<void>;
    await withFakeDb(tables, async () => {
      handleIncomingMessage = (await import("@/lib/whatsapp/conversation-handler")).handleIncomingMessage;
    });
    await handleIncomingMessage({ from: "922222222222", type: "text", text: "JOIN FAMILY CLAIM1" });

    expect(sendTextMessage).toHaveBeenCalledWith("922222222222", expect.stringContaining("already been used"));
    expect(tables.adults_contacts[0].whatsapp_number).toBe("911111111111");
  });

  it("replies with the expired-invite message for a past-expiry pending invite", async () => {
    const tables = setupTables({
      adults_contacts: [{ id: "contact-8", workspace_id: "ws-8", caregiver_id: "user-8", whatsapp_number: null }],
      whatsapp_invites: [
        {
          id: "invite-8", token: "OLDONE", invite_type: "family", created_by_user_id: "user-8",
          workspace_id: "ws-8", target_profile_id: "contact-8", status: "pending",
          expires_at: new Date(Date.now() - 86400000).toISOString(), metadata: {},
        },
      ],
    });

    let handleIncomingMessage!: (msg: any) => Promise<void>;
    await withFakeDb(tables, async () => {
      handleIncomingMessage = (await import("@/lib/whatsapp/conversation-handler")).handleIncomingMessage;
    });
    await handleIncomingMessage({ from: "933333333333", type: "text", text: "JOIN FAMILY OLDONE" });

    expect(sendTextMessage).toHaveBeenCalledWith("933333333333", expect.stringContaining("expired"));
    expect(tables.adults_contacts[0].whatsapp_number).toBeNull();
  });
});

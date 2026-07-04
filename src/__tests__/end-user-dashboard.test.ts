// Coverage for the End User Dashboard's OTP + session backend: OTP
// issue/verify (correct, incorrect, expired, already-used, rate-limited),
// claiming an existing contact by WhatsApp number with no duplicates,
// session mint/verify/expiry, and pause/removal writes. All against
// in-memory fakes mirroring the real end_user_* tables from migration 0007.

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
process.env.END_USER_OTP_PEPPER = "test-pepper";
process.env.WHATSAPP_OTP_TEMPLATE_NAME = "otp_template";

const sendTemplateMessage = jest.fn().mockResolvedValue(undefined);
jest.mock("@/lib/whatsapp/client", () => ({
  sendTemplateMessage: (...args: unknown[]) => sendTemplateMessage(...args),
  normalizePhone: (p: string) => p.replace(/\D/g, ""),
}));

interface FakeDb {
  otpCodes: any[];
  sessions: any[];
  accessSettings: any[];
  adultsContacts: any[];
  gymClients: any[];
}

function makeFakeSupabase(db: FakeDb) {
  function tableFor(name: string, rows: any[]) {
    return {
      select: () => makeQuery(rows),
      insert: (row: any) => {
        const withId = { id: `${name}-${rows.length + 1}`, created_at: new Date().toISOString(), attempt_count: 0, ...row };
        rows.push(withId);
        return {
          ...makeQuery([withId]),
          select: () => makeQuery([withId]),
        };
      },
      update: (patch: any) => ({
        eq: (col: string, val: any) => {
          const matches = rows.filter((r) => r[col] === val);
          matches.forEach((r) => Object.assign(r, patch));
          return Promise.resolve({ data: matches, error: null });
        },
      }),
      upsert: (row: any) => {
        const idx = rows.findIndex((r) => r.contact_id === row.contact_id);
        if (idx >= 0) rows[idx] = { ...rows[idx], ...row };
        else rows.push({ ...row });
        return Promise.resolve({ data: row, error: null });
      },
      delete: () => ({
        eq: (col: string, val: any) => {
          const idx = rows.findIndex((r) => r[col] === val);
          if (idx >= 0) rows.splice(idx, 1);
          return Promise.resolve({ error: null });
        },
      }),
    };
  }

  function makeQuery(initialRows: any[]) {
    let rows = initialRows;
    const chain: any = {
      eq: (col: string, val: any) => {
        rows = rows.filter((r) => r[col] === val);
        return chain;
      },
      is: (col: string, val: any) => {
        rows = rows.filter((r) => (val === null ? r[col] == null : r[col] === val));
        return chain;
      },
      gte: () => chain,
      order: () => chain,
      limit: (n: number) => {
        rows = rows.slice(0, n);
        return chain;
      },
      single: async () => ({ data: rows[0] ?? null, error: rows[0] ? null : { message: "not found" } }),
      maybeSingle: async () => ({ data: rows[0] ?? null }),
      then: (resolve: any) => resolve({ data: rows }),
    };
    return chain;
  }

  return {
    from: (table: string) => {
      if (table === "end_user_otp_codes") return tableFor(table, db.otpCodes);
      if (table === "end_user_sessions") return tableFor(table, db.sessions);
      if (table === "end_user_access_settings") return tableFor(table, db.accessSettings);
      if (table === "adults_contacts") return tableFor(table, db.adultsContacts);
      if (table === "gym_clients") return tableFor(table, db.gymClients);
      throw new Error(`unexpected table ${table}`);
    },
  };
}

function freshDb(): FakeDb {
  return {
    otpCodes: [],
    sessions: [],
    accessSettings: [],
    adultsContacts: [
      { id: "contact-1", full_name: "Sonam Bhutia", whatsapp_number: "911234567890", deleted_at: null, caregiver_id: "caregiver-1" },
    ],
    gymClients: [],
  };
}

describe("findContactByWhatsappNumber", () => {
  afterEach(() => jest.resetModules());

  it("matches an existing adults_contacts row by normalized number, with no duplicates created", async () => {
    jest.resetModules();
    const db = freshDb();
    jest.doMock("@supabase/supabase-js", () => ({ createClient: () => makeFakeSupabase(db) }));
    const { findContactByWhatsappNumber } = await import("@/lib/end-user/otp");

    const found = await findContactByWhatsappNumber("+91 123 456 7890");
    expect(found).toEqual({ contactId: "contact-1", contactType: "adults", whatsappNumber: "911234567890", fullName: "Sonam Bhutia" });
    expect(db.adultsContacts.length).toBe(1);
  });

  it("returns null for an unrecognized number", async () => {
    jest.resetModules();
    const db = freshDb();
    jest.doMock("@supabase/supabase-js", () => ({ createClient: () => makeFakeSupabase(db) }));
    const { findContactByWhatsappNumber } = await import("@/lib/end-user/otp");

    const found = await findContactByWhatsappNumber("+1 555 000 0000");
    expect(found).toBeNull();
  });
});

describe("issueOtp / verifyOtp", () => {
  afterEach(() => jest.resetModules());

  const contact = { contactId: "contact-1", contactType: "adults" as const, whatsappNumber: "911234567890", fullName: "Sonam" };

  it("verifies a correctly-entered code", async () => {
    jest.resetModules();
    sendTemplateMessage.mockClear();
    const db = freshDb();
    jest.doMock("@supabase/supabase-js", () => ({ createClient: () => makeFakeSupabase(db) }));
    const { issueOtp, verifyOtp } = await import("@/lib/end-user/otp");

    await issueOtp(contact);
    expect(sendTemplateMessage).toHaveBeenCalledTimes(1);
    const [, templateName, , params] = sendTemplateMessage.mock.calls[0];
    expect(templateName).toBe("otp_template");
    const code = params[0];

    const result = await verifyOtp(contact, code);
    expect(result).toEqual({ ok: true });
  });

  it("rejects an incorrect code without consuming the real one", async () => {
    jest.resetModules();
    const db = freshDb();
    jest.doMock("@supabase/supabase-js", () => ({ createClient: () => makeFakeSupabase(db) }));
    const { issueOtp, verifyOtp } = await import("@/lib/end-user/otp");

    await issueOtp(contact);
    const wrong = await verifyOtp(contact, "000000");
    expect(wrong).toEqual({ ok: false, reason: "incorrect_code" });

    const [, , , params] = sendTemplateMessage.mock.calls.at(-1)!;
    const correct = await verifyOtp(contact, params[0]);
    expect(correct).toEqual({ ok: true });
  });

  it("rejects reuse of an already-consumed code", async () => {
    jest.resetModules();
    const db = freshDb();
    jest.doMock("@supabase/supabase-js", () => ({ createClient: () => makeFakeSupabase(db) }));
    const { issueOtp, verifyOtp } = await import("@/lib/end-user/otp");

    await issueOtp(contact);
    const [, , , params] = sendTemplateMessage.mock.calls.at(-1)!;
    await verifyOtp(contact, params[0]);
    const second = await verifyOtp(contact, params[0]);
    expect(second).toEqual({ ok: false, reason: "already_used" });
  });

  it("rejects an expired code", async () => {
    jest.resetModules();
    const db = freshDb();
    jest.doMock("@supabase/supabase-js", () => ({ createClient: () => makeFakeSupabase(db) }));
    const { issueOtp, verifyOtp } = await import("@/lib/end-user/otp");

    await issueOtp(contact);
    db.otpCodes[0].expires_at = new Date(Date.now() - 1000).toISOString();
    const [, , , params] = sendTemplateMessage.mock.calls.at(-1)!;
    const result = await verifyOtp(contact, params[0]);
    expect(result).toEqual({ ok: false, reason: "expired" });
  });

  it("locks out after too many incorrect attempts", async () => {
    jest.resetModules();
    const db = freshDb();
    jest.doMock("@supabase/supabase-js", () => ({ createClient: () => makeFakeSupabase(db) }));
    const { issueOtp, verifyOtp } = await import("@/lib/end-user/otp");

    await issueOtp(contact);
    for (let i = 0; i < 5; i++) {
      await verifyOtp(contact, "000000");
    }
    const [, , , params] = sendTemplateMessage.mock.calls.at(-1)!;
    const result = await verifyOtp(contact, params[0]);
    expect(result).toEqual({ ok: false, reason: "too_many_attempts" });
  });
});

describe("end-user session", () => {
  afterEach(() => jest.resetModules());

  const contact = { contactId: "contact-1", contactType: "adults" as const, whatsappNumber: "911234567890", fullName: "Sonam" };

  function makeCookieStore() {
    const store = new Map<string, string>();
    return {
      set: (name: string, value: string) => store.set(name, value),
      get: (name: string) => (store.has(name) ? { value: store.get(name) } : undefined),
      delete: (name: string) => store.delete(name),
    };
  }

  it("mints a session and getEndUserSession returns it for a valid cookie", async () => {
    jest.resetModules();
    const db = freshDb();
    const cookieStore = makeCookieStore();
    jest.doMock("@supabase/supabase-js", () => ({ createClient: () => makeFakeSupabase(db) }));
    jest.doMock("next/headers", () => ({ cookies: async () => cookieStore }));
    const { createEndUserSession, getEndUserSession } = await import("@/lib/end-user/session");

    await createEndUserSession(contact);
    const session = await getEndUserSession();
    expect(session).toEqual({ contactId: "contact-1", contactType: "adults" });
  });

  it("returns null when no session cookie is present (unauthorized access blocked)", async () => {
    jest.resetModules();
    const db = freshDb();
    const cookieStore = makeCookieStore();
    jest.doMock("@supabase/supabase-js", () => ({ createClient: () => makeFakeSupabase(db) }));
    jest.doMock("next/headers", () => ({ cookies: async () => cookieStore }));
    const { getEndUserSession } = await import("@/lib/end-user/session");

    expect(await getEndUserSession()).toBeNull();
  });

  it("returns null for an expired session, requiring re-verification", async () => {
    jest.resetModules();
    const db = freshDb();
    const cookieStore = makeCookieStore();
    jest.doMock("@supabase/supabase-js", () => ({ createClient: () => makeFakeSupabase(db) }));
    jest.doMock("next/headers", () => ({ cookies: async () => cookieStore }));
    const { createEndUserSession, getEndUserSession } = await import("@/lib/end-user/session");

    await createEndUserSession(contact);
    db.sessions[0].expires_at = new Date(Date.now() - 1000).toISOString();
    expect(await getEndUserSession()).toBeNull();
  });
});

describe("pause sharing / request removal", () => {
  afterEach(() => jest.resetModules());

  it("pausing writes paused_at, and resuming clears it, without touching the caregiver's record", async () => {
    jest.resetModules();
    const db = freshDb();
    jest.doMock("@supabase/supabase-js", () => ({ createClient: () => makeFakeSupabase(db) }));
    const { setSharingPaused, requestRemoval } = await import("@/lib/end-user/dashboard-service");

    await setSharingPaused("contact-1", "adults", true);
    expect(db.accessSettings[0].paused_at).toBeTruthy();
    expect(db.adultsContacts[0]).toEqual(
      expect.objectContaining({ id: "contact-1", full_name: "Sonam Bhutia" })
    );

    await setSharingPaused("contact-1", "adults", false);
    expect(db.accessSettings[0].paused_at).toBeNull();

    await requestRemoval("contact-1", "adults");
    expect(db.accessSettings[0].removal_requested_at).toBeTruthy();
  });
});

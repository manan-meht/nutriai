// Coverage for the End User Dashboard's OTP + session backend: OTP
// issue/verify (correct, incorrect, expired, already-used, rate-limited),
// claiming an existing contact by WhatsApp number with no duplicates,
// session mint/verify/expiry, and pause/removal writes. All against
// in-memory fakes mirroring the real end_user_* tables from migration 0007.

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
process.env.END_USER_OTP_PEPPER = "test-pepper";
process.env.MSG91_AUTH_KEY = "test-msg91-auth-key";
process.env.MSG91_OTP_TEMPLATE_ID = "test-msg91-template-id";
process.env.MSG91_SENDER_ID = "TSTRA";
process.env.TWILIO_ACCOUNT_SID = "test-twilio-sid";
process.env.TWILIO_AUTH_TOKEN = "test-twilio-token";
process.env.TWILIO_FROM_NUMBER_OR_MESSAGING_SERVICE_SID = "+15551234567";

// OTP sending now goes through @nutriai/end-user-core's sendOtpSms, which
// calls fetch directly (see packages/end-user-core/src/sms.ts) rather than
// this app's src/lib/whatsapp/client.ts — mock fetch instead of that
// module. The test contact below is an Indian (+91) number, so this always
// routes to the MSG91 branch (JSON body), not Twilio (URL-encoded body).
const sendTemplateMessage = jest.fn(() => Promise.resolve());
function extractOtpSend(call: [string, RequestInit]) {
  const body = JSON.parse(call[1].body as string);
  const templateName = body.template_id;
  const code = body.recipients?.[0]?.OTP;
  return { templateName, code };
}
global.fetch = jest.fn(async (...args: any[]) => {
  sendTemplateMessage(...args);
  return { ok: true, text: async () => "" } as any;
}) as any;

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
        match: (conditions: Record<string, any>) => {
          const idx = rows.findIndex((r) => Object.entries(conditions).every(([k, v]) => r[k] === v));
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
    const { templateName, code } = extractOtpSend(sendTemplateMessage.mock.calls[0] as any);
    expect(templateName).toBe("test-msg91-template-id");

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

    const { code } = extractOtpSend(sendTemplateMessage.mock.calls.at(-1) as any);
    const correct = await verifyOtp(contact, code);
    expect(correct).toEqual({ ok: true });
  });

  it("rejects reuse of an already-consumed code", async () => {
    jest.resetModules();
    const db = freshDb();
    jest.doMock("@supabase/supabase-js", () => ({ createClient: () => makeFakeSupabase(db) }));
    const { issueOtp, verifyOtp } = await import("@/lib/end-user/otp");

    await issueOtp(contact);
    const { code } = extractOtpSend(sendTemplateMessage.mock.calls.at(-1) as any);
    await verifyOtp(contact, code);
    const second = await verifyOtp(contact, code);
    expect(second).toEqual({ ok: false, reason: "already_used" });
  });

  it("rejects an expired code", async () => {
    jest.resetModules();
    const db = freshDb();
    jest.doMock("@supabase/supabase-js", () => ({ createClient: () => makeFakeSupabase(db) }));
    const { issueOtp, verifyOtp } = await import("@/lib/end-user/otp");

    await issueOtp(contact);
    db.otpCodes[0].expires_at = new Date(Date.now() - 1000).toISOString();
    const { code } = extractOtpSend(sendTemplateMessage.mock.calls.at(-1) as any);
    const result = await verifyOtp(contact, code);
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
    const { code } = extractOtpSend(sendTemplateMessage.mock.calls.at(-1) as any);
    const result = await verifyOtp(contact, code);
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

  it("uses a 90-day session by default (parent-access spec), configurable via PARENT_TRUSTED_SESSION_DAYS", async () => {
    jest.resetModules();
    delete process.env.PARENT_TRUSTED_SESSION_DAYS;
    const db = freshDb();
    const cookieStore = makeCookieStore();
    jest.doMock("@supabase/supabase-js", () => ({ createClient: () => makeFakeSupabase(db) }));
    jest.doMock("next/headers", () => ({ cookies: async () => cookieStore }));
    const { createEndUserSession } = await import("@/lib/end-user/session");

    await createEndUserSession(contact);
    const expiresAt = new Date(db.sessions[0].expires_at).getTime();
    const daysFromNow = (expiresAt - Date.now()) / (24 * 60 * 60 * 1000);
    expect(daysFromNow).toBeGreaterThan(89);
    expect(daysFromNow).toBeLessThan(91);
  });
});

describe("trusted devices", () => {
  afterEach(() => {
    jest.resetModules();
    delete process.env.PARENT_TRUSTED_SESSION_DAYS;
  });

  const contact = { contactId: "contact-1", contactType: "adults" as const, whatsappNumber: "911234567890", fullName: "Sonam" };

  function makeCookieStore(initial?: string) {
    const store = new Map<string, string>(initial ? [["tistra_end_user_session", initial]] : []);
    return {
      set: (name: string, value: string) => store.set(name, value),
      get: (name: string) => (store.has(name) ? { value: store.get(name) } : undefined),
      delete: (name: string) => store.delete(name),
    };
  }

  it("lists every session for the contact, marking the current one", async () => {
    jest.resetModules();
    const db = freshDb();
    const cookieStore = makeCookieStore();
    jest.doMock("@supabase/supabase-js", () => ({ createClient: () => makeFakeSupabase(db) }));
    jest.doMock("next/headers", () => ({ cookies: async () => cookieStore }));
    const { createEndUserSession, listTrustedDevices } = await import("@/lib/end-user/session");

    await createEndUserSession(contact, "iPhone");
    db.sessions.push({
      id: "sessions-other",
      contact_id: "contact-1",
      contact_type: "adults",
      session_token_hash: "some-other-hash",
      device_label: "Old Android",
      created_at: new Date().toISOString(),
      last_seen_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
    });

    const devices = await listTrustedDevices("contact-1");
    expect(devices).toHaveLength(2);
    expect(devices.find((d) => d.deviceLabel === "iPhone")?.isCurrent).toBe(true);
    expect(devices.find((d) => d.deviceLabel === "Old Android")?.isCurrent).toBe(false);
  });

  it("signOutAllDevices removes every session for the contact and clears the current cookie", async () => {
    jest.resetModules();
    const db = freshDb();
    const cookieStore = makeCookieStore();
    jest.doMock("@supabase/supabase-js", () => ({ createClient: () => makeFakeSupabase(db) }));
    jest.doMock("next/headers", () => ({ cookies: async () => cookieStore }));
    const { createEndUserSession, signOutAllDevices, getEndUserSession } = await import("@/lib/end-user/session");

    await createEndUserSession(contact);
    expect(db.sessions).toHaveLength(1);

    await signOutAllDevices("contact-1");
    expect(db.sessions).toHaveLength(0);
    expect(await getEndUserSession()).toBeNull();
  });

  it("signOutDevice only removes the targeted session, scoped to the contact", async () => {
    jest.resetModules();
    const db = freshDb();
    const cookieStore = makeCookieStore();
    jest.doMock("@supabase/supabase-js", () => ({ createClient: () => makeFakeSupabase(db) }));
    jest.doMock("next/headers", () => ({ cookies: async () => cookieStore }));
    const { createEndUserSession, signOutDevice, listTrustedDevices } = await import("@/lib/end-user/session");

    await createEndUserSession(contact, "iPhone");
    db.sessions.push({
      id: "sessions-other",
      contact_id: "contact-1",
      contact_type: "adults",
      session_token_hash: "some-other-hash",
      device_label: "Old Android",
      created_at: new Date().toISOString(),
      last_seen_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
    });

    await signOutDevice("contact-1", "sessions-other");
    const devices = await listTrustedDevices("contact-1");
    expect(devices).toHaveLength(1);
    expect(devices[0].deviceLabel).toBe("iPhone");
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

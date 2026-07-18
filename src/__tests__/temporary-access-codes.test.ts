// Coverage for Temporary Access Codes (see packages/end-user-core/src/otp.ts's
// generateAccessCode/revokeActiveAccessCodes and the extended verifyOtp) —
// the Beta-safe participant-login fallback that doesn't depend on
// WhatsApp/SMS OTP delivery. Uses the same in-memory fake-Supabase pattern
// as end-user-dashboard.test.ts, extended with end_user_audit_events and a
// profiles table for getInviter.

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
process.env.END_USER_OTP_PEPPER = "test-pepper";

interface FakeDb {
  otpCodes: any[];
  sessions: any[];
  accessSettings: any[];
  auditEvents: any[];
  adultsContacts: any[];
  gymClients: any[];
  profiles: any[];
}

function makeFakeSupabase(db: FakeDb) {
  function tableFor(name: string, rows: any[]) {
    return {
      select: () => makeQuery(rows),
      insert: (row: any) => {
        const withId = { id: `${name}-${rows.length + 1}`, created_at: new Date().toISOString(), __seq: rows.length, attempt_count: 0, ...row };
        rows.push(withId);
        return { ...makeQuery([withId]), select: () => makeQuery([withId]) };
      },
      update: (patch: any) => {
        let matches = rows;
        const builder: any = {
          eq: (col: string, val: any) => {
            matches = matches.filter((r) => r[col] === val);
            return builder;
          },
          is: (col: string, val: any) => {
            matches = matches.filter((r) => (val === null ? r[col] == null : r[col] === val));
            return builder;
          },
          gt: (col: string, val: any) => {
            matches = matches.filter((r) => r[col] > val);
            return builder;
          },
          then: (resolve: any) => {
            matches.forEach((r) => Object.assign(r, patch));
            return resolve({ data: matches, error: null });
          },
        };
        return builder;
      },
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
      order: (_col: string, opts?: { ascending?: boolean }) => {
        rows = [...rows].sort((a, b) => (opts?.ascending === false ? b.__seq - a.__seq : a.__seq - b.__seq));
        return chain;
      },
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
      if (table === "end_user_audit_events") return tableFor(table, db.auditEvents);
      if (table === "adults_contacts") return tableFor(table, db.adultsContacts);
      if (table === "gym_clients") return tableFor(table, db.gymClients);
      if (table === "profiles") return tableFor(table, db.profiles);
      throw new Error(`unexpected table ${table}`);
    },
  };
}

function freshDb(): FakeDb {
  return {
    otpCodes: [],
    sessions: [],
    accessSettings: [],
    auditEvents: [],
    adultsContacts: [
      { id: "contact-1", full_name: "Sonam Bhutia", whatsapp_number: "911234567890", deleted_at: null, caregiver_id: "owner-1" },
      { id: "contact-2", full_name: "Tashi Bhutia", whatsapp_number: "919999999999", deleted_at: null, caregiver_id: "owner-1" },
    ],
    gymClients: [
      { id: "client-1", full_name: "Arjun Sharma", whatsapp_number: "917777777777", deleted_at: null, trainer_id: "coach-1" },
    ],
    profiles: [
      { id: "owner-1", full_name: "Manan Mehta" },
      { id: "coach-1", full_name: "Coach Priya" },
    ],
  };
}

const familyContact = { contactId: "contact-1", contactType: "adults" as const, whatsappNumber: "911234567890", fullName: "Sonam Bhutia" };
const otherFamilyContact = { contactId: "contact-2", contactType: "adults" as const, whatsappNumber: "919999999999", fullName: "Tashi Bhutia" };
const gymContact = { contactId: "client-1", contactType: "gym" as const, whatsappNumber: "917777777777", fullName: "Arjun Sharma" };

async function loadOtpModule(db: FakeDb) {
  jest.resetModules();
  jest.doMock("@supabase/supabase-js", () => ({ createClient: () => makeFakeSupabase(db) }));
  return import("@/lib/end-user/otp");
}

describe("Temporary Access Codes — generation", () => {
  afterEach(() => jest.resetModules());

  it("1. family owner can generate a code for a family member", async () => {
    const db = freshDb();
    const { generateAccessCode } = await loadOtpModule(db);
    const { code } = await generateAccessCode(familyContact, "owner-1", "family_owner");
    expect(code).toMatch(/^\d{6}$/);
    expect(db.otpCodes).toHaveLength(1);
    expect(db.otpCodes[0].generated_by_user_id).toBe("owner-1");
    expect(db.otpCodes[0].generated_by_role).toBe("family_owner");
  });

  it("2. coach can generate a code for a client", async () => {
    const db = freshDb();
    const { generateAccessCode } = await loadOtpModule(db);
    const { code } = await generateAccessCode(gymContact, "coach-1", "coach");
    expect(code).toMatch(/^\d{6}$/);
    expect(db.otpCodes[0].generated_by_role).toBe("coach");
  });

  it("10. plaintext code is never stored — only its hash", async () => {
    const db = freshDb();
    const { generateAccessCode } = await loadOtpModule(db);
    const { code } = await generateAccessCode(familyContact, "owner-1", "family_owner");
    expect(db.otpCodes[0].code_hash).not.toBe(code);
    expect(JSON.stringify(db.otpCodes[0])).not.toContain(code);
  });

  it("15. code_generated is recorded as an audit event", async () => {
    const db = freshDb();
    const { generateAccessCode } = await loadOtpModule(db);
    await generateAccessCode(familyContact, "owner-1", "family_owner");
    expect(db.auditEvents.some((e) => e.event === "code_generated" && e.contact_id === "contact-1")).toBe(true);
  });
});

describe("Temporary Access Codes — verification", () => {
  afterEach(() => jest.resetModules());

  it("3. code is tied to the intended profile — doesn't verify against a different contact's number", async () => {
    const db = freshDb();
    const { generateAccessCode, verifyOtp } = await loadOtpModule(db);
    const { code } = await generateAccessCode(familyContact, "owner-1", "family_owner");

    const result = await verifyOtp(otherFamilyContact, code);
    expect(result.ok).toBe(false);
  });

  it("verifies a correctly-entered access code", async () => {
    const db = freshDb();
    const { generateAccessCode, verifyOtp } = await loadOtpModule(db);
    const { code } = await generateAccessCode(familyContact, "owner-1", "family_owner");

    const result = await verifyOtp(familyContact, code);
    expect(result).toEqual({ ok: true });
  });

  it("4. code cannot be reused (one-time use only)", async () => {
    const db = freshDb();
    const { generateAccessCode, verifyOtp } = await loadOtpModule(db);
    const { code } = await generateAccessCode(familyContact, "owner-1", "family_owner");

    await verifyOtp(familyContact, code);
    const second = await verifyOtp(familyContact, code);
    expect(second).toEqual({ ok: false, reason: "already_used" });
  });

  it("5. expired code cannot be used", async () => {
    const db = freshDb();
    const { generateAccessCode, verifyOtp } = await loadOtpModule(db);
    await generateAccessCode(familyContact, "owner-1", "family_owner", 10);
    db.otpCodes[0].expires_at = new Date(Date.now() - 1000).toISOString();

    const result = await verifyOtp(familyContact, "000000");
    expect(result).toEqual({ ok: false, reason: "expired" });
  });

  it("6. revoked code cannot be used", async () => {
    const db = freshDb();
    const { generateAccessCode, revokeAccessCode, verifyOtp } = await loadOtpModule(db);
    const { code } = await generateAccessCode(familyContact, "owner-1", "family_owner");
    await revokeAccessCode(familyContact, "owner-1");

    const result = await verifyOtp(familyContact, code);
    expect(result).toEqual({ ok: false, reason: "revoked" });
    expect(db.auditEvents.some((e) => e.event === "code_revoked")).toBe(true);
  });

  it("7. regenerating invalidates the previous active code", async () => {
    const db = freshDb();
    const { generateAccessCode, regenerateAccessCode, verifyOtp } = await loadOtpModule(db);
    const first = await generateAccessCode(familyContact, "owner-1", "family_owner");
    const second = await regenerateAccessCode(familyContact, "owner-1", "family_owner");
    expect(second.code).not.toBe(first.code);

    const oldResult = await verifyOtp(familyContact, first.code);
    expect(oldResult.ok).toBe(false);

    const newResult = await verifyOtp(familyContact, second.code);
    expect(newResult).toEqual({ ok: true });
    expect(db.auditEvents.some((e) => e.event === "code_regenerated")).toBe(true);
  });

  it("8. an incorrect code increments the failed attempt count", async () => {
    const db = freshDb();
    const { generateAccessCode, verifyOtp } = await loadOtpModule(db);
    await generateAccessCode(familyContact, "owner-1", "family_owner");

    await verifyOtp(familyContact, "000000");
    await verifyOtp(familyContact, "111111");
    expect(db.otpCodes[0].attempt_count).toBe(2);
    expect(db.auditEvents.filter((e) => e.event === "code_verification_failed")).toHaveLength(2);
  });

  it("9. too many failed attempts locks verification temporarily", async () => {
    const db = freshDb();
    const { generateAccessCode, verifyOtp } = await loadOtpModule(db);
    const { code } = await generateAccessCode(familyContact, "owner-1", "family_owner");

    for (let i = 0; i < 5; i++) await verifyOtp(familyContact, "000000");

    const lockedResult = await verifyOtp(familyContact, "000000");
    expect(lockedResult).toEqual({ ok: false, reason: "too_many_attempts" });
    expect(db.otpCodes[0].locked_until).toBeTruthy();

    // Even the correct code is rejected while locked.
    const correctButLocked = await verifyOtp(familyContact, code);
    expect(correctButLocked).toEqual({ ok: false, reason: "too_many_attempts" });
  });

  it("15. code_used and participant_access_granted are recorded on success", async () => {
    const db = freshDb();
    const { generateAccessCode, verifyOtp } = await loadOtpModule(db);
    const { code } = await generateAccessCode(familyContact, "owner-1", "family_owner");
    await verifyOtp(familyContact, code);

    expect(db.auditEvents.some((e) => e.event === "code_used")).toBe(true);
    expect(db.auditEvents.some((e) => e.event === "participant_access_granted")).toBe(true);
  });
});

describe("Temporary Access Codes — consent gating", () => {
  afterEach(() => jest.resetModules());

  it("13. dashboard access requires consent to have been accepted", async () => {
    jest.resetModules();
    const db = freshDb();
    jest.doMock("@supabase/supabase-js", () => ({ createClient: () => makeFakeSupabase(db) }));
    const { hasAcceptedConsent, acceptConsent } = await import("@/lib/end-user/dashboard-service");

    expect(await hasAcceptedConsent("contact-1")).toBe(false);
    await acceptConsent("contact-1", "adults");
    expect(await hasAcceptedConsent("contact-1")).toBe(true);
  });

  it("consent copy uses the real inviter's name from their profile", async () => {
    jest.resetModules();
    const db = freshDb();
    jest.doMock("@supabase/supabase-js", () => ({ createClient: () => makeFakeSupabase(db) }));
    const { getInviter } = await import("@/lib/end-user/dashboard-service");

    const inviter = await getInviter("contact-1", "adults");
    expect(inviter).toEqual({ name: "Manan Mehta", role: "family_owner" });
  });
});

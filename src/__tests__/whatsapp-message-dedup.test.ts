// Fake Supabase client covering exactly what dedup.ts needs:
// .from("whatsapp_processed_messages").insert({ message_id }) and
// .from("whatsapp_processed_media").insert({ media_id }).
function makeFakeClient(opts: { alreadyClaimed?: Set<string> } = {}) {
  const alreadyClaimed = opts.alreadyClaimed ?? new Set<string>();
  const rowKey: Record<string, string> = {
    whatsapp_processed_messages: "message_id",
    whatsapp_processed_media: "media_id",
  };
  return {
    from: (table: string) => {
      const key = rowKey[table];
      if (!key) throw new Error(`unexpected table ${table}`);
      return {
        insert: async (row: Record<string, string>) => {
          const id = row[key];
          if (alreadyClaimed.has(id)) {
            return { error: { code: "23505", message: "duplicate key value violates unique constraint" } };
          }
          alreadyClaimed.add(id);
          return { error: null };
        },
      };
    },
  };
}

describe("claimMessageId", () => {
  afterEach(() => jest.resetModules());

  it("returns true the first time a message id is claimed", async () => {
    jest.resetModules();
    jest.doMock("@supabase/supabase-js", () => ({ createClient: () => makeFakeClient() }));
    const { claimMessageId } = await import("@/lib/whatsapp/dedup");

    expect(await claimMessageId("wamid.AAA")).toBe(true);
  });

  it("returns false on a second claim of the same message id (webhook redelivery)", async () => {
    jest.resetModules();
    const claimed = new Set<string>();
    jest.doMock("@supabase/supabase-js", () => ({ createClient: () => makeFakeClient({ alreadyClaimed: claimed }) }));
    const { claimMessageId } = await import("@/lib/whatsapp/dedup");

    expect(await claimMessageId("wamid.BBB")).toBe(true);
    expect(await claimMessageId("wamid.BBB")).toBe(false);
    expect(await claimMessageId("wamid.BBB")).toBe(false);
  });

  it("treats different message ids independently", async () => {
    jest.resetModules();
    jest.doMock("@supabase/supabase-js", () => ({ createClient: () => makeFakeClient() }));
    const { claimMessageId } = await import("@/lib/whatsapp/dedup");

    expect(await claimMessageId("wamid.CCC")).toBe(true);
    expect(await claimMessageId("wamid.DDD")).toBe(true);
  });

  it("fails open (processes the message) on an unexpected DB error rather than silently dropping it", async () => {
    jest.resetModules();
    jest.doMock("@supabase/supabase-js", () => ({
      createClient: () => ({
        from: () => ({
          insert: async () => ({ error: { code: "08000", message: "connection error" } }),
        }),
      }),
    }));
    const { claimMessageId } = await import("@/lib/whatsapp/dedup");

    expect(await claimMessageId("wamid.EEE")).toBe(true);
  });
});

describe("claimMediaId", () => {
  afterEach(() => jest.resetModules());

  it("returns true the first time a media id is claimed", async () => {
    jest.resetModules();
    jest.doMock("@supabase/supabase-js", () => ({ createClient: () => makeFakeClient() }));
    const { claimMediaId } = await import("@/lib/whatsapp/dedup");

    expect(await claimMediaId("media.AAA")).toBe(true);
  });

  it("returns false on a second claim of the same media id (same photo resent as a new message)", async () => {
    jest.resetModules();
    const claimed = new Set<string>();
    jest.doMock("@supabase/supabase-js", () => ({ createClient: () => makeFakeClient({ alreadyClaimed: claimed }) }));
    const { claimMediaId } = await import("@/lib/whatsapp/dedup");

    expect(await claimMediaId("media.BBB")).toBe(true);
    expect(await claimMediaId("media.BBB")).toBe(false);
    expect(await claimMediaId("media.BBB")).toBe(false);
  });

  it("treats different media ids independently", async () => {
    jest.resetModules();
    jest.doMock("@supabase/supabase-js", () => ({ createClient: () => makeFakeClient() }));
    const { claimMediaId } = await import("@/lib/whatsapp/dedup");

    expect(await claimMediaId("media.CCC")).toBe(true);
    expect(await claimMediaId("media.DDD")).toBe(true);
  });

  it("fails open (processes the message) on an unexpected DB error rather than silently dropping it", async () => {
    jest.resetModules();
    jest.doMock("@supabase/supabase-js", () => ({
      createClient: () => ({
        from: () => ({
          insert: async () => ({ error: { code: "08000", message: "connection error" } }),
        }),
      }),
    }));
    const { claimMediaId } = await import("@/lib/whatsapp/dedup");

    expect(await claimMediaId("media.EEE")).toBe(true);
  });

  it("claims message id and media id independently, mirroring the webhook route's two checks", async () => {
    jest.resetModules();
    const claimed = new Set<string>();
    jest.doMock("@supabase/supabase-js", () => ({ createClient: () => makeFakeClient({ alreadyClaimed: claimed }) }));
    const { claimMessageId, claimMediaId } = await import("@/lib/whatsapp/dedup");

    expect(await claimMessageId("wamid.FFF")).toBe(true);
    expect(await claimMediaId("media.FFF")).toBe(true);
    // A redelivery with a different wamid but the same media id is caught
    // by the media claim even though the message claim would succeed.
    expect(await claimMessageId("wamid.GGG")).toBe(true);
    expect(await claimMediaId("media.FFF")).toBe(false);
  });
});

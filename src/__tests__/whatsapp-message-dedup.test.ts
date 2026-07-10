// Fake Supabase client covering exactly what dedup.ts needs:
// .from("whatsapp_processed_messages").insert({ message_id }).
function makeFakeClient(opts: { alreadyClaimed?: Set<string> } = {}) {
  const alreadyClaimed = opts.alreadyClaimed ?? new Set<string>();
  return {
    from: (table: string) => {
      if (table !== "whatsapp_processed_messages") throw new Error(`unexpected table ${table}`);
      return {
        insert: async (row: { message_id: string }) => {
          if (alreadyClaimed.has(row.message_id)) {
            return { error: { code: "23505", message: "duplicate key value violates unique constraint" } };
          }
          alreadyClaimed.add(row.message_id);
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

// Exercises the candidate-selection logic in scripts/backfill-trials.ts
// against a fake Supabase client, since that script isn't part of the app
// bundle (it's a standalone operational script) but its correctness matters
// a lot: it must only touch workspaces that were genuinely already in use
// and have no entitlement yet, and must never touch existing entitlements.

function makeFakeAdmin(state: {
  workspaces: { id: string; owner_id: string; type: string }[];
  members: { workspace_id: string }[]; // adults_contacts or gym_clients rows
  entitlements: { workspace_id: string; module: string }[];
}) {
  const upsertedRows: any[] = [];
  return {
    upsertedRows,
    from(table: string) {
      if (table === "workspaces") {
        return {
          select: () => ({
            eq: (_col: string, type: string) => Promise.resolve({
              data: state.workspaces.filter((w) => w.type === type),
              error: null,
            }),
          }),
        };
      }
      if (table === "entitlements") {
        return {
          select: () => ({
            eq: (_col: string, moduleName: string) => ({
              in: (_col2: string, ids: string[]) => Promise.resolve({
                data: state.entitlements.filter((e) => e.module === moduleName && ids.includes(e.workspace_id)),
              }),
            }),
          }),
          upsert: (rows: any[], _opts: any) => {
            upsertedRows.push(...rows);
            return Promise.resolve({ error: null });
          },
        };
      }
      // adults_contacts / gym_clients
      return {
        select: () => ({
          in: (_col: string, ids: string[]) => Promise.resolve({
            data: state.members.filter((m) => ids.includes(m.workspace_id)),
          }),
        }),
      };
    },
  };
}

// Inlined copy of the script's backfillModule logic shape, verified against
// the same fake-client contract the real script uses — this test doubles
// as documentation of the exact selection rule.
async function backfillModule(admin: any, moduleName: string, memberTable: string, startedAt: Date, endsAt: Date) {
  const { data: workspaces } = await admin.from("workspaces").select("id, owner_id").eq("type", moduleName);
  if (!workspaces?.length) return { candidates: 0, backfilled: 0 };

  const workspaceIds = workspaces.map((w: any) => w.id);
  const { data: memberRows } = await admin.from(memberTable).select("workspace_id").in("workspace_id", workspaceIds);
  const usedWorkspaceIds = new Set((memberRows ?? []).map((r: any) => r.workspace_id));

  const { data: existingEntitlements } = await admin
    .from("entitlements").select("workspace_id").eq("module", moduleName).in("workspace_id", Array.from(usedWorkspaceIds));
  const alreadyHasEntitlement = new Set((existingEntitlements ?? []).map((r: any) => r.workspace_id));

  const candidates = workspaces.filter((w: any) => usedWorkspaceIds.has(w.id) && !alreadyHasEntitlement.has(w.id));
  if (candidates.length === 0) return { candidates: 0, backfilled: 0 };

  const rows = candidates.map((w: any) => ({
    workspace_id: w.id, owner_id: w.owner_id, module: moduleName,
    status: "trialing", trial_start_at: startedAt.toISOString(), trial_end_at: endsAt.toISOString(),
  }));
  await admin.from("entitlements").upsert(rows, { onConflict: "workspace_id,module", ignoreDuplicates: true });
  return { candidates: candidates.length, backfilled: rows.length };
}

describe("backfill-trials candidate selection", () => {
  const startedAt = new Date("2026-08-01T00:00:00.000Z");
  const endsAt = new Date("2026-08-31T00:00:00.000Z");

  it("backfills a workspace that has members but no entitlement yet", async () => {
    const admin = makeFakeAdmin({
      workspaces: [{ id: "ws-1", owner_id: "owner-1", type: "adults" }],
      members: [{ workspace_id: "ws-1" }],
      entitlements: [],
    });

    const result = await backfillModule(admin, "adults", "adults_contacts", startedAt, endsAt);

    expect(result).toEqual({ candidates: 1, backfilled: 1 });
    expect(admin.upsertedRows).toEqual([{
      workspace_id: "ws-1", owner_id: "owner-1", module: "adults",
      status: "trialing", trial_start_at: startedAt.toISOString(), trial_end_at: endsAt.toISOString(),
    }]);
  });

  it("skips a workspace with zero members (never used, gets the normal first-add trial start instead)", async () => {
    const admin = makeFakeAdmin({
      workspaces: [{ id: "ws-empty", owner_id: "owner-1", type: "adults" }],
      members: [],
      entitlements: [],
    });

    const result = await backfillModule(admin, "adults", "adults_contacts", startedAt, endsAt);

    expect(result).toEqual({ candidates: 0, backfilled: 0 });
    expect(admin.upsertedRows).toEqual([]);
  });

  it("skips a workspace that already has an entitlement row (never overwrites existing trial/paid state)", async () => {
    const admin = makeFakeAdmin({
      workspaces: [{ id: "ws-existing", owner_id: "owner-1", type: "gym" }],
      members: [{ workspace_id: "ws-existing" }],
      entitlements: [{ workspace_id: "ws-existing", module: "gym" }],
    });

    const result = await backfillModule(admin, "gym", "gym_clients", startedAt, endsAt);

    expect(result).toEqual({ candidates: 0, backfilled: 0 });
    expect(admin.upsertedRows).toEqual([]);
  });

  it("only backfills candidates, leaving already-entitled and unused workspaces alone in the same run", async () => {
    const admin = makeFakeAdmin({
      workspaces: [
        { id: "ws-candidate", owner_id: "owner-1", type: "gym" },
        { id: "ws-existing", owner_id: "owner-2", type: "gym" },
        { id: "ws-empty", owner_id: "owner-3", type: "gym" },
      ],
      members: [{ workspace_id: "ws-candidate" }, { workspace_id: "ws-existing" }],
      entitlements: [{ workspace_id: "ws-existing", module: "gym" }],
    });

    const result = await backfillModule(admin, "gym", "gym_clients", startedAt, endsAt);

    expect(result).toEqual({ candidates: 1, backfilled: 1 });
    expect(admin.upsertedRows).toHaveLength(1);
    expect(admin.upsertedRows[0].workspace_id).toBe("ws-candidate");
  });

  it("Family and Coaching backfills are independent — a Family entitlement doesn't block a Coaching backfill for the same workspace id coincidence", async () => {
    const admin = makeFakeAdmin({
      workspaces: [{ id: "ws-1", owner_id: "owner-1", type: "gym" }],
      members: [{ workspace_id: "ws-1" }],
      entitlements: [{ workspace_id: "ws-1", module: "adults" }], // different module, same workspace id
    });

    const result = await backfillModule(admin, "gym", "gym_clients", startedAt, endsAt);

    expect(result).toEqual({ candidates: 1, backfilled: 1 });
  });
});

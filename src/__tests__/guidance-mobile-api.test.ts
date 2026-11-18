// The mobile app's Guidance API (src/app/api/mobile/guidance): it identifies
// the caller from the Supabase access token, shows nothing to anyone who
// may not see the person, and runs the web's own request code.

const mockFlags = { guidance: true };
jest.mock("@/lib/billing/feature-flags", () =>
  Object.defineProperty({ ...jest.requireActual("@/lib/billing/feature-flags") }, "GUIDANCE_ENABLED", {
    get: () => mockFlags.guidance,
    enumerable: true,
  })
);

const mockUsers: Record<string, string> = { "token-manan": "profile-manan", "token-stranger": "profile-stranger" };
jest.mock("@supabase/supabase-js", () => ({
  ...jest.requireActual("@supabase/supabase-js"),
  createClient: () => ({
    auth: {
      getUser: async (token: string) =>
        mockUsers[token] ? { data: { user: { id: mockUsers[token] } }, error: null } : { data: { user: null }, error: { message: "bad" } },
    },
  }),
}));

let mockDb: unknown;
jest.mock("@/lib/supabase/server", () => ({ createServiceClient: () => mockDb }));

import { NextRequest } from "next/server";

import { GET, POST } from "@/app/api/mobile/guidance/[...op]/route";

import { makeGuidanceDb, type GuidanceRows } from "./helpers/guidance-db";

const TZ = "Asia/Kolkata";
const KAMLESH = "contact-kamlesh";

function rows(mode: "tracking" | "guidance"): GuidanceRows {
  return {
    adults_contacts: [
      { id: KAMLESH, caregiver_id: "profile-manan", relationship_type: "family_caregiver", timezone: TZ, full_name: "Kamlesh Mehta", age: 64 },
    ],
    gym_clients: [],
    nutrition_policy_versions: [{ version: "v1-mifflin-2026-10", status: "unreviewed" }],
    nutrition_guidance:
      mode === "guidance"
        ? [{ id: "g1", adults_contact_id: KAMLESH, mode: "guidance", activated_at: "2026-11-01T04:00:00Z", activated_via: "caregiver" }]
        : [],
    nutrition_guidance_screening: [],
    nutrition_targets:
      mode === "guidance"
        ? [
            {
              id: "t1",
              adults_contact_id: KAMLESH,
              effective_from: "2026-11-01",
              effective_to: null,
              policy_version: "v1-mifflin-2026-10",
              calories_kcal: 1436,
              protein_g: 95,
              carbs_g: 170,
              fat_g: 48,
              fiber_g: 25,
              explanation: "x",
            },
          ]
        : [],
    meal_logs: [],
  };
}

const get = (token: string | null, query: string) =>
  GET(new NextRequest(`http://localhost/api/mobile/guidance/state?${query}`, { headers: token ? { authorization: `Bearer ${token}` } : {} }), {
    params: Promise.resolve({ op: ["state"] }),
  });
const post = (token: string | null, op: string, body: unknown) =>
  POST(
    new NextRequest(`http://localhost/api/mobile/guidance/${op}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ op: [op] }) }
  );

beforeEach(() => {
  mockFlags.guidance = true;
});

describe("GET state", () => {
  it("needs a valid token", async () => {
    mockDb = makeGuidanceDb(rows("guidance"));
    expect((await get(null, `type=adults&id=${KAMLESH}`)).status).toBe(401);
    expect((await get("token-forged", `type=adults&id=${KAMLESH}`)).status).toBe(401);
  });

  it("shows the owner the setup when Guidance is off, and the dashboard when it's on", async () => {
    mockDb = makeGuidanceDb(rows("tracking"));
    const off = await get("token-manan", `type=adults&id=${KAMLESH}`);
    expect(off.status).toBe(200);
    const offBody = await off.json();
    expect(offBody.view.kind).toBe("setup");
    expect(offBody.dashboard).toBeNull();

    mockDb = makeGuidanceDb(rows("guidance"));
    const on = await (await get("token-manan", `type=adults&id=${KAMLESH}`)).json();
    expect(on.view).toMatchObject({ kind: "active", canReturnToTracking: true });
    expect(on.dashboard).toMatchObject({ timezone: TZ, isPreviewOnly: true });
    expect(on.dashboard.nextSteps).toBeTruthy();
  });

  it("tells a stranger nothing, not even that the person exists", async () => {
    mockDb = makeGuidanceDb(rows("guidance"));
    const r = await get("token-stranger", `type=adults&id=${KAMLESH}`);
    expect(r.status).toBe(404);
    expect(await r.json()).toEqual({ error: "not_found" });
  });

  it("rejects a malformed request", async () => {
    mockDb = makeGuidanceDb(rows("guidance"));
    expect((await get("token-manan", `type=nope&id=${KAMLESH}`)).status).toBe(400);
  });
});

describe("POST ops", () => {
  it("runs the web's own request code as the signed-in owner", async () => {
    const data = rows("guidance");
    mockDb = makeGuidanceDb(data);
    const off = await post("token-manan", "off", { type: "adults", id: KAMLESH });
    expect(await off.json()).toMatchObject({ ok: true, mode: "tracking" });
    expect(data.nutrition_guidance[0]).toMatchObject({ mode: "tracking" });
  });

  it("refuses a stranger through the services' own checks, and unknown ops", async () => {
    const data = rows("guidance");
    mockDb = makeGuidanceDb(data);
    expect(await (await post("token-stranger", "off", { type: "adults", id: KAMLESH })).json()).toMatchObject({ ok: false, kind: "forbidden" });
    expect(data.nutrition_guidance[0]).toMatchObject({ mode: "guidance" });
    expect((await post("token-manan", "delete-everything", { type: "adults", id: KAMLESH })).status).toBe(404);
    expect((await post(null, "off", { type: "adults", id: KAMLESH })).status).toBe(401);
  });
});

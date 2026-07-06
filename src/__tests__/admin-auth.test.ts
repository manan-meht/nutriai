// Coverage for admin/reviewer access protection: signed-out users, signed-in
// users with no admin role, and each of the four review-console roles.

let mockUser: { id: string } | null = null;
let mockRole: string | null = null;

jest.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: mockUser } }),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: mockRole ? { role: mockRole } : null }),
        }),
      }),
    }),
  }),
}));

import { getAdminSession, canWriteFoodKnowledgeBase, ADMIN_ROLES } from "@/lib/admin/auth";

describe("getAdminSession", () => {
  beforeEach(() => {
    mockUser = null;
    mockRole = null;
  });

  it("returns null when there is no signed-in user", async () => {
    expect(await getAdminSession()).toBeNull();
  });

  it("returns null when the signed-in user has the default 'user' role", async () => {
    mockUser = { id: "user-1" };
    mockRole = "user";
    expect(await getAdminSession()).toBeNull();
  });

  it("returns null when the profile has no role at all", async () => {
    mockUser = { id: "user-1" };
    mockRole = null;
    expect(await getAdminSession()).toBeNull();
  });

  it.each(ADMIN_ROLES)("grants a session for the '%s' role", async (role) => {
    mockUser = { id: "user-1" };
    mockRole = role;
    expect(await getAdminSession()).toEqual({ userId: "user-1", role });
  });
});

describe("canWriteFoodKnowledgeBase", () => {
  it("only allows admin and super_admin to write", () => {
    expect(canWriteFoodKnowledgeBase("reviewer")).toBe(false);
    expect(canWriteFoodKnowledgeBase("nutrition_expert")).toBe(false);
    expect(canWriteFoodKnowledgeBase("admin")).toBe(true);
    expect(canWriteFoodKnowledgeBase("super_admin")).toBe(true);
  });
});

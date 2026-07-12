import { NextRequest, NextResponse } from "next/server";
import { getUserFromBearerToken, createServiceClient } from "@/lib/supabase";
import { findWorkspace } from "@nutriai/nutrition-core";

export const runtime = "edge";

// GET /me/products — which product(s) the authenticated user already has a
// workspace for, without creating one. Deliberately separate from
// /adults/workspace and /gym/workspace, both of which get-or-create (safe
// on the web app, which only ever calls the one matching whatever product
// page the caller is on) — the mobile app needs to detect which
// dashboard(s) to route a freshly logged-in user into, and calling both
// get-or-create endpoints just to check would silently create an empty
// ghost workspace of both types for every user, even ones who only ever
// intended to use one.
export async function GET(request: NextRequest) {
  const auth = await getUserFromBearerToken(request);
  if (!auth) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const admin = createServiceClient();
  const [adults, gym] = await Promise.all([
    findWorkspace(admin, auth.user.id, "adults"),
    findWorkspace(admin, auth.user.id, "gym"),
  ]);

  return NextResponse.json({
    adults: adults ? { workspaceId: adults.id } : null,
    gym: gym ? { workspaceId: gym.id } : null,
  });
}

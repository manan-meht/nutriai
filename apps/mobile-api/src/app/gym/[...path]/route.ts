import { NextRequest, NextResponse } from "next/server";
import { getUserFromBearerToken } from "@/lib/supabase";
import { getOrCreateWorkspace, getClients, getClientDetails } from "@/lib/gym";
import { getEntitlementSnapshot } from "@/lib/entitlements";

export const runtime = "edge";

// Routes handled here:
//   GET /gym/workspace
//   GET /gym/clients
//   GET /gym/clients/:clientId
export async function GET(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const auth = await getUserFromBearerToken(request);
  if (!auth) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { path } = await params;

  if (path.length === 1 && path[0] === "workspace") {
    const { data: profile } = await auth.supabase
      .from("profiles")
      .select("full_name")
      .eq("id", auth.user.id)
      .maybeSingle();

    const workspace = await getOrCreateWorkspace(auth.user.id, profile?.full_name ?? undefined);
    const entitlement = await getEntitlementSnapshot(workspace.id, "gym");

    return NextResponse.json({
      workspace,
      entitlement,
      coachEmail: auth.user.email ?? null,
      coachName: profile?.full_name ?? null,
    });
  }

  if (path.length === 1 && path[0] === "clients") {
    const workspace = await getOrCreateWorkspace(auth.user.id);
    const clients = await getClients(workspace.id, auth.supabase);
    return NextResponse.json({ clients });
  }

  if (path.length === 2 && path[0] === "clients") {
    const details = await getClientDetails(path[1], auth.supabase);
    if (!details) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(details);
  }

  return NextResponse.json({ error: "Not found" }, { status: 404 });
}

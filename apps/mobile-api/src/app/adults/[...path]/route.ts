import { NextRequest, NextResponse } from "next/server";
import { getUserFromBearerToken } from "@/lib/supabase";
import { getOrCreateAdultsWorkspace, getContacts, getContactDetails } from "@/lib/adults";
import { getEntitlementSnapshot } from "@/lib/entitlements";

export const runtime = "edge";

// Routes handled here (this whole app is deployed as its own Cloudflare
// Pages project, so no /api/mobile prefix is needed):
//   GET /adults/workspace
//   GET /adults/contacts
//   GET /adults/contacts/:contactId
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

    const workspace = await getOrCreateAdultsWorkspace(auth.user.id, profile?.full_name ?? undefined);
    const entitlement = await getEntitlementSnapshot(workspace.id, "adults");

    return NextResponse.json({
      workspace,
      entitlement,
      caregiverEmail: auth.user.email ?? null,
      caregiverName: profile?.full_name ?? null,
    });
  }

  if (path.length === 1 && path[0] === "contacts") {
    const workspace = await getOrCreateAdultsWorkspace(auth.user.id);
    const contacts = await getContacts(workspace.id, auth.supabase);
    return NextResponse.json({ contacts });
  }

  if (path.length === 2 && path[0] === "contacts") {
    const details = await getContactDetails(path[1], auth.supabase);
    if (!details) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(details);
  }

  return NextResponse.json({ error: "Not found" }, { status: 404 });
}

import { NextRequest, NextResponse } from "next/server";
import { getUserFromBearerToken, createServiceClient } from "@/lib/supabase";
import { getOrCreateWorkspace, getClients, getRemovedClients, getClientDetails, addClient, updateClient, removeClient } from "@/lib/gym";
import { getEntitlementSnapshot } from "@/lib/entitlements";
import { getOrCreateCoachClientInvite } from "@/lib/invites";

export const runtime = "edge";

// Routes handled here:
//   GET /gym/workspace
//   GET /gym/clients
//   GET /gym/clients/removed
//   GET /gym/clients/:clientId
//   GET /gym/clients/:clientId/invite           (get-or-create)
//   POST /gym/clients
//   PATCH /gym/clients/:clientId
//   DELETE /gym/clients/:clientId
//   POST /gym/clients/:clientId/access-code    (generate)
//   PATCH /gym/clients/:clientId/access-code   (regenerate)
//   DELETE /gym/clients/:clientId/access-code  (revoke)
//
// Temporary Access Codes — gym-side equivalent of the adults route's own
// access-code handlers (see that file's comments; same reasoning for
// folding into this existing catch-all rather than a new route file).
async function requireOwnedGymClientForAccessCode(auth: NonNullable<Awaited<ReturnType<typeof getUserFromBearerToken>>>, clientId: string) {
  const { data: clientRow } = await auth.supabase
    .from("gym_clients")
    .select("id, full_name, whatsapp_number")
    .eq("id", clientId)
    .eq("trainer_id", auth.user.id)
    .maybeSingle();
  if (!clientRow || !clientRow.whatsapp_number) return null;

  return {
    contactId: clientRow.id as string,
    contactType: "gym" as const,
    whatsappNumber: clientRow.whatsapp_number as string,
    fullName: clientRow.full_name as string,
  };
}

function formatAccessCode(code: string): string {
  return code.length === 6 ? `${code.slice(0, 3)} ${code.slice(3)}` : code;
}

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
    const entitlement = await getEntitlementSnapshot(workspace.id, "gym", auth.user.email);

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

  // Must be checked before the generic /clients/:clientId route below,
  // since "removed" would otherwise be treated as a client id.
  if (path.length === 2 && path[0] === "clients" && path[1] === "removed") {
    const workspace = await getOrCreateWorkspace(auth.user.id);
    const clients = await getRemovedClients(workspace.id, auth.supabase);
    return NextResponse.json({ clients });
  }

  if (path.length === 2 && path[0] === "clients") {
    const details = await getClientDetails(path[1], auth.supabase);
    if (!details) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(details);
  }

  // Mirrors the main web app's getOrCreateCoachClientInvite — the adults
  // route's /contacts/:id/invite for a coaching client. Without it a coach
  // adding someone from the phone had no way to send the WhatsApp invite
  // the client needs to start logging meals.
  if (path.length === 3 && path[0] === "clients" && path[2] === "invite") {
    const { data: clientRow } = await auth.supabase
      .from("gym_clients")
      .select("id, workspace_id, full_name")
      .eq("id", path[1])
      .eq("trainer_id", auth.user.id)
      .maybeSingle();
    if (!clientRow) return NextResponse.json({ error: "Client not found" }, { status: 404 });

    try {
      const db = createServiceClient();
      const invite = await getOrCreateCoachClientInvite(
        db,
        clientRow.workspace_id,
        clientRow.id,
        auth.user.id,
        clientRow.full_name?.split(" ")[0]
      );
      return NextResponse.json(invite);
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to create invite" }, { status: 500 });
    }
  }

  return NextResponse.json({ error: "Not found" }, { status: 404 });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const auth = await getUserFromBearerToken(request);
  if (!auth) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { path } = await params;

  if (path.length === 3 && path[0] === "clients" && path[2] === "access-code") {
    const contact = await requireOwnedGymClientForAccessCode(auth, path[1]);
    if (!contact) return NextResponse.json({ error: "Client not found, or missing a WhatsApp number." }, { status: 404 });

    const { generateAccessCode, recordAuditEvent } = await import("@nutriai/end-user-core");
    const db = createServiceClient();
    const ttlHours = (await request.json().catch(() => ({})))?.ttlHours === 1 ? 1 : 24;
    const { code, expiresAt } = await generateAccessCode(db, contact, auth.user.id, "coach", process.env.END_USER_OTP_PEPPER ?? "", ttlHours * 60 * 60 * 1000);
    await recordAuditEvent(db, "code_generated", contact.contactId, contact.contactType, { actorUserId: auth.user.id });
    return NextResponse.json({ code, formattedCode: formatAccessCode(code), expiresAt });
  }

  if (path.length !== 1 || path[0] !== "clients") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });

  const workspace = await getOrCreateWorkspace(auth.user.id);
  const result = await addClient(workspace.id, auth.user.id, body, auth.supabase);
  if (result.error) return NextResponse.json(result, { status: 400 });

  return NextResponse.json(result);
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const auth = await getUserFromBearerToken(request);
  if (!auth) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { path } = await params;

  if (path.length === 3 && path[0] === "clients" && path[2] === "access-code") {
    const contact = await requireOwnedGymClientForAccessCode(auth, path[1]);
    if (!contact) return NextResponse.json({ error: "Client not found, or missing a WhatsApp number." }, { status: 404 });

    const { generateAccessCode, recordAuditEvent } = await import("@nutriai/end-user-core");
    const db = createServiceClient();
    const ttlHours = (await request.json().catch(() => ({})))?.ttlHours === 1 ? 1 : 24;
    const { code, expiresAt } = await generateAccessCode(db, contact, auth.user.id, "coach", process.env.END_USER_OTP_PEPPER ?? "", ttlHours * 60 * 60 * 1000);
    await recordAuditEvent(db, "code_regenerated", contact.contactId, contact.contactType, { actorUserId: auth.user.id });
    return NextResponse.json({ code, formattedCode: formatAccessCode(code), expiresAt });
  }

  if (path.length !== 2 || path[0] !== "clients") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });

  const result = await updateClient(path[1], auth.user.id, body, auth.supabase);
  if (result.error) return NextResponse.json(result, { status: 400 });

  return NextResponse.json({});
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const auth = await getUserFromBearerToken(request);
  if (!auth) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { path } = await params;

  if (path.length === 2 && path[0] === "clients") {
    const result = await removeClient(path[1], auth.user.id, auth.supabase);
    if (result.error) return NextResponse.json(result, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  if (path.length !== 3 || path[0] !== "clients" || path[2] !== "access-code") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const contact = await requireOwnedGymClientForAccessCode(auth, path[1]);
  if (!contact) return NextResponse.json({ error: "Client not found." }, { status: 404 });

  const { revokeActiveAccessCodes, recordAuditEvent } = await import("@nutriai/end-user-core");
  const db = createServiceClient();
  await revokeActiveAccessCodes(db, contact);
  await recordAuditEvent(db, "code_revoked", contact.contactId, contact.contactType, { actorUserId: auth.user.id });

  return NextResponse.json({ ok: true });
}

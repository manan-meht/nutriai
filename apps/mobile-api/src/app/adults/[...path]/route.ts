import { NextRequest, NextResponse } from "next/server";
import { getUserFromBearerToken, createServiceClient } from "@/lib/supabase";
import { getOrCreateAdultsWorkspace, getContacts, getRemovedContacts, getContactDetails, addContact, updateContact, removeContact } from "@/lib/adults";
import { getEntitlementSnapshot } from "@/lib/entitlements";
import { DEFAULT_DIETARY_PROFILE } from "@/lib/dietary-profile-types";
import { applyExplicitPreferences, type FoodPreferenceSelections } from "@/lib/food-preferences";

export const runtime = "edge";

// Routes handled here (this whole app is deployed as its own Cloudflare
// Pages project, so no /api/mobile prefix is needed):
//   GET /adults/workspace
//   GET /adults/contacts
//   GET /adults/contacts/removed
//   GET /adults/contacts/:contactId
//   POST /adults/contacts
//   PATCH /adults/contacts/:contactId
//   DELETE /adults/contacts/:contactId
//   POST /adults/contacts/:contactId/access-code    (generate)
//   PATCH /adults/contacts/:contactId/access-code   (regenerate)
//   DELETE /adults/contacts/:contactId/access-code  (revoke)
//   GET /adults/contacts/:contactId/food-preferences
//   PATCH /adults/contacts/:contactId/food-preferences
//
// Temporary Access Codes (mobile equivalent of the web app's
// generateAccessCodeAction/regenerateAccessCodeAction/revokeAccessCodeAction
// — see src/app/(adults)/adults/dashboard/actions.ts and
// @nutriai/end-user-core's otp.ts). Folded into this existing catch-all
// route rather than a new file — see this app's own README/comments
// elsewhere on why: each additional route file costs real fixed Worker
// bundle overhead, and this app has its own independent size budget.
async function requireOwnedAdultsContactForAccessCode(auth: NonNullable<Awaited<ReturnType<typeof getUserFromBearerToken>>>, contactId: string) {
  const { data: contactRow } = await auth.supabase
    .from("adults_contacts")
    .select("id, full_name, whatsapp_number")
    .eq("id", contactId)
    .eq("caregiver_id", auth.user.id)
    .maybeSingle();
  if (!contactRow || !contactRow.whatsapp_number) return null;

  return {
    contactId: contactRow.id as string,
    contactType: "adults" as const,
    whatsappNumber: contactRow.whatsapp_number as string,
    fullName: contactRow.full_name as string,
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

  // Must be checked before the generic /contacts/:contactId route below,
  // since "removed" would otherwise be treated as a contact id.
  if (path.length === 2 && path[0] === "contacts" && path[1] === "removed") {
    const workspace = await getOrCreateAdultsWorkspace(auth.user.id);
    const contacts = await getRemovedContacts(workspace.id, auth.supabase);
    return NextResponse.json({ contacts });
  }

  if (path.length === 2 && path[0] === "contacts") {
    const details = await getContactDetails(path[1], auth.supabase);
    if (!details) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(details);
  }

  // Mirrors the main web app's getFoodPreferences (see
  // src/app/(adults)/adults/dashboard/actions.ts) — reads the
  // dietary_profile JSON column, merged over defaults.
  if (path.length === 3 && path[0] === "contacts" && path[2] === "food-preferences") {
    const { data: row } = await auth.supabase
      .from("adults_contacts")
      .select("dietary_profile")
      .eq("id", path[1])
      .eq("caregiver_id", auth.user.id)
      .maybeSingle();
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ...DEFAULT_DIETARY_PROFILE, ...(row.dietary_profile ?? {}) });
  }

  return NextResponse.json({ error: "Not found" }, { status: 404 });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const auth = await getUserFromBearerToken(request);
  if (!auth) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { path } = await params;

  if (path.length === 3 && path[0] === "contacts" && path[2] === "access-code") {
    const contact = await requireOwnedAdultsContactForAccessCode(auth, path[1]);
    if (!contact) return NextResponse.json({ error: "Contact not found, or missing a WhatsApp number." }, { status: 404 });

    const { generateAccessCode, recordAuditEvent } = await import("@nutriai/end-user-core");
    const db = createServiceClient();
    const ttlHours = (await request.json().catch(() => ({})))?.ttlHours === 1 ? 1 : 24;
    const { code, expiresAt } = await generateAccessCode(db, contact, auth.user.id, "family_owner", process.env.END_USER_OTP_PEPPER ?? "", ttlHours * 60 * 60 * 1000);
    await recordAuditEvent(db, "code_generated", contact.contactId, contact.contactType, { actorUserId: auth.user.id });
    return NextResponse.json({ code, formattedCode: formatAccessCode(code), expiresAt });
  }

  if (path.length !== 1 || path[0] !== "contacts") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });

  const workspace = await getOrCreateAdultsWorkspace(auth.user.id);
  const result = await addContact(workspace.id, auth.user.id, body, auth.supabase);
  if (result.error) return NextResponse.json(result, { status: 400 });

  return NextResponse.json(result);
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const auth = await getUserFromBearerToken(request);
  if (!auth) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { path } = await params;

  if (path.length === 3 && path[0] === "contacts" && path[2] === "access-code") {
    const contact = await requireOwnedAdultsContactForAccessCode(auth, path[1]);
    if (!contact) return NextResponse.json({ error: "Contact not found, or missing a WhatsApp number." }, { status: 404 });

    // No separate "regenerate" function exists in @nutriai/end-user-core —
    // generateAccessCode itself already revokes any prior active code, so
    // regenerating is just calling it again; only the audit event label
    // differs (code_regenerated vs code_generated), same as the web app's
    // src/lib/end-user/otp.ts wrapper.
    const { generateAccessCode, recordAuditEvent } = await import("@nutriai/end-user-core");
    const db = createServiceClient();
    const ttlHours = (await request.json().catch(() => ({})))?.ttlHours === 1 ? 1 : 24;
    const { code, expiresAt } = await generateAccessCode(db, contact, auth.user.id, "family_owner", process.env.END_USER_OTP_PEPPER ?? "", ttlHours * 60 * 60 * 1000);
    await recordAuditEvent(db, "code_regenerated", contact.contactId, contact.contactType, { actorUserId: auth.user.id });
    return NextResponse.json({ code, formattedCode: formatAccessCode(code), expiresAt });
  }

  // Mirrors the main web app's updateFoodPreferences (see
  // src/app/(adults)/adults/dashboard/actions.ts) — applies only the
  // fields present in the request body via applyExplicitPreferences, so a
  // partial save never resets unrelated preferences.
  if (path.length === 3 && path[0] === "contacts" && path[2] === "food-preferences") {
    const selections: FoodPreferenceSelections = (await request.json().catch(() => null)) ?? {};

    const { data: row } = await auth.supabase
      .from("adults_contacts")
      .select("dietary_profile")
      .eq("id", path[1])
      .eq("caregiver_id", auth.user.id)
      .maybeSingle();
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const currentProfile = { ...DEFAULT_DIETARY_PROFILE, ...(row.dietary_profile ?? {}) };
    const nextProfile = applyExplicitPreferences(currentProfile, selections);

    const { error } = await auth.supabase
      .from("adults_contacts")
      .update({ dietary_profile: nextProfile })
      .eq("id", path[1])
      .eq("caregiver_id", auth.user.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({});
  }

  if (path.length !== 2 || path[0] !== "contacts") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });

  const result = await updateContact(path[1], auth.user.id, body, auth.supabase);
  if (result.error) return NextResponse.json(result, { status: 400 });

  return NextResponse.json({});
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const auth = await getUserFromBearerToken(request);
  if (!auth) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { path } = await params;

  if (path.length === 2 && path[0] === "contacts") {
    const result = await removeContact(path[1], auth.user.id, auth.supabase);
    if (result.error) return NextResponse.json(result, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  if (path.length !== 3 || path[0] !== "contacts" || path[2] !== "access-code") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const contact = await requireOwnedAdultsContactForAccessCode(auth, path[1]);
  if (!contact) return NextResponse.json({ error: "Contact not found." }, { status: 404 });

  const { revokeActiveAccessCodes, recordAuditEvent } = await import("@nutriai/end-user-core");
  const db = createServiceClient();
  await revokeActiveAccessCodes(db, contact);
  await recordAuditEvent(db, "code_revoked", contact.contactId, contact.contactType, { actorUserId: auth.user.id });

  return NextResponse.json({ ok: true });
}

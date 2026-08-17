import { NextRequest, NextResponse } from "next/server";
import { getUserFromBearerToken, createServiceClient } from "@/lib/supabase";
import { getOrCreateAdultsWorkspace, getContacts, getRemovedContacts, getContactDetails, addContact, updateContact, removeContact, markWorkspaceSelfPlan } from "@/lib/adults";
import { getEntitlementSnapshot } from "@/lib/entitlements";
import { DEFAULT_DIETARY_PROFILE } from "@/lib/dietary-profile-types";
import { applyExplicitPreferences, type FoodPreferenceSelections } from "@/lib/food-preferences";
import { getOrCreateFamilyInvite } from "@/lib/invites";
import { CONTACT_AVATARS_BUCKET, resolveSignedContactAvatarUrl } from "@nutriai/nutrition-core";

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
//   GET /adults/contacts/:contactId/invite            (get-or-create)
//   PATCH /adults/contacts/:contactId/avatar          (multipart photo upload)
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

    // Mirrors the main app's one-time ?self=1 redirect param (see
    // src/app/(adults)/adults/dashboard/page.tsx) — the mobile product
    // picker (app/(app)/index.tsx) passes this the first time someone
    // lands on /adults having picked "Self" rather than "Family", so a
    // brand-new self-tracking signup doesn't default to (and get billed
    // as) a Family workspace just because that's this function's default.
    if (request.nextUrl.searchParams.get("self") === "1" && workspace.plan !== "self") {
      await markWorkspaceSelfPlan(workspace.id);
      workspace.plan = "self";
    }

    const entitlement = await getEntitlementSnapshot(workspace.id, "adults", auth.user.email);

    return NextResponse.json({
      workspace,
      entitlement,
      caregiverEmail: auth.user.email ?? null,
      caregiverName: profile?.full_name ?? null,
      // Digits-only bot number, embedded as a plain wa.me link when a
      // caregiver/self-tracker needs to reconnect after WhatsApp's 24h
      // customer-service window has lapsed (see the "stale" invite state
      // in person-detail.tsx/person-card.tsx) — undefined if not
      // configured, same as the web app's identical prop.
      tistraWhatsAppNumber: process.env.TISTRA_WHATSAPP_NUMBER,
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

  // Mirrors the main web app's getOrCreateFamilyInvite (see
  // src/app/(adults)/adults/dashboard/actions.ts) — returns the family
  // member's existing pending/claimed invite, or creates a fresh one.
  // Called right after adding a family member (see
  // apps/mobile/src/app/(app)/adults/add.tsx) so the caregiver can actually
  // send the WhatsApp invite, rather than the contact silently existing
  // with no way to connect them.
  if (path.length === 3 && path[0] === "contacts" && path[2] === "invite") {
    const { data: contactRow } = await auth.supabase
      .from("adults_contacts")
      .select("id, workspace_id, full_name")
      .eq("id", path[1])
      .eq("caregiver_id", auth.user.id)
      .maybeSingle();
    if (!contactRow) return NextResponse.json({ error: "Contact not found" }, { status: 404 });

    try {
      const db = createServiceClient();
      const invite = await getOrCreateFamilyInvite(
        db,
        contactRow.workspace_id,
        contactRow.id,
        auth.user.id,
        contactRow.full_name?.split(" ")[0]
      );
      return NextResponse.json(invite);
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to create invite" }, { status: 500 });
    }
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

  //   POST /adults/contacts/:contactId/meal-reactions  { mealLogId, emoji }
  // Family-loop reaction — mirrors the web dashboard's reactToMeal action;
  // see src/lib/meal-reactions.ts for the send-once/dedupe rules.
  if (path.length === 3 && path[0] === "contacts" && path[2] === "meal-reactions") {
    const body = await request.json().catch(() => null);
    const { reactToMeal, REACTION_EMOJIS } = await import("@/lib/meal-reactions");
    if (!body?.mealLogId || !REACTION_EMOJIS.includes(body?.emoji)) {
      return NextResponse.json({ error: "mealLogId and a valid emoji are required" }, { status: 400 });
    }
    const result = await reactToMeal({
      supabase: auth.supabase,
      admin: createServiceClient(),
      reactorProfileId: auth.user.id,
      contactId: path[1],
      mealLogId: body.mealLogId,
      emoji: body.emoji,
    });
    if (result.error) return NextResponse.json(result, { status: 400 });
    return NextResponse.json(result);
  }

  if (path.length !== 1 || path[0] !== "contacts") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });

  const workspace = await getOrCreateAdultsWorkspace(auth.user.id);
  const result = await addContact(workspace.id, auth.user.id, body, auth.supabase, workspace.plan);
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

  // Contact avatar upload — multipart/form-data (a real image file), not
  // JSON like every other branch here. Mirrors the main web app's
  // /api/adults/contacts/[contactId]?resource=avatar handler.
  if (path.length === 3 && path[0] === "contacts" && path[2] === "avatar") {
    const { data: owned } = await auth.supabase
      .from("adults_contacts")
      .select("id")
      .eq("id", path[1])
      .eq("caregiver_id", auth.user.id)
      .maybeSingle();
    if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const formData = await request.formData().catch(() => null);
    const file = formData?.get("photo");
    if (!(file instanceof File)) return NextResponse.json({ error: "No photo provided" }, { status: 400 });
    if (!file.type.startsWith("image/")) return NextResponse.json({ error: "File must be an image" }, { status: 400 });
    if (file.size > 8 * 1024 * 1024) return NextResponse.json({ error: "Image is too large (max 8MB)" }, { status: 400 });

    const extension = file.type.split("/")[1]?.replace("jpeg", "jpg") || "jpg";
    const avatarPath = `${path[1]}/${Date.now()}.${extension}`;

    const admin = createServiceClient();
    const { error: uploadError } = await admin.storage
      .from(CONTACT_AVATARS_BUCKET)
      .upload(avatarPath, file, { contentType: file.type, upsert: false });
    if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 400 });

    const { error: updateError } = await admin.from("adults_contacts").update({ photo_url: avatarPath }).eq("id", path[1]);
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 400 });

    const photoUrl = await resolveSignedContactAvatarUrl(admin, avatarPath);
    return NextResponse.json({ photoUrl });
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

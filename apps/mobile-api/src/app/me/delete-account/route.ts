import { NextRequest, NextResponse } from "next/server";
import { getUserFromBearerToken, createServiceClient } from "@/lib/supabase";

export const runtime = "edge";

// POST /me/delete-account — deletes the signed-in user's account.
//
// Required by App Store guideline 5.1.1(v): an app that lets someone create
// an account must let them delete it from inside the app.
//
// Two things make this harder than a DELETE:
//
//  1. Deleting the auth user CASCADES to profiles, and fifteen tables
//     reference profiles WITHOUT cascade. Any one of them blocks the whole
//     operation — a real deletion failed on whatsapp_invites, returning a
//     bare 500 after the person's data had already gone.
//
//  2. bookings and club_payments reference profiles with RESTRICT on
//     purpose: the privacy policy commits to keeping billing records for
//     seven years. For anyone who has ever paid, the profile row therefore
//     CANNOT be removed.
//
// So this deletes what it can and anonymises what it must, and decides
// which by trying rather than by consulting a list of foreign keys — the
// list is what proved incomplete.

/** Rows the person owns outright, safe to remove, that would otherwise
 * block the profile delete. Not exhaustive by design: anything missed
 * falls through to anonymisation rather than failing. */
const OWNED_REFERENCES: Array<[table: string, column: string]> = [
  ["whatsapp_invites", "created_by_user_id"],
  ["meal_reactions", "reactor_profile_id"],
  ["club_attendees", "client_profile_id"],
  ["push_tokens", "profile_id"],
];

export async function POST(request: NextRequest) {
  const auth = await getUserFromBearerToken(request);
  if (!auth) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (body?.confirm !== "DELETE") {
    return NextResponse.json(
      { error: "Confirmation missing. This endpoint permanently deletes an account." },
      { status: 400 }
    );
  }

  const admin = createServiceClient();
  const userId = auth.user.id;

  try {
    // 1. The person's own content. Meal photos first — they are the most
    //    sensitive thing here and must not survive a partial failure later.
    const { data: workspaces } = await admin.from("workspaces").select("id").eq("owner_id", userId);
    const workspaceIds = (workspaces ?? []).map((w: { id: string }) => w.id);

    if (workspaceIds.length > 0) {
      const { data: contacts } = await admin
        .from("adults_contacts")
        .select("id")
        .in("workspace_id", workspaceIds);
      const contactIds = (contacts ?? []).map((c: { id: string }) => c.id);

      if (contactIds.length > 0) {
        await admin.from("meal_logs").delete().in("adults_contact_id", contactIds);
        await admin.from("whatsapp_conversations").delete().in("adults_contact_id", contactIds);
        await admin.from("adults_contacts").delete().in("id", contactIds);
      }
      await admin.from("workspaces").delete().in("id", workspaceIds);
    }

    for (const [table, column] of OWNED_REFERENCES) {
      await admin.from(table).delete().eq(column, userId);
    }

    // 2. Try the clean removal.
    const { error: profileError } = await admin.from("profiles").delete().eq("id", userId);

    if (!profileError) {
      const { error: authError } = await admin.auth.admin.deleteUser(userId);
      if (authError) {
        return NextResponse.json(
          { error: "Your data was removed but the login could not be deleted. Please contact support." },
          { status: 500 }
        );
      }
      return NextResponse.json({ ok: true, mode: "deleted" });
    }

    // 3. Something still references the profile — in practice a booking or
    //    a payment we are required to keep. Anonymise instead: nothing
    //    personal remains, the account cannot be signed into, and the
    //    financial records keep the referential integrity they need.
    //
    //    23503 is foreign_key_violation. Any other failure is a real error
    //    and is reported as one rather than quietly downgraded.
    if (profileError.code !== "23503") {
      return NextResponse.json({ error: profileError.message }, { status: 500 });
    }

    const redacted = `deleted-${userId}@deleted.invalid`;
    const { error: scrubError } = await admin
      .from("profiles")
      .update({
        email: redacted,
        full_name: "Deleted account",
        phone: null,
        avatar_url: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId);
    if (scrubError) return NextResponse.json({ error: scrubError.message }, { status: 500 });

    // The login has to stop working. The email is changed so it cannot be
    // recovered by a password reset, and the account is banned so the
    // existing session and any cached credential are dead.
    const { error: authScrubError } = await admin.auth.admin.updateUserById(userId, {
      email: redacted,
      password: crypto.randomUUID() + crypto.randomUUID(),
      ban_duration: "876000h", // 100 years
      user_metadata: {},
    });
    if (authScrubError) {
      return NextResponse.json(
        { error: "Your data was removed but the login could not be closed. Please contact support." },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, mode: "anonymised" });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not delete the account." },
      { status: 500 }
    );
  }
}

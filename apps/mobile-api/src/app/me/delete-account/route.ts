import { NextRequest, NextResponse } from "next/server";
import { getUserFromBearerToken, createServiceClient } from "@/lib/supabase";

export const runtime = "edge";

// POST /me/delete-account — deletes the signed-in user's account.
//
// Required by App Store guideline 5.1.1(v): an app that lets someone
// create an account must let them delete it from inside the app. Until now
// deletion was a mailto: link on the website, which does not satisfy that
// and is a poor experience besides.
//
// Deletes rather than flags. A "deactivated" row that still holds meal
// photos, a child's date of birth and health notes is not deletion, and
// saying otherwise in the app would be untrue.
//
// One deliberate exception, which the privacy policy already states:
// billing and transaction records are retained for up to seven years to
// meet accounting obligations. Those live in club_payments and workspace
// billing fields, are keyed by ids rather than by the person, and are not
// touched here.
//
// The auth user is deleted LAST. Everything else is reachable from it, so
// removing it first would strand the rest with no way for the person to
// reach it again.

export async function POST(request: NextRequest) {
  const auth = await getUserFromBearerToken(request);
  if (!auth) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  // Typed confirmation, forwarded from the app. Guards against a mis-tap
  // reaching an irreversible endpoint, and against any future caller
  // invoking this by accident.
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
    // Workspaces this person owns. Their contacts and everything hanging
    // off them go with the workspace.
    const { data: workspaces } = await admin
      .from("workspaces")
      .select("id")
      .eq("owner_id", userId);
    const workspaceIds = (workspaces ?? []).map((w: { id: string }) => w.id);

    if (workspaceIds.length > 0) {
      const { data: contacts } = await admin
        .from("adults_contacts")
        .select("id")
        .in("workspace_id", workspaceIds);
      const contactIds = (contacts ?? []).map((c: { id: string }) => c.id);

      if (contactIds.length > 0) {
        // Meal logs carry the photos, which are the most sensitive thing
        // here — they go before the rows that point at them.
        await admin.from("meal_logs").delete().in("adults_contact_id", contactIds);
        await admin.from("whatsapp_conversations").delete().in("adults_contact_id", contactIds);
        await admin.from("adults_contacts").delete().in("id", contactIds);
      }
      await admin.from("workspaces").delete().in("id", workspaceIds);
    }

    // Anything keyed directly to the person rather than to a workspace.
    await admin.from("push_tokens").delete().eq("profile_id", userId);
    await admin.from("club_attendees").delete().eq("client_profile_id", userId);
    await admin.from("profiles").delete().eq("id", userId);

    // Last: the auth user itself. Once this is gone the session is dead and
    // the account cannot be signed into again.
    const { error: authError } = await admin.auth.admin.deleteUser(userId);
    if (authError) {
      return NextResponse.json(
        { error: "Your data was removed but the login could not be deleted. Please contact support." },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not delete the account." },
      { status: 500 }
    );
  }
}

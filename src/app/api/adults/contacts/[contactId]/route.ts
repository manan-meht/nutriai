import { NextRequest, NextResponse } from "next/server";
import { updateContact } from "@/app/(adults)/adults/dashboard/actions";

export const runtime = "edge";

// Plain HTTP route instead of a Server Action — Server Actions on this
// deployment (Cloudflare Pages via @cloudflare/next-on-pages) intermittently
// fail with "Server Action ... was not found on the server" because
// different edge instances serving the same deployment can disagree on the
// action's encryption key/manifest. A regular fetch-based route sidesteps
// that mechanism entirely.
//
// Used to also update a separate adults_contact_goals row via a nested
// `body.goal` (upsertContactGoal) — that table's replaced entirely by the
// Food Balance Score's primary_nutrition_goal + profile fields, which are
// now just plain columns on the contact itself, so updateContact alone
// covers it.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ contactId: string }> }) {
  const { contactId } = await params;
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });

  try {
    const contactRes = await updateContact(contactId, body);
    if (contactRes.error) return NextResponse.json(contactRes, { status: 400 });

    return NextResponse.json({});
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Something went wrong. Please try again." },
      { status: 401 }
    );
  }
}

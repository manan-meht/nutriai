import { NextRequest, NextResponse } from "next/server";
import { updateContact, upsertContactGoal } from "@/app/(adults)/adults/dashboard/actions";

export const runtime = "edge";

// Plain HTTP route instead of a Server Action — Server Actions on this
// deployment (Cloudflare Pages via @cloudflare/next-on-pages) intermittently
// fail with "Server Action ... was not found on the server" because
// different edge instances serving the same deployment can disagree on the
// action's encryption key/manifest. A regular fetch-based route sidesteps
// that mechanism entirely.
//
// Contact fields and the goal are updated in one PATCH (goal nested under
// `body.goal`) rather than two separate routes — each distinct route file
// costs ~1.5MB of near-fixed framework overhead in the compiled Cloudflare
// Worker (see next-on-pages build output), which is what pushed the Worker
// over Cloudflare's 25MB size limit and caused deploys to fail silently.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ contactId: string }> }) {
  const { contactId } = await params;
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });

  try {
    const { goal, ...contactFields } = body;

    const contactRes = await updateContact(contactId, contactFields);
    if (contactRes.error) return NextResponse.json(contactRes, { status: 400 });

    if (goal) {
      const goalRes = await upsertContactGoal(contactId, goal);
      if (goalRes.error) return NextResponse.json(goalRes, { status: 400 });
    }

    return NextResponse.json({});
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Something went wrong. Please try again." },
      { status: 401 }
    );
  }
}

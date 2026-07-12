import { NextRequest, NextResponse } from "next/server";
import { updateClient } from "@/app/(gym)/gym/dashboard/actions";

export const runtime = "edge";

// Plain HTTP route instead of a Server Action — same reasoning as
// src/app/api/adults/contacts/[contactId]/route.ts (Server Actions on this
// Cloudflare Pages deployment intermittently fail with "Server Action ...
// was not found on the server"). First edit path for a gym client — it
// previously only supported add.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });

  try {
    const result = await updateClient(clientId, body);
    if (result.error) return NextResponse.json(result, { status: 400 });

    return NextResponse.json({});
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Something went wrong. Please try again." },
      { status: 401 }
    );
  }
}

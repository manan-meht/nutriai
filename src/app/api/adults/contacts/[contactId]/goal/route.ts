import { NextRequest, NextResponse } from "next/server";
import { upsertContactGoal } from "@/app/(adults)/adults/dashboard/actions";

export const runtime = "edge";

export async function POST(request: NextRequest, { params }: { params: Promise<{ contactId: string }> }) {
  const { contactId } = await params;
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });

  try {
    const result = await upsertContactGoal(contactId, body);
    if (result.error) return NextResponse.json(result, { status: 400 });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Something went wrong. Please try again." },
      { status: 401 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { getOrCreateFamilyInvite, regenerateFamilyInvite, revokeFamilyInvite, markFamilyInviteLinkOpened } from "@/app/(adults)/adults/dashboard/actions";

export const runtime = "edge";

// GET/PATCH/DELETE are combined into one route file rather than split
// across separate paths (e.g. a /regenerate sub-route) — each distinct
// route file costs ~1.5MB of near-fixed framework overhead in the compiled
// Cloudflare Worker (see next-on-pages build output), which is what pushed
// the Worker over Cloudflare's 25MB size limit and caused deploys to fail
// silently. Consolidating routes keeps the function count down.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ contactId: string }> }) {
  const { contactId } = await params;
  const result = await getOrCreateFamilyInvite(contactId);
  if ("error" in result) return NextResponse.json(result, { status: 400 });
  return NextResponse.json(result);
}

export async function PATCH(_request: NextRequest, { params }: { params: Promise<{ contactId: string }> }) {
  const { contactId } = await params;
  const result = await regenerateFamilyInvite(contactId);
  if ("error" in result) return NextResponse.json(result, { status: 400 });
  return NextResponse.json(result);
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ contactId: string }> }) {
  const { contactId } = await params;
  const result = await revokeFamilyInvite(contactId);
  if ("error" in result) return NextResponse.json(result, { status: 400 });
  return NextResponse.json(result);
}

export async function POST(_request: NextRequest, { params }: { params: Promise<{ contactId: string }> }) {
  const { contactId } = await params;
  const result = await markFamilyInviteLinkOpened(contactId);
  if ("error" in result) return NextResponse.json(result, { status: 400 });
  return NextResponse.json(result);
}

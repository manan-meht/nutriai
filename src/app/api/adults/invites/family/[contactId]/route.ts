import { NextRequest, NextResponse } from "next/server";
import { getOrCreateFamilyInvite, revokeFamilyInvite } from "@/app/(adults)/adults/dashboard/actions";

export const runtime = "edge";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ contactId: string }> }) {
  const { contactId } = await params;
  const result = await getOrCreateFamilyInvite(contactId);
  if ("error" in result) return NextResponse.json(result, { status: 400 });
  return NextResponse.json(result);
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ contactId: string }> }) {
  const { contactId } = await params;
  const result = await revokeFamilyInvite(contactId);
  if ("error" in result) return NextResponse.json(result, { status: 400 });
  return NextResponse.json(result);
}

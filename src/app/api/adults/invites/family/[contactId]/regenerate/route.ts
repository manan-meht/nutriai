import { NextRequest, NextResponse } from "next/server";
import { regenerateFamilyInvite } from "@/app/(adults)/adults/dashboard/actions";

export async function POST(_request: NextRequest, { params }: { params: Promise<{ contactId: string }> }) {
  const { contactId } = await params;
  const result = await regenerateFamilyInvite(contactId);
  if ("error" in result) return NextResponse.json(result, { status: 400 });
  return NextResponse.json(result);
}

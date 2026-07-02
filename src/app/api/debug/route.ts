import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "edge";

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const testPhone = url.searchParams.get("phone") ?? "6597268559";

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const waToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const waPhone = process.env.WHATSAPP_PHONE_NUMBER_ID;

  const db = createClient(supabaseUrl, serviceKey);

  // Check gym_clients phone lookup
  let clientLookup: any = { error: null, found: false, stored: null, normalized: null };
  try {
    const { data, error } = await db
      .from("gym_clients")
      .select("id, full_name, whatsapp_number")
      .order("created_at", { ascending: false });
    if (error) {
      clientLookup.error = error.message;
    } else {
      const match = (data ?? []).find((c: any) =>
        normalizePhone(c.whatsapp_number ?? "") === normalizePhone(testPhone)
      );
      clientLookup.found = !!match;
      clientLookup.name = match?.full_name ?? null;
      clientLookup.stored = match?.whatsapp_number ?? null;
      clientLookup.storedNormalized = match ? normalizePhone(match.whatsapp_number ?? "") : null;
      clientLookup.queryNormalized = normalizePhone(testPhone);
      clientLookup.totalClients = data?.length ?? 0;
    }
  } catch (e: any) {
    clientLookup.error = e.message;
  }

  // Check whatsapp_conversations table
  let convTable: any = { exists: false, error: null };
  try {
    const { error } = await db.from("whatsapp_conversations").select("id").limit(1);
    convTable.exists = !error;
    convTable.error = error?.message ?? null;
  } catch (e: any) {
    convTable.error = e.message;
  }

  // Test WhatsApp send capability (just check the token, don't actually send)
  let waStatus: any = { tokenSet: !!waToken, phoneSet: !!waPhone };
  try {
    const res = await fetch(`https://graph.facebook.com/v20.0/${waPhone}`, {
      headers: { Authorization: `Bearer ${waToken}` },
    });
    const body = await res.json();
    waStatus.tokenValid = res.ok;
    waStatus.phoneDisplay = body.display_phone_number ?? body.error?.message ?? "unknown";
  } catch (e: any) {
    waStatus.tokenValid = false;
    waStatus.fetchError = e.message;
  }

  return NextResponse.json({ clientLookup, convTable, waStatus });
}

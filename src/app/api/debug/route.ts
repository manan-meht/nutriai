import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { GoogleGenerativeAI } from "@google/generative-ai";

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
  const geminiKey = process.env.GEMINI_API_KEY;

  const db = createClient(supabaseUrl, serviceKey);

  // Check gym_clients phone lookup
  let clientLookup: any = {};
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
      clientLookup.totalClients = data?.length ?? 0;
    }
  } catch (e: any) {
    clientLookup.error = e.message;
  }

  // Check whatsapp_conversations table
  let convTable: any = {};
  try {
    const { error } = await db.from("whatsapp_conversations").select("id").limit(1);
    convTable.exists = !error;
    convTable.error = error?.message ?? null;
  } catch (e: any) {
    convTable.error = e.message;
  }

  // Test WhatsApp token
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

  // Test Gemini
  let geminiStatus: any = { keySet: !!geminiKey };
  try {
    const genAI = new GoogleGenerativeAI(geminiKey!);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const result = await model.generateContent("Say the single word: OK");
    geminiStatus.ok = true;
    geminiStatus.response = result.response.text().trim().slice(0, 50);
  } catch (e: any) {
    geminiStatus.ok = false;
    geminiStatus.error = e.message;
  }

  return NextResponse.json({ clientLookup, convTable, waStatus, geminiStatus });
}

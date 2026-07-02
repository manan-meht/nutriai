import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "edge";

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const waToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const waPhone = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const gemini = process.env.GEMINI_API_KEY;

  let supabaseOk = false;
  let supabaseError = "";
  try {
    const db = createClient(supabaseUrl!, serviceKey!);
    const { error } = await db.from("gym_clients").select("id").limit(1);
    supabaseOk = !error;
    supabaseError = error?.message ?? "";
  } catch (e: any) {
    supabaseError = e.message;
  }

  return NextResponse.json({
    env: {
      supabaseUrl: supabaseUrl ? "set" : "MISSING",
      serviceKey: serviceKey ? "set" : "MISSING",
      waToken: waToken ? "set" : "MISSING",
      waPhone: waPhone ? "set" : "MISSING",
      gemini: gemini ? "set" : "MISSING",
    },
    supabase: { ok: supabaseOk, error: supabaseError },
  });
}

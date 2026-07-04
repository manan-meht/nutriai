export const runtime = "edge";

import { createClient } from "@/lib/supabase/server";
import { resolveProductFromHostnameOnly } from "@/lib/product/resolve-product";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  await supabase.auth.signOut();

  const url = new URL(request.url);
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? url.origin;
  const product = resolveProductFromHostnameOnly(url.hostname) ?? "gym";
  const loginPath = product === "adults" ? "/adults/login" : "/gym/login";

  // Explicit 303 (See Other) — without it, NextResponse.redirect defaults to
  // 307, which preserves the original POST method, so the browser would
  // replay this as a POST to the login page (a GET-only page route) and
  // get a 405 back.
  return NextResponse.redirect(new URL(loginPath, origin), 303);
}

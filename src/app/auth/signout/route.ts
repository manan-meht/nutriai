export const runtime = "edge";

import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function POST(request: Request) {
  const supabase = await createClient();
  await supabase.auth.signOut();

  const url = new URL(request.url);
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? url.origin;
  // The sign-out form always posts to the shared /auth/signout path, so the
  // request's own URL/hostname carries no product signal (this app serves
  // both products from one shared domain, distinguished by path). Use the
  // tistra_last_product cookie middleware already sets whenever a user
  // visits /adults/dashboard or /gym/dashboard instead.
  const lastProduct = (await cookies()).get("tistra_last_product")?.value;
  const loginPath = lastProduct === "adults" ? "/adults/login" : "/gym/login";

  // Explicit 303 (See Other) — without it, NextResponse.redirect defaults to
  // 307, which preserves the original POST method, so the browser would
  // replay this as a POST to the login page (a GET-only page route) and
  // get a 405 back.
  return NextResponse.redirect(new URL(loginPath, origin), 303);
}

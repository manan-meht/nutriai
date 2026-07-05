export const runtime = "edge";

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getDashboardHrefForUser } from "@/lib/product/dashboard-href";

// Tiny, shared edge function so /family, /coach, /me can stay static
// (no per-request cookie/auth check baked into the page itself, which
// would force them into the much larger edge-function bundle bucket —
// see the Cloudflare Pages Functions 25 MiB total-bundle limit). The
// marketing homepage ("/") was already dynamic before this feature for
// unrelated reasons (experiments, cookies) and still resolves this
// server-side directly; this route exists only for the static pages.
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ href: null });
  const href = await getDashboardHrefForUser(user.id);
  return NextResponse.json({ href });
}

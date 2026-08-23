import { createClient } from "@supabase/supabase-js";

/**
 * Grants a workspace room for N people.
 *
 *   npx tsx scripts/grant-capacity.ts someone@example.com 5
 *
 * Capacity lives on the workspace, not the person, so this cannot run
 * before someone has signed up — there is nothing to grant against. Run it
 * after they create their account.
 *
 * The enforcement is a database trigger (migration 0010): the effective
 * limit is a base of 2 for a family plan, 1 for a self plan, plus
 * workspaces.extra_capacity. So this works out the extra needed to reach
 * the total asked for rather than making the caller do that arithmetic —
 * setting extra_capacity to 5 would silently give 7.
 *
 * Note the billing whitelist is a SEPARATE thing
 * (BILLING_TEST_WHITELIST_EMAILS): it waives payment, not the person
 * limit. Someone needs both to have a free account with room for a family.
 */

const BASE_BY_PLAN: Record<string, number> = { self: 1, family: 2, coach: 2 };

async function main() {
  const [email, totalRaw] = process.argv.slice(2);
  if (!email || !totalRaw) {
    console.error("usage: npx tsx scripts/grant-capacity.ts <email> <total people>");
    process.exit(1);
  }
  const total = Number(totalRaw);
  if (!Number.isInteger(total) || total < 1) {
    console.error("total people must be a whole number of 1 or more");
    process.exit(1);
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Adults email/password signup stores the address with a
  // "+nutriai-adults" tag (see scopedEmail in src/lib/auth.ts), so an exact
  // match on what a person tells you their email is will miss them.
  const local = email.split("@")[0].split("+")[0];
  const domain = email.split("@")[1];
  const { data: profiles, error } = await admin
    .from("profiles")
    .select("id, email")
    .ilike("email", `${local}%@${domain}`);
  if (error) throw new Error(error.message);

  if (!profiles || profiles.length === 0) {
    console.log(`  No account for ${email} yet — nothing to grant against.`);
    console.log(`  Run this again once they have signed up.`);
    return;
  }

  for (const profile of profiles) {
    const { data: workspaces } = await admin
      .from("workspaces")
      .select("id, plan, extra_capacity, type")
      .eq("owner_id", profile.id);

    if (!workspaces || workspaces.length === 0) {
      console.log(`  ${profile.email}: account exists but owns no workspace yet.`);
      continue;
    }

    for (const ws of workspaces) {
      const base = BASE_BY_PLAN[ws.plan] ?? 2;
      const extra = Math.max(0, total - base);
      const { error: updateError } = await admin
        .from("workspaces")
        .update({ extra_capacity: extra })
        .eq("id", ws.id);
      if (updateError) {
        console.log(`  ${profile.email}: FAILED — ${updateError.message}`);
        continue;
      }
      console.log(
        `  ${profile.email} (${ws.plan}): base ${base} + extra ${extra} = ${base + extra} people` +
          (ws.extra_capacity !== extra ? `  [was ${base + (ws.extra_capacity ?? 0)}]` : "  [unchanged]")
      );
    }
  }
}

main().catch((e) => {
  console.error("  error:", e instanceof Error ? e.message : e);
  process.exit(1);
});

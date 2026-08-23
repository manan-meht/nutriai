import fs from "fs";
import path from "path";

// In-app account deletion, required by App Store guideline 5.1.1(v).
//
// Before this the app had no account screen at all and the website offered
// only a mailto: link. A deletion route that exists but cannot be reached
// from the app fails the guideline as surely as none at all, so reachability
// is asserted here too.

const repo = (p: string) => fs.readFileSync(path.join(__dirname, "..", "..", p), "utf-8");
const code = (p: string) => repo(p).replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");

const SCREEN = "apps/mobile/src/app/(app)/account.tsx";
const ROUTE = "apps/mobile-api/src/app/me/delete-account/route.ts";
const DASHBOARD = "apps/mobile/src/app/(app)/adults/index.tsx";

describe("a reviewer can find it", () => {
  it("is linked from the dashboard the app opens on", () => {
    expect(code(DASHBOARD)).toMatch(/router\.push\('\/account'\)/);
  });

  it("the screen exists at that route", () => {
    expect(fs.existsSync(path.join(__dirname, "..", "..", SCREEN))).toBe(true);
  });
});

describe("deletion is deliberate, not a mis-tap", () => {
  it("requires the word DELETE to be typed", () => {
    const t = code(SCREEN);
    expect(t).toMatch(/confirm\.trim\(\)\.toUpperCase\(\) === 'DELETE'/);
  });

  it("asks again in a native alert before calling", () => {
    expect(code(SCREEN)).toMatch(/Alert\.alert\(/);
    expect(code(SCREEN)).toMatch(/style: 'destructive'/);
  });

  it("the endpoint refuses without the confirmation too", () => {
    // Defence in depth: the guard cannot live only in the UI.
    expect(code(ROUTE)).toMatch(/body\?\.confirm !== "DELETE"/);
  });

  it("tells the person what goes before offering the control", () => {
    const t = code(SCREEN);
    const warning = t.indexOf("permanently deletes");
    const button = t.indexOf("Delete my account");
    expect(warning).toBeGreaterThan(-1);
    expect(warning).toBeLessThan(button);
  });
});

describe("it survives the foreign keys that reference a profile", () => {
  // Deleting the auth user CASCADES to profiles, and fifteen tables
  // reference profiles WITHOUT cascade. Any one blocks the whole thing —
  // a real deletion failed on whatsapp_invites and returned a bare 500
  // after the person's data had already gone.
  it("clears the references it owns before trying", () => {
    const t = code(ROUTE);
    expect(t).toMatch(/OWNED_REFERENCES/);
    expect(t).toMatch(/\["whatsapp_invites", "created_by_user_id"\]/);
    expect(t).toMatch(/\["meal_reactions", "reactor_profile_id"\]/);
  });

  it("decides by trying, not by consulting a list of foreign keys", () => {
    // The list is what proved incomplete; anything missed has to fall
    // through to anonymisation rather than fail.
    const t = code(ROUTE);
    expect(t).toMatch(/const \{ error: profileError \} = await admin\.from\("profiles"\)\.delete\(\)/);
    expect(t).toMatch(/if \(profileError\.code !== "23503"\)/);
  });

  it("reports a non-FK failure as a real error", () => {
    // Downgrading every failure to "anonymised" would hide genuine bugs.
    const t = code(ROUTE);
    const branch = t.slice(t.indexOf('profileError.code !== "23503"'));
    expect(branch.slice(0, 200)).toMatch(/status: 500/);
  });
});

describe("when billing records must be kept", () => {
  // bookings and club_payments reference profiles with RESTRICT on
  // purpose: the privacy policy commits to seven years of retention. For
  // anyone who has ever paid, the profile row cannot be removed at all.
  it("anonymises rather than leaving personal data in place", () => {
    const t = code(ROUTE);
    expect(t).toMatch(/full_name: "Deleted account"/);
    expect(t).toMatch(/phone: null/);
    expect(t).toMatch(/avatar_url: null/);
    expect(t).toMatch(/deleted-\$\{userId\}@deleted\.invalid/);
  });

  it("closes the login so the account cannot be used again", () => {
    // Scrubbing the row alone would leave a working sign-in.
    const t = code(ROUTE);
    expect(t).toMatch(/ban_duration: "876000h"/);
    expect(t).toMatch(/password: crypto\.randomUUID/);
  });

  it("changes the auth email too, so a password reset cannot recover it", () => {
    const t = code(ROUTE);
    const scrub = t.slice(t.indexOf("updateUserById"));
    expect(scrub.slice(0, 200)).toMatch(/email: redacted/);
  });

  it("tells the caller which path ran", () => {
    const t = code(ROUTE);
    expect(t).toMatch(/mode: "deleted"/);
    expect(t).toMatch(/mode: "anonymised"/);
  });
});

describe("it actually deletes", () => {
  it("removes data rather than flagging a row", () => {
    // A "deactivated" account still holding meal photos and a child's
    // date of birth is not deletion.
    const t = code(ROUTE);
    expect(t).toMatch(/\.from\("meal_logs"\)\.delete\(\)/);
    expect(t).toMatch(/\.from\("adults_contacts"\)\.delete\(\)/);
    expect(t).toMatch(/\.from\("profiles"\)\.delete\(\)/);
    expect(t).not.toMatch(/deleted_at:/);
  });

  it("deletes the auth user only after the profile row is gone", () => {
    // The cascade runs the other way, so attempting auth deletion first
    // fails with an opaque 500 while any RESTRICT reference remains.
    const t = code(ROUTE);
    expect(t.indexOf("auth.admin.deleteUser")).toBeGreaterThan(t.indexOf('from("profiles").delete()'));
  });

  it("keeps billing records, as the privacy policy states", () => {
    const t = code(ROUTE);
    expect(t).not.toMatch(/from\("club_payments"\)\.delete/);
    expect(code(SCREEN)).toMatch(/seven years/);
  });

  it("signs out locally once the account is gone", () => {
    // Otherwise the app sits on a token for an account that no longer
    // exists.
    expect(code(SCREEN)).toMatch(/supabase\.auth\.signOut\(\)/);
  });

  it("is authenticated, and scoped to the caller", () => {
    const t = code(ROUTE);
    expect(t).toMatch(/getUserFromBearerToken\(request\)/);
    expect(t).toMatch(/const userId = auth\.user\.id/);
    expect(t).not.toMatch(/body\?\.userId/);
  });
});

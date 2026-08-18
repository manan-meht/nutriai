import fs from "fs";
import path from "path";

// Guards the Aug 2026 production outage: NEXT_PUBLIC_* values are inlined
// by Next.js at BUILD time, so runtime secrets (wrangler secret put) never
// reach the client bundle. Workers Builds CI had none of them set, and
// createBrowserClient() got undefined — crashing hydration on every page
// with a browser Supabase client, i.e. every web login, on all products.
//
// The server rendered perfectly throughout, which is why HTTP checks,
// asset checks, DNS checks and redirect checks all passed while real users
// saw a blank failure. The only durable defence is asserting the build
// inputs exist.
const ENV_PRODUCTION = path.join(__dirname, "..", "..", ".env.production");

/** Values without which the client bundle cannot function at all. */
const REQUIRED_AT_BUILD = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
];

describe("build-time public environment", () => {
  it(".env.production is committed (CI has no .env.local)", () => {
    expect(fs.existsSync(ENV_PRODUCTION)).toBe(true);
  });

  const contents = fs.existsSync(ENV_PRODUCTION) ? fs.readFileSync(ENV_PRODUCTION, "utf-8") : "";

  it.each(REQUIRED_AT_BUILD)("%s is defined with a non-empty value", (key) => {
    const line = contents.split("\n").find((l) => l.startsWith(`${key}=`));
    expect(line).toBeDefined();
    expect((line ?? "").slice(key.length + 1).trim()).not.toBe("");
  });

  it("contains only NEXT_PUBLIC_ values — nothing secret ships in the bundle", () => {
    const keys = contents
      .split("\n")
      .filter((l) => l.trim() && !l.trim().startsWith("#") && l.includes("="))
      .map((l) => l.slice(0, l.indexOf("=")).trim());
    expect(keys.length).toBeGreaterThan(0);
    expect(keys.filter((k) => !k.startsWith("NEXT_PUBLIC_"))).toEqual([]);
  });
});

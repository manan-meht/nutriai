import fs from "fs";
import path from "path";

// Recovering from a deploy that happens while someone has the app open.
//
// Next.js content-hashes Server Action ids per build, so every release
// invalidates the ids held by any already-open page. A real user hit this
// mid-task — three deploys inside eight minutes — and the app showed her a
// dead end whose "Try again" button could not work.

const src = (p: string) => fs.readFileSync(path.join(__dirname, "..", p), "utf-8");
const code = (p: string) => src(p).replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
const BOUNDARY = "app/error.tsx";

describe("it recognises a stale deployment", () => {
  it("matches the errors Next.js raises for a missing action", () => {
    const t = code(BOUNDARY);
    expect(t).toMatch(/Failed to find Server Action/i);
    expect(t).toMatch(/from an older or newer deployment/i);
  });

  it("checks the digest as well as the message", () => {
    // Production omits the message; the digest is sometimes all there is.
    expect(code(BOUNDARY)).toMatch(/error\.message \?\? ""\}\s*\$\{error\.digest/);
  });
});

describe("it reloads rather than retrying", () => {
  it("does not call reset for a stale deployment", () => {
    // reset() re-renders the SAME stale bundle and fails again, which is
    // why the original button could not work.
    const t = code(BOUNDARY);
    expect(t).toMatch(/onClick=\{stale \? \(\) => window\.location\.reload\(\) : reset\}/);
  });

  it("reloads automatically, once", () => {
    const t = code(BOUNDARY);
    expect(t).toMatch(/window\.location\.reload\(\)/);
    expect(t).toMatch(/sessionStorage\.getItem\(KEY\)/);
    expect(t).toMatch(/sessionStorage\.setItem\(KEY/);
  });

  it("cannot loop on a page that is genuinely broken", () => {
    // The guard is the difference between recovery and a reload cycle the
    // user cannot escape.
    const t = code(BOUNDARY);
    const effect = t.slice(t.indexOf("if (!stale || reloading) return;"));
    expect(effect).toMatch(/if \(sessionStorage\.getItem\(KEY\)\) return;/);
  });

  it("still works when storage is blocked", () => {
    // Private browsing throws on sessionStorage; falling through to the
    // manual button beats crashing inside the error boundary.
    const t = code(BOUNDARY);
    expect(t).toMatch(/catch \{[\s\S]{0,120}return;/);
  });

  it("clears the guard once a page renders normally", () => {
    // Otherwise the first stale deploy consumes the only auto-recovery
    // this session ever gets.
    expect(code(BOUNDARY)).toMatch(/sessionStorage\.removeItem\("tistra:stale-deploy-reload"\)/);
  });
});

describe("what the person is told", () => {
  it("says the app was updated, not that something went wrong", () => {
    const t = code(BOUNDARY);
    expect(t).toMatch(/Tistra was just updated/);
    expect(t).toMatch(/nothing you entered has been lost from your account/);
  });

  it("keeps the generic message for real errors", () => {
    expect(code(BOUNDARY)).toMatch(/Something went wrong/);
  });
});

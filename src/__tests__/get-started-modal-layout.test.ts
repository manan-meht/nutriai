import fs from "fs";
import path from "path";

// The modal's width and column count must follow how many options it
// actually renders. When the coach option was removed, sign-in kept a
// four-column grid for three options and sign-up a three-column grid for
// two, so each reserved a column nothing filled and the modal came out
// bigger than its contents.

const source = fs.readFileSync(
  path.join(__dirname, "..", "components", "home", "GetStartedModal.tsx"),
  "utf-8"
);

function optionCount(constName: string): number {
  const start = source.indexOf(`const ${constName}`);
  const body = source.slice(start, source.indexOf("];", start));
  // Each option object starts with an href field.
  return (body.match(/^\s{4}href:/gm) ?? []).length;
}

describe("Get Started / Sign in modal sizing", () => {
  it("derives layout from the option count rather than the mode", () => {
    expect(source).toMatch(/LAYOUT\[OPTIONS\.length\]/);
    // The old hardcoded, mode-keyed grid must be gone.
    expect(source).not.toMatch(/mode === "signin" \? "sm:grid-cols-2 lg:grid-cols-4"/);
    expect(source).not.toMatch(/w-full max-w-2xl p-6/);
  });

  it("has a layout defined for every option count it can render", () => {
    const counts = [optionCount("SIGNUP_OPTIONS"), optionCount("SIGNIN_OPTIONS")];
    for (const n of counts) {
      expect(n).toBeGreaterThan(0);
      expect(source).toMatch(new RegExp(`^  ${n}: \\{ grid:`, "m"));
    }
  });

  it("never asks for more columns than there are options", () => {
    const layout = source.slice(source.indexOf("const LAYOUT"), source.indexOf("};", source.indexOf("const LAYOUT")));
    for (const [, count, grid] of layout.matchAll(/^  (\d+): \{ grid: "([^"]+)"/gm)) {
      const columns = [...grid.matchAll(/grid-cols-(\d+)/g)].map((m) => Number(m[1]));
      for (const c of columns) expect(c).toBeLessThanOrEqual(Number(count));
    }
  });
});

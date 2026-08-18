import fs from "fs";
import path from "path";

// Dead-link guard for the Coach OS.
//
// Written after shipping /coach/settings as a 404 while the sidebar, the
// dashboard's "Edit profile" button, AND the redirect for brand-new
// coaches all pointed at it — so the first thing a new coach saw was a
// missing page. Types don't catch this: an href is just a string.
//
// Every internal link in the coach components must resolve to a real route
// file. Dynamic segments (/coach/sessions/${id}) are matched against a
// [param] directory.

const COMPONENTS_DIR = path.join(__dirname, "..", "components", "coach");
const APP_DIR = path.join(__dirname, "..", "app");

function walk(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : [p];
  });
}

/** Every href="..." and href={`...`} literal pointing at an internal path. */
function internalLinks(source: string): string[] {
  const links = new Set<string>();
  for (const m of source.matchAll(/href=(?:"([^"]+)"|\{`([^`]+)`\})/g)) {
    const raw = m[1] ?? m[2] ?? "";
    if (raw.startsWith("/") && !raw.startsWith("//")) links.add(raw.split("?")[0].split("#")[0]);
  }
  return [...links];
}

/** Resolves a URL path to a page file, allowing route groups like (coach)
 * and matching dynamic segments to [param] directories. */
function routeExists(urlPath: string): boolean {
  const segments = urlPath.split("/").filter(Boolean);

  const search = (dir: string, remaining: string[]): boolean => {
    if (!fs.existsSync(dir)) return false;
    if (remaining.length === 0) {
      return ["page.tsx", "page.ts", "route.ts"].some((f) => fs.existsSync(path.join(dir, f)));
    }
    const [head, ...tail] = remaining;
    const entries = fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory());

    for (const e of entries) {
      // Route groups don't consume a URL segment.
      if (e.name.startsWith("(") && e.name.endsWith(")")) {
        if (search(path.join(dir, e.name), remaining)) return true;
      }
    }
    for (const e of entries) {
      const isDynamic = e.name.startsWith("[") && e.name.endsWith("]");
      // A template literal segment (`${id}`) matches only a dynamic dir.
      const isTemplateSegment = head.includes("${");
      const nameMatches = isTemplateSegment ? isDynamic : e.name === head || isDynamic;
      if (nameMatches && search(path.join(dir, e.name), tail)) return true;
    }
    return false;
  };

  return search(APP_DIR, segments);
}

describe("Coach OS internal links resolve to real routes", () => {
  const files = walk(COMPONENTS_DIR).filter((f) => f.endsWith(".tsx"));

  it("finds coach components to check", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files.map((f) => [path.basename(f), f]))("%s has no dead links", (_name, file) => {
    const links = internalLinks(fs.readFileSync(file, "utf-8"));
    const dead = links.filter((l) => !routeExists(l));
    expect(dead).toEqual([]);
  });

  // Sanity: the matcher must be capable of failing, or the suite above is
  // decorative.
  it("detects a genuinely missing route", () => {
    expect(routeExists("/coach/definitely-not-a-real-route")).toBe(false);
    expect(routeExists("/coach/settings")).toBe(true);
  });
});

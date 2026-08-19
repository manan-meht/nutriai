import fs from "fs";
import path from "path";
import { resolveCoachPhoto, isPlaceholderPhoto, PLACEHOLDER_SKILL_SLUGS } from "@/lib/club/placeholder-photos";

const PUBLIC_DIR = path.join(__dirname, "..", "..", "public", "club", "coaches");

describe("placeholder coach photos", () => {
  it("ships an image for every slug it claims to cover", () => {
    const missing = PLACEHOLDER_SKILL_SLUGS.filter((s) => !fs.existsSync(path.join(PUBLIC_DIR, `${s}.webp`)));
    expect(missing).toEqual([]);
  });

  it("never overrides a coach's own photo", () => {
    expect(resolveCoachPhoto("https://storage.test/real.jpg", ["yoga"])).toBe("https://storage.test/real.jpg");
    expect(isPlaceholderPhoto(resolveCoachPhoto("https://storage.test/real.jpg", ["yoga"]))).toBe(false);
  });

  it("matches the coach's own discipline", () => {
    expect(resolveCoachPhoto(null, ["swimming"])).toBe("/club/coaches/swimming.webp");
    expect(resolveCoachPhoto(null, ["muay-thai", "boxing"])).toBe("/club/coaches/muay-thai.webp");
  });

  it("falls back to something rather than nothing for an uncovered skill", () => {
    const url = resolveCoachPhoto(null, ["underwater-basket-weaving"]);
    expect(isPlaceholderPhoto(url)).toBe(true);
    expect(fs.existsSync(path.join(PUBLIC_DIR, path.basename(url!)))).toBe(true);
  });

  it("handles a coach with no skills at all", () => {
    expect(isPlaceholderPhoto(resolveCoachPhoto(null, []))).toBe(true);
  });

  it("records provenance for every shipped image", () => {
    // Anything shipped must be traceable to a licence — see the outage of
    // trust that unattributed stock causes when someone asks "can we use
    // this?" a year later.
    const credits = fs.readFileSync(path.join(PUBLIC_DIR, "CREDITS.md"), "utf-8");
    const shipped = fs.readdirSync(PUBLIC_DIR).filter((f) => f.endsWith(".webp"));
    expect(shipped.length).toBeGreaterThan(0);
    for (const file of shipped) expect(credits).toContain(file);
  });

  it("ships no Unsplash+/Getty images, which are not free-licensed", () => {
    const credits = fs.readFileSync(path.join(PUBLIC_DIR, "CREDITS.md"), "utf-8");
    const rows = credits.split("\n").filter((l) => l.startsWith("| ") && l.includes(".webp"));
    expect(rows.filter((r) => r.includes("Getty Images"))).toEqual([]);
  });
});

describe("placeholder galleries", () => {
  it("gives a coach one image per discipline they teach", () => {
    const { resolveCoachGallery } = require("@/lib/club/placeholder-photos");
    expect(resolveCoachGallery([], null, ["muay-thai", "boxing"])).toEqual([
      "/club/coaches/muay-thai.webp",
      "/club/coaches/boxing.webp",
    ]);
  });

  it("never pads with a discipline the coach does not teach", () => {
    const { resolveCoachGallery } = require("@/lib/club/placeholder-photos");
    const gallery = resolveCoachGallery([], null, ["running"], 3);
    expect(gallery).toEqual(["/club/coaches/running.webp"]);
  });

  it("puts the coach's own photos first and never mixes in stand-ins", () => {
    const { resolveCoachGallery, isPlaceholderPhoto } = require("@/lib/club/placeholder-photos");
    const gallery = resolveCoachGallery(["https://s.test/b.jpg"], "https://s.test/a.jpg", ["yoga"]);
    expect(gallery[0]).toBe("https://s.test/a.jpg");
    expect(gallery.some(isPlaceholderPhoto)).toBe(false);
  });

  it("always returns something to show", () => {
    const { resolveCoachGallery } = require("@/lib/club/placeholder-photos");
    expect(resolveCoachGallery([], null, []).length).toBeGreaterThan(0);
  });
});

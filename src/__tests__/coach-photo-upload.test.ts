import fs from "fs";
import path from "path";
import { MAX_UPLOAD_BYTES, checkUpload } from "@/lib/club/media";

// Replacing a profile photo, which a real coach could not do.
//
// The UI offered "JPG or PNG, up to 8MB" and checkUpload enforced exactly
// that — but Next.js caps a Server Action body at 1MB by default, so the
// request was rejected by the framework before any of our code ran. The
// action threw, the throw escaped the transition, and the coach got a
// full-page "Something went wrong" instead of a message. Every phone photo
// is over 1MB, so replacing a photo was effectively impossible.

const src = (p: string) => fs.readFileSync(path.join(__dirname, "..", p), "utf-8");
const code = (p: string) => src(p).replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
/** Counting occurrences reads the RAW source. Comment-stripping is a regex,
 * not a lexer, and this file contains accept="image/*" — the "/*" inside
 * that string opens a block comment as far as the regex is concerned and
 * swallows the first upload handler whole. Only negative assertions need
 * comments removed; counts do not. */
const raw = src;

const SECTION = "components/coach/CoachPhotoSection.tsx";

describe("the framework limit matches what the UI promises", () => {
  it("allows a body larger than the size we validate at", () => {
    const cfg = code("../next.config.ts");
    const m = cfg.match(/bodySizeLimit: "(\d+)mb"/);
    expect(m).not.toBeNull();
    const limitBytes = Number(m![1]) * 1024 * 1024;
    // Must exceed MAX_UPLOAD_BYTES, with room for multipart overhead —
    // otherwise the 8MB the UI offers is a promise the server breaks.
    expect(limitBytes).toBeGreaterThan(MAX_UPLOAD_BYTES);
  });

  it("still rejects genuinely oversized files with a message", () => {
    const tooBig = { type: "image/jpeg", size: MAX_UPLOAD_BYTES + 1 } as File;
    expect(checkUpload(tooBig)).toEqual({ ok: false, error: "That image is larger than 8MB." });
  });
});

describe("photos are shrunk before they are sent", () => {
  it("both uploads downscale first", () => {
    const t = raw(SECTION);
    expect(t.match(/await downscaleImage\(file\)/g)?.length).toBe(2);
  });

  it("never blocks a coach when the browser cannot decode the image", () => {
    // HEIC from an iPhone is the real case. Returning the original and
    // letting the server decide beats refusing to upload anything.
    const t = code("lib/club/downscale-image.ts");
    expect(t).toMatch(/catch \{\s*return file;/);
    expect(t).toMatch(/if \(!file\.type\.startsWith\("image\/"\)\) return file;/);
  });

  it("applies EXIF rotation, so a portrait photo does not upload sideways", () => {
    expect(code("lib/club/downscale-image.ts")).toMatch(/imageOrientation: "from-image"/);
  });

  it("keeps the original when re-encoding would not help", () => {
    const t = code("lib/club/downscale-image.ts");
    expect(t).toMatch(/if \(blob\.size >= file\.size\) return file|blob\.size >= file\.size\) return file/);
  });
});

describe("a failed upload does not take the page down", () => {
  it("catches the throw in both handlers", () => {
    const t = raw(SECTION);
    // Two uploads, each wrapped. Without this the action's throw reaches
    // the error boundary and replaces the whole settings page.
    // Three: both uploads and the gallery delete. Any unguarded action
    // throw replaces the settings page with the error boundary.
    expect(t.match(/} catch \{/g)?.length).toBe(3);
    expect(t.match(/That photo couldn't be uploaded/g)?.length).toBe(2);
  });

  it("still surfaces the server's own error when there is one", () => {
    expect(raw(SECTION).match(/if \(!result\.ok\) setError\(result\.error\)/g)?.length).toBe(3);
  });
});

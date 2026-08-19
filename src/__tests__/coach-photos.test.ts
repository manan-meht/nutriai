import fs from "fs";
import path from "path";
import { checkUpload, coachMediaPath, MAX_GALLERY_IMAGES, MAX_UPLOAD_BYTES } from "@/lib/club/media";

// "Add a profile photo" is a publish blocker, so until upload existed a
// coach could complete every other step and still be unable to go live.
//
// The bucket is private, which makes one mistake very easy and completely
// silent: handing a stored PATH to a browser instead of a signed URL. It
// renders as a broken image, and only for coaches who actually uploaded —
// so it would never show up while testing with the seeded placeholders.

const src = (p: string) => fs.readFileSync(path.join(__dirname, "..", p), "utf-8");

function fakeFile(type: string, size: number): File {
  return { type, size, name: "x" } as unknown as File;
}

describe("upload validation", () => {
  it("accepts an ordinary photo", () => {
    expect(checkUpload(fakeFile("image/jpeg", 2_000_000))).toEqual({ ok: true });
  });

  it("rejects a non-image", () => {
    expect(checkUpload(fakeFile("application/pdf", 1000)).ok).toBe(false);
  });

  it("rejects something oversized", () => {
    expect(checkUpload(fakeFile("image/png", MAX_UPLOAD_BYTES + 1)).ok).toBe(false);
  });

  it("rejects an empty file", () => {
    expect(checkUpload(fakeFile("image/png", 0)).ok).toBe(false);
  });
});

describe("storage paths", () => {
  it("are namespaced by coach, so one coach cannot write into another's folder", () => {
    const p = coachMediaPath("coach-1", "profile", fakeFile("image/jpeg", 10));
    expect(p.startsWith("coach-1/")).toBe(true);
  });

  it("normalise the extension", () => {
    expect(coachMediaPath("c", "gallery", fakeFile("image/jpeg", 10))).toMatch(/\.jpg$/);
    expect(coachMediaPath("c", "gallery", fakeFile("image/png", 10))).toMatch(/\.png$/);
  });

  it("never collide for two uploads in the same millisecond", () => {
    const a = coachMediaPath("c", "gallery", fakeFile("image/png", 10));
    const b = coachMediaPath("c", "gallery", fakeFile("image/png", 10));
    expect(a).not.toBe(b);
  });
});

describe("private bucket reads are always signed", () => {
  it("the settings page signs the portrait and the gallery", () => {
    const page = src("app/(coach)/coach/settings/page.tsx");
    expect(page).toMatch(/resolveSignedCoachPhotoUrl\(admin, coach\.photo_url\)/);
    expect(page).toMatch(/resolveSignedCoachPhotoUrls\(/);
  });

  it("no component receives a raw storage path", () => {
    // The exact regression this guards: photoUrl={coach.photo_url}.
    for (const f of ["app/(coach)/coach/settings/page.tsx"]) {
      expect(src(f)).not.toMatch(/photoUrl=\{[^}]*\.photo_url\}/);
    }
  });

  it("discovery signs a coach's own portrait before falling back", () => {
    const d = src("lib/club/discovery.ts");
    expect(d).toMatch(/signedPortrait/);
    expect(d).not.toMatch(/resolveCoachPhoto\(c\.photo_url/);
  });

  it("a full URL passes through unchanged", async () => {
    const { resolveSignedCoachPhotoUrl } = require("@/lib/club/media");
    const admin = { storage: { from: () => ({ createSignedUrl: async () => { throw new Error("should not sign"); } }) } };
    expect(await resolveSignedCoachPhotoUrl(admin, "https://cdn.test/a.jpg")).toBe("https://cdn.test/a.jpg");
  });
});

describe("publish blocker reflects storage, not signing", () => {
  it("hasPhoto is derived from the stored path", () => {
    // If it were derived from the signed URL, a transient signing failure
    // would tell a coach their photo is missing and block publishing.
    const q = src("lib/club/coach-queries.ts");
    expect(q).toMatch(/hasPhoto: !!data\.photo_url/);
    expect(q).toMatch(/hasPhoto: profile\.hasPhoto/);
    expect(q).not.toMatch(/hasPhoto: !!profile\.photoUrl/);
  });
});

describe("gallery is bounded", () => {
  it("has a limit the UI and the action agree on", () => {
    expect(MAX_GALLERY_IMAGES).toBeGreaterThan(0);
    expect(src("app/(coach)/coach/actions.ts")).toMatch(/MAX_GALLERY_IMAGES/);
    expect(src("components/coach/CoachPhotoSection.tsx")).toMatch(/MAX_GALLERY_IMAGES/);
  });

  it("deletes are scoped to the coach who owns the row", () => {
    const actions = src("app/(coach)/coach/actions.ts");
    const fn = actions.slice(actions.indexOf("export async function deleteCoachGalleryImage"));
    expect(fn).toMatch(/\.eq\("coach_profile_id", profile\.id\)/);
  });
});

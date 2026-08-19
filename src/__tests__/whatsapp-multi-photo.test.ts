import fs from "fs";
import path from "path";

// Multi-photo uploads (user report, Aug 2026): sending two photos meant
// only the first was measured, and a photo sent while the first was still
// being analysed got stuck.
//
// The mechanism was a coupling of three things in the webhook:
//
//   1. the route awaited ALL processing before acking Meta, so a delivery
//      carrying two photos took 25-40s (analysis is 12-19s each) — well
//      past Meta's patience, and long enough for a disconnected request to
//      be cancelled mid-analysis on Workers;
//   2. Meta then redelivered, but every message had already been CLAIMED
//      by the dedup tables, so the retry was skipped;
//   3. claims were never released, so the retry could never succeed —
//      the photo was permanently lost, leaving no row behind to notice.
//
// These assertions pin the shape of the fix, because the failure erases
// its own evidence and would not show up in the data afterwards.

const route = fs.readFileSync(
  path.join(__dirname, "..", "app", "api", "whatsapp", "webhook", "route.ts"),
  "utf-8"
);
const dedup = fs.readFileSync(path.join(__dirname, "..", "lib", "whatsapp", "dedup.ts"), "utf-8");

/** Strips comments — they describe the old behaviour and must not match. */
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("the webhook acks Meta before doing the work", () => {
  it("hands processing to after() rather than awaiting it inline", () => {
    const body = code(route);
    expect(body).toMatch(/after\(async \(\) => \{/);
    expect(body).toMatch(/import \{[^}]*\bafter\b[^}]*\} from "next\/server"/);
  });

  it("the only await of processWebhook is inside the after() callback", () => {
    // The regression was `await processWebhook(body)` sitting in the
    // request path, before the 200. It must now appear only after the
    // after( that defers it.
    const body = code(route);
    const post = body.slice(body.indexOf("export async function POST"));
    const deferAt = post.indexOf("after(async");
    const awaitAt = post.indexOf("await processWebhook(body)");
    expect(deferAt).toBeGreaterThan(-1);
    expect(awaitAt).toBeGreaterThan(deferAt);
    // And nothing awaits it between the function opening and the defer.
    expect(post.slice(0, deferAt)).not.toMatch(/await processWebhook/);
  });

  it("still returns 200, so Meta does not treat it as a failure", () => {
    expect(code(route)).toMatch(/new NextResponse\("OK", \{ status: 200 \}\)/);
  });
});

describe("every message in a delivery is processed, not just the first", () => {
  it("iterates the messages array", () => {
    expect(code(route)).toMatch(/for \(const message of value\?\.messages \?\? \[\]\)/);
  });

  it("never indexes a single message out of the batch", () => {
    expect(code(route)).not.toMatch(/messages\[0\]/);
  });
});

describe("a failed attempt gives its claim back", () => {
  it("dedup exposes a release for both claim kinds", () => {
    expect(dedup).toMatch(/export async function releaseMessageId/);
    expect(dedup).toMatch(/export async function releaseMediaId/);
  });

  it("the webhook releases both on error", () => {
    const catchBlock = route.slice(route.indexOf("} catch (err) {"));
    expect(catchBlock).toMatch(/releaseMessageId\(messageId\)/);
    expect(catchBlock).toMatch(/releaseMediaId\(claimedMediaId\)/);
  });

  it("releases the media id only once actually claimed", () => {
    // Releasing an id claimed by a DIFFERENT delivery would let a genuine
    // duplicate through, so the release is keyed on what this pass claimed.
    expect(code(route)).toMatch(/let claimedMediaId: string \| undefined;/);
    expect(code(route)).toMatch(/claimedMediaId = mediaId;/);
  });

  it("claims are still taken before the work, not after", () => {
    // Claim-before-work is what stops a redelivery double-analysing a
    // photo mid-flight; the fix is releasing on failure, not claiming late.
    // Compared inside the processing loop, not the import block.
    const body = code(route);
    const loop = body.slice(body.indexOf("for (const message of"));
    expect(loop.indexOf("claimMediaId(mediaId)")).toBeLessThan(loop.indexOf("downloadMedia(mediaId)"));
  });
});

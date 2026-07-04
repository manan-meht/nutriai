// Regression test: analyzeFood used to base64-encode an image buffer via
// btoa(String.fromCharCode(...bytes)) — spreading the entire buffer as
// individual function arguments. For a real photo (hundreds of KB to a few
// MB), that blows past the JS engine's max-arguments-per-call limit and
// crashes hard enough under Cloudflare's Edge Runtime that it never reaches
// a catch block, permanently stuck the per-number conversation lock.
//
// We can't easily unit test analyzeFood itself (it calls the live Gemini
// API), so this test exercises the chunked base64 encoding directly via a
// small reimplementation mirroring lib/ai/food-analyzer.ts's
// uint8ArrayToBase64 — the function isn't exported, so this also serves as
// a spec for what it must do if ever refactored.

function uint8ArrayToBase64(bytes: Uint8Array): string {
  const CHUNK_SIZE = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK_SIZE));
  }
  return btoa(binary);
}

function naiveSpreadEncode(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

describe("chunked base64 encoding for image buffers", () => {
  it("produces identical output to the naive (unsafe) approach for small buffers", () => {
    const small = new Uint8Array([1, 2, 3, 250, 255, 0, 128]);
    expect(uint8ArrayToBase64(small)).toBe(naiveSpreadEncode(small));
  });

  it("round-trips correctly for a realistic photo-sized buffer (1MB)", () => {
    const size = 1024 * 1024; // 1MB, typical WhatsApp-compressed photo size
    const bytes = new Uint8Array(size);
    for (let i = 0; i < size; i++) bytes[i] = i % 256;

    const encoded = uint8ArrayToBase64(bytes);
    const decoded = atob(encoded);
    const decodedBytes = new Uint8Array(decoded.length);
    for (let i = 0; i < decoded.length; i++) decodedBytes[i] = decoded.charCodeAt(i);

    expect(decodedBytes).toEqual(bytes);
  });

  it("does not throw for a buffer large enough to break the naive spread approach", () => {
    // A few hundred thousand bytes is enough to exceed V8's per-call
    // argument limit when spread directly into String.fromCharCode.
    const bytes = new Uint8Array(500_000).fill(65);
    expect(() => uint8ArrayToBase64(bytes)).not.toThrow();
  });
});

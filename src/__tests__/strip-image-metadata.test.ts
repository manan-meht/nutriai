import { stripImageMetadata } from "@/lib/images/strip-metadata";

// Minimal, hand-built JPEG: SOI, an APP1/EXIF segment carrying a fake GPS
// tag string, an APP0/JFIF segment (should survive), then SOS + one byte of
// "scan data" + EOI. Not a real decodable photo — just enough structure to
// exercise the marker-walking logic.
function buildFakeJpegWithExif(): Uint8Array {
  const exifPayload = Buffer.from("Exif\0\0FAKE-GPS-COORDINATES-51.5074,-0.1278");
  const app1Length = exifPayload.length + 2;
  const jfifPayload = Buffer.from([0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00]);
  const app0Length = jfifPayload.length + 2;

  return new Uint8Array([
    0xff, 0xd8, // SOI
    0xff, 0xe1, (app1Length >> 8) & 0xff, app1Length & 0xff, ...exifPayload, // APP1/EXIF
    0xff, 0xe0, (app0Length >> 8) & 0xff, app0Length & 0xff, ...jfifPayload, // APP0/JFIF
    0xff, 0xda, 0x00, 0x02, // SOS (empty header for this test)
    0x11, 0x22, 0x33, // fake entropy-coded scan bytes
    0xff, 0xd9, // EOI
  ]);
}

function bytesInclude(haystack: Uint8Array, needle: Buffer): boolean {
  const hay = Buffer.from(haystack);
  return hay.includes(needle);
}

describe("stripImageMetadata", () => {
  it("removes the JPEG APP1/EXIF segment (and any embedded GPS payload) while preserving other segments and scan data", () => {
    const original = buildFakeJpegWithExif();
    const stripped = stripImageMetadata(original, "image/jpeg");

    expect(bytesInclude(original, Buffer.from("FAKE-GPS-COORDINATES"))).toBe(true);
    expect(bytesInclude(stripped, Buffer.from("FAKE-GPS-COORDINATES"))).toBe(false);

    // APP0/JFIF and the scan data must both survive untouched.
    expect(bytesInclude(stripped, Buffer.from([0x4a, 0x46, 0x49, 0x46]))).toBe(true);
    expect(bytesInclude(stripped, Buffer.from([0x11, 0x22, 0x33]))).toBe(true);

    // Still starts with SOI and ends with EOI.
    expect(stripped[0]).toBe(0xff);
    expect(stripped[1]).toBe(0xd8);
    expect(stripped[stripped.length - 2]).toBe(0xff);
    expect(stripped[stripped.length - 1]).toBe(0xd9);
  });

  it("removes a PNG eXIf chunk while preserving IHDR/IDAT/IEND", () => {
    const ihdr = Buffer.from([0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, ...Array(13).fill(0), 0, 0, 0, 0]);
    const exifData = Buffer.from("FAKE-GPS-51.5,-0.12");
    const exifChunk = Buffer.concat([
      Buffer.from([(exifData.length >> 24) & 0xff, (exifData.length >> 16) & 0xff, (exifData.length >> 8) & 0xff, exifData.length & 0xff]),
      Buffer.from("eXIf"),
      exifData,
      Buffer.from([0, 0, 0, 0]),
    ]);
    const iend = Buffer.from([0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0, 0, 0, 0]);
    const png = new Uint8Array(Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), ihdr, exifChunk, iend]));

    const stripped = stripImageMetadata(png, "image/png");

    expect(bytesInclude(png, Buffer.from("FAKE-GPS"))).toBe(true);
    expect(bytesInclude(stripped, Buffer.from("FAKE-GPS"))).toBe(false);
    expect(bytesInclude(stripped, Buffer.from("IHDR"))).toBe(true);
    expect(bytesInclude(stripped, Buffer.from("IEND"))).toBe(true);
  });

  it("returns non-JPEG/PNG/WebP buffers unchanged rather than throwing", () => {
    const arbitrary = new Uint8Array([1, 2, 3, 4, 5]);
    expect(stripImageMetadata(arbitrary, "application/octet-stream")).toEqual(arbitrary);
  });
});

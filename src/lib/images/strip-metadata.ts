/**
 * Strips EXIF metadata (which can carry GPS coordinates and device info)
 * from an image buffer before it's stored — see
 * docs/FOOD_MODEL_IMPROVEMENT_AUDIT.md section F, gap #1. Pure byte-level
 * manipulation, no native/WASM image-decoding dependency, so this works
 * under Cloudflare's Edge Runtime the same way food-analyzer.ts's
 * uint8ArrayToBase64 avoids any API unavailable there.
 *
 * This does NOT re-encode the image (that would need a real decoder/
 * encoder, unavailable on the edge) — it only removes/rewrites the
 * metadata-carrying segments/chunks of the three formats WhatsApp actually
 * sends (JPEG, PNG, WebP), leaving pixel data untouched. Any format this
 * doesn't recognize is returned unchanged (best-effort, never throws).
 */
export function stripImageMetadata(buffer: Uint8Array, mimeType?: string): Uint8Array {
  try {
    if (isJpeg(buffer)) return stripJpegExif(buffer);
    if (isPng(buffer)) return stripPngMetadataChunks(buffer);
    if (isWebp(buffer)) return stripWebpExifChunk(buffer);
    return buffer;
  } catch {
    // Never let a stripping bug block the upload — worst case, metadata
    // survives on an image type that had unexpected structure.
    return buffer;
  }
}

function isJpeg(b: Uint8Array): boolean {
  return b.length > 2 && b[0] === 0xff && b[1] === 0xd8;
}

function isPng(b: Uint8Array): boolean {
  return b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
}

function isWebp(b: Uint8Array): boolean {
  return (
    b.length > 12 &&
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && // "RIFF"
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50 // "WEBP"
  );
}

/**
 * JPEG stores metadata (EXIF, including GPS) in an APP1 marker segment
 * (0xFFE1) right after the SOI marker (0xFFD8). Walks the marker chain and
 * drops any APP1/APP2 (EXIF/FlashPix extension) segments, keeping
 * everything else (APP0/JFIF, quantization tables, scan data, etc.)
 * byte-for-byte identical.
 */
function stripJpegExif(b: Uint8Array): Uint8Array {
  const out: number[] = [0xff, 0xd8]; // SOI
  let i = 2;

  while (i < b.length - 1) {
    if (b[i] !== 0xff) {
      // Not a marker where one was expected — bail out and keep the rest
      // of the file as-is rather than risk corrupting scan data.
      for (let j = i; j < b.length; j++) out.push(b[j]);
      return Uint8Array.from(out);
    }

    const marker = b[i + 1];

    // SOS (Start of Scan, 0xDA) — everything after this is entropy-coded
    // image data with no further markers to parse (0xFF bytes inside it are
    // escaped as 0xFF00) — copy the remainder verbatim and stop.
    if (marker === 0xda) {
      for (let j = i; j < b.length; j++) out.push(b[j]);
      return Uint8Array.from(out);
    }

    // Markers with no payload length (RST0-7, TEM, EOI, SOI) — copy as-is.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
      out.push(0xff, marker);
      i += 2;
      continue;
    }

    const length = (b[i + 2] << 8) | b[i + 3]; // includes the 2 length bytes themselves
    const isExifSegment = marker === 0xe1 || marker === 0xe2; // APP1 (EXIF/XMP), APP2 (FlashPix/ICC — dropped for simplicity, harmless)

    if (!isExifSegment) {
      for (let j = i; j < i + 2 + length; j++) out.push(b[j]);
    }
    i += 2 + length;
  }

  return Uint8Array.from(out);
}

/**
 * PNG can carry an `eXIf` chunk (PNG spec 1.2+) with the same EXIF/GPS
 * payload as JPEG, plus arbitrary `tEXt`/`iTXt`/`zTXt` text chunks that may
 * contain device/software info. Drops all of those; keeps every other
 * chunk (IHDR, PLTE, IDAT, IEND, etc.) untouched.
 */
function stripPngMetadataChunks(b: Uint8Array): Uint8Array {
  const STRIP_TYPES = new Set(["eXIf", "tEXt", "iTXt", "zTXt"]);
  const out: number[] = [];
  for (let k = 0; k < 8; k++) out.push(b[k]); // PNG signature

  let i = 8;
  while (i + 8 <= b.length) {
    const length = (b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3];
    const type = String.fromCharCode(b[i + 4], b[i + 5], b[i + 6], b[i + 7]);
    const chunkTotalLength = 12 + length; // length(4) + type(4) + data(length) + crc(4)

    if (!STRIP_TYPES.has(type)) {
      for (let j = i; j < i + chunkTotalLength && j < b.length; j++) out.push(b[j]);
    }

    i += chunkTotalLength;
    if (type === "IEND") break;
  }

  return Uint8Array.from(out);
}

/**
 * WebP wraps optional chunks (EXIF, XMP, ICCP) inside a RIFF container.
 * Drops the `EXIF` and `XMP ` chunks; keeps VP8/VP8L/VP8X/ALPH/ANIM image
 * data chunks untouched. Rewrites the RIFF container's total-size field to
 * match the new length.
 */
function stripWebpExifChunk(b: Uint8Array): Uint8Array {
  const STRIP_TYPES = new Set(["EXIF", "XMP "]);
  const out: number[] = [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]; // RIFF header + "WEBP", size patched below

  let i = 12;
  while (i + 8 <= b.length) {
    const type = String.fromCharCode(b[i], b[i + 1], b[i + 2], b[i + 3]);
    const length = b[i + 4] | (b[i + 5] << 8) | (b[i + 6] << 16) | (b[i + 7] << 24); // little-endian
    const padded = length % 2 === 1 ? length + 1 : length; // chunks are padded to even length
    const chunkTotalLength = 8 + padded;

    if (!STRIP_TYPES.has(type)) {
      for (let j = i; j < i + chunkTotalLength && j < b.length; j++) out.push(b[j]);
    }
    i += chunkTotalLength;
  }

  const riffSize = out.length - 8;
  out[4] = riffSize & 0xff;
  out[5] = (riffSize >> 8) & 0xff;
  out[6] = (riffSize >> 16) & 0xff;
  out[7] = (riffSize >> 24) & 0xff;

  return Uint8Array.from(out);
}

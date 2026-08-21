/**
 * Shrinks a photo in the browser before it is uploaded.
 *
 * A phone camera produces 2-8MB images; the largest we ever render one at
 * is about 900px wide. Sending the original wastes the coach's mobile data,
 * takes seconds on a poor connection, and — the reason this exists — used
 * to fail outright: Next.js caps a Server Action body at 1MB by default, so
 * essentially every real photo threw before our own size check could run.
 *
 * The cap is now raised too (next.config.ts), but downscaling is the better
 * fix: it makes the upload fast rather than merely possible.
 *
 * Deliberately forgiving. Any failure returns the original file and lets
 * the server decide — a coach must never be blocked from setting a photo
 * because their browser could not decode it. HEIC from an iPhone is the
 * real case: Safari usually converts to JPEG at the file input, but when it
 * does not, canvas cannot decode it and we fall through untouched.
 */
export async function downscaleImage(
  file: File,
  { maxEdge = 1600, quality = 0.85 }: { maxEdge?: number; quality?: number } = {}
): Promise<File> {
  if (typeof document === "undefined") return file;
  if (!file.type.startsWith("image/")) return file;
  // Already small enough that re-encoding would cost quality for nothing.
  if (file.size <= 600 * 1024) return file;

  try {
    // imageOrientation: "from-image" applies the EXIF rotation, so a photo
    // taken in portrait does not upload sideways — canvas ignores EXIF.
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size <= 2 * 1024 * 1024) {
      bitmap.close?.();
      return file;
    }

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", quality)
    );
    if (!blob || blob.size >= file.size) return file; // no gain, keep the original

    const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], name, { type: "image/jpeg", lastModified: Date.now() });
  } catch {
    return file;
  }
}

import { toPng } from "html-to-image";

// Web download/share for a rendered ShareCardPreview node. html-to-image
// is used purely for DOM-to-PNG capture — this file has nothing to do
// with generating the eventual illustrated backgrounds (see concepts.ts's
// nanoBananaPrompt fields for that, which is a separate, future concern).

async function nodeToPngBlob(node: HTMLElement): Promise<Blob> {
  const dataUrl = await toPng(node, { pixelRatio: 3, cacheBust: true });
  const res = await fetch(dataUrl);
  return res.blob();
}

export async function downloadShareCard(node: HTMLElement, filename = "tistra-health-win.png"): Promise<void> {
  const blob = await nodeToPngBlob(node);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Web Share API where supported (mobile Safari/Chrome — shares directly
 * into Instagram/WhatsApp/etc's share sheet); falls back to a plain
 * download everywhere else (desktop browsers largely don't support
 * sharing files via navigator.share). Canceling the native share sheet
 * rejects navigator.share with an AbortError — that's a normal user
 * choice, not a failure, so it's swallowed here and reported as
 * "cancelled" rather than left to surface as an unhandled rejection. */
export async function shareOrDownloadCard(
  node: HTMLElement,
  options?: { filename?: string; title?: string; text?: string }
): Promise<"shared" | "downloaded" | "cancelled"> {
  const blob = await nodeToPngBlob(node);
  const filename = options?.filename ?? "tistra-health-win.png";
  const file = new File([blob], filename, { type: "image/png" });

  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: options?.title, text: options?.text });
      return "shared";
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return "cancelled";
      throw err;
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return "downloaded";
}

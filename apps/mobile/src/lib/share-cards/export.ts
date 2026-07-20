import { captureRef } from "react-native-view-shot";
import * as Sharing from "expo-sharing";

// Mirrors the main web app's src/lib/share-cards/export.ts (same intent —
// capture a rendered card to an image file) but via react-native-view-shot
// + the native share sheet instead of html-to-image + Web Share API/
// download, since there's no DOM/browser here. See this app's ShareCardPreview
// for the component being captured.

/** Captures the given view ref to a local PNG and opens the native share
 * sheet — on both iOS and Android this share sheet itself offers "Save
 * Image"/"Save to Photos" as one of its own options, so a separate
 * download action isn't needed the way it is on web. Returns "shared" if
 * the share sheet was shown, "unavailable" if this device has no sharing
 * capability at all (rare — e.g. some Android emulators). */
export async function shareCardView(
  viewRef: React.RefObject<any>,
  options?: { dialogTitle?: string }
): Promise<"shared" | "unavailable"> {
  const uri = await captureRef(viewRef, { format: "png", quality: 1 });

  const available = await Sharing.isAvailableAsync();
  if (!available) return "unavailable";

  await Sharing.shareAsync(uri, { mimeType: "image/png", dialogTitle: options?.dialogTitle });
  return "shared";
}

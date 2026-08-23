import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from "fs";
import path from "path";

/**
 * Reads an image from disk and describes it, using the Gemini key this repo
 * already has.
 *
 *   npx tsx scripts/read-image.ts ~/Desktop/screenshot.png
 *   npx tsx scripts/read-image.ts shot.png "what does the error say?"
 *
 * Exists because images attached to a chat can be refused once a
 * conversation grows large, while a file on disk has no such limit. For a
 * screenshot of an error, this gets the text out reliably.
 */
const MIME: Record<string, string> = {
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".webp": "image/webp", ".gif": "image/gif", ".heic": "image/heic",
};

async function main() {
  const [file, ...rest] = process.argv.slice(2);
  if (!file) {
    console.error("usage: npx tsx scripts/read-image.ts <image> [question]");
    process.exit(1);
  }
  const resolved = file.startsWith("~") ? path.join(process.env.HOME!, file.slice(1)) : file;
  if (!fs.existsSync(resolved)) {
    console.error(`no such file: ${resolved}`);
    process.exit(1);
  }
  const question =
    rest.join(" ") ||
    "Transcribe every piece of text visible in this image, exactly as written, preserving layout and grouping. Then describe in one or two sentences what the screen is showing.";

  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    console.error("GEMINI_API_KEY is not set — export it from .env.local first");
    process.exit(1);
  }
  const model = new GoogleGenerativeAI(key).getGenerativeModel({ model: "gemini-2.5-flash" });
  const res = await model.generateContent([
    question,
    { inlineData: { mimeType: MIME[path.extname(resolved).toLowerCase()] ?? "image/png", data: fs.readFileSync(resolved).toString("base64") } },
  ]);
  console.log(res.response.text());
}
main().catch((e) => { console.error("error:", e instanceof Error ? e.message : e); process.exit(1); });

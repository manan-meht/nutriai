export const runtime = "edge";

import { NextRequest, NextResponse } from "next/server";
import { downloadMedia, sendTextMessage } from "@/lib/whatsapp/client";
import { handleIncomingMessage } from "@/lib/whatsapp/conversation-handler";


// Meta webhook verification
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const mode = params.get("hub.mode");
  const token = params.get("hub.verify_token");
  const challenge = params.get("hub.challenge");

  if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    console.log("[webhook] verified");
    return new NextResponse(challenge, { status: 200 });
  }

  return new NextResponse("Forbidden", { status: 403 });
}

// Incoming messages
export async function POST(request: NextRequest) {
  // Always return 200 immediately — Meta will retry if we return non-2xx
  const body = await request.json().catch(() => null);

  await processWebhook(body).catch((err) =>
    console.error("[webhook] unhandled error:", err)
  );

  return new NextResponse("OK", { status: 200 });
}

async function processWebhook(body: any) {
  if (body?.object !== "whatsapp_business_account") return;

  for (const entry of body?.entry ?? []) {
    for (const change of entry?.changes ?? []) {
      if (change?.field !== "messages") continue;
      const value = change.value;

      for (const message of value?.messages ?? []) {
        const from: string = message.from;
        const type: string = message.type;

        console.log(`[webhook] message from ${from}, type: ${type}`);

        try {
          if (type === "text") {
            await handleIncomingMessage({
              from,
              type: "text",
              text: message.text?.body,
            });
          } else if (type === "image") {
            const mediaId: string = message.image?.id;
            const mimeType: string = message.image?.mime_type ?? "image/jpeg";
            const caption: string | undefined = message.image?.caption;

            const { buffer } = await downloadMedia(mediaId);

            await handleIncomingMessage(
              { from, type: "image", text: caption, mediaId, mediaMimeType: mimeType },
              buffer
            );
          } else {
            await handleIncomingMessage({ from, type: "other" });
          }
        } catch (err) {
          console.error(`[webhook] error processing message from ${from}, type ${type}:`, err);
          await sendTextMessage(
            from,
            "Sorry, I had trouble processing that. Please try sending it again."
          ).catch((sendErr) =>
            console.error(`[webhook] failed to send fallback message to ${from}:`, sendErr)
          );
        }
      }
    }
  }
}

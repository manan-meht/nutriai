
import { NextRequest, NextResponse, after } from "next/server";
import { downloadMedia, sendTextMessage } from "@/lib/whatsapp/client";
import { handleIncomingMessage } from "@/lib/whatsapp/conversation-handler";
import { claimMessageId, claimMediaId, releaseMessageId, releaseMediaId } from "@/lib/whatsapp/dedup";


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
  const body = await request.json().catch(() => null);

  // Acknowledge Meta BEFORE doing the work, not after.
  //
  // This used to await processWebhook() and only then return 200, despite
  // the comment claiming otherwise. Photo analysis takes 12-19s, so a
  // single message was already close to Meta's patience and two photos in
  // one delivery (~25-40s) blew past it reliably. Meta then gave up
  // waiting and redelivered — but the messages were already claimed, so
  // the retry was skipped and the photo was silently dropped. Worse, on
  // Workers a disconnected client can have its request cancelled, killing
  // the analysis mid-flight.
  //
  // after() hands the work to the platform's waitUntil, so the response
  // goes out in milliseconds and the processing outlives it. Messages
  // within a delivery stay sequential on purpose: they share one
  // conversation, and running them concurrently would let two photos race
  // on the same pending-clarification state.
  after(async () => {
    await processWebhook(body).catch((err) =>
      console.error("[webhook] unhandled error:", err)
    );
  });

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
        const messageId: string | undefined = message.id;
        // Tracked so the catch below can release it; only set once claimed.
        let claimedMediaId: string | undefined;

        console.log(`[webhook] message from ${from}, type: ${type}`);

        // Meta redelivers a webhook whenever we don't ack fast enough —
        // expected any time photo analysis (the LLM call below) runs long.
        // Skip anything we've already claimed so a redelivery never
        // triggers a second AI analysis or a second reply to the user.
        if (messageId && !(await claimMessageId(messageId))) {
          console.log(`[webhook] skipping already-processed message ${messageId} from ${from}`);
          continue;
        }

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

            // The WhatsApp client can resend the same photo as a second,
            // distinct message (its own wamid) after a flaky send — the
            // wamid dedup above doesn't catch that since the ids differ,
            // but the underlying media id is the same. Skip it here before
            // spending an AI call and a duplicate log entry on it.
            if (mediaId && !(await claimMediaId(mediaId))) {
              console.log(`[webhook] skipping duplicate media ${mediaId} from ${from}`);
              continue;
            }
            claimedMediaId = mediaId;

            const downloadStart = Date.now();
            const { buffer } = await downloadMedia(mediaId);
            console.log(`[webhook] media download took ${Date.now() - downloadStart}ms`);

            const handleStart = Date.now();
            await handleIncomingMessage(
              { from, type: "image", text: caption, mediaId, mediaMimeType: mimeType },
              buffer
            );
            console.log(`[webhook] handleIncomingMessage took ${Date.now() - handleStart}ms`);
          } else {
            await handleIncomingMessage({ from, type: "other" });
          }
        } catch (err) {
          console.error(`[webhook] error processing message from ${from}, type ${type}:`, err);
          // Give the claims back so Meta's redelivery is actually retried.
          // Holding them would drop this photo permanently.
          if (messageId) await releaseMessageId(messageId).catch(() => {});
          if (claimedMediaId) await releaseMediaId(claimedMediaId).catch(() => {});
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

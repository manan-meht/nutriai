const GRAPH_URL = "https://graph.facebook.com/v20.0";

function token() {
  return process.env.WHATSAPP_ACCESS_TOKEN!;
}

function phoneNumberId() {
  return process.env.WHATSAPP_PHONE_NUMBER_ID!;
}

export async function sendTextMessage(to: string, text: string): Promise<void> {
  const res = await fetch(`${GRAPH_URL}/${phoneNumberId()}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: text },
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`WhatsApp send failed: ${res.status} ${body}`);
  }
}

/**
 * Sends a pre-approved WhatsApp message template. This is the ONLY message
 * type Meta allows as the first message to someone who hasn't messaged
 * your business number yet — sendTextMessage (free-form) will be rejected
 * by the Graph API for that case, in both test and production WhatsApp
 * Business Accounts. Once the recipient replies, the 24-hour customer
 * service window opens and free-form messages work normally (that's the
 * existing AI meal-logging conversation flow in conversation-handler.ts).
 *
 * The template itself (name, language, parameter count/order) must be
 * created and approved in Meta Business Manager first — this function only
 * calls a template that already exists and is approved.
 */
export async function sendTemplateMessage(
  to: string,
  templateName: string,
  languageCode: string,
  bodyParameters: string[] = []
): Promise<void> {
  const res = await fetch(`${GRAPH_URL}/${phoneNumberId()}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name: templateName,
        language: { code: languageCode },
        ...(bodyParameters.length > 0
          ? { components: [{ type: "body", parameters: bodyParameters.map((text) => ({ type: "text", text })) }] }
          : {}),
      },
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`WhatsApp template send failed: ${res.status} ${body}`);
  }
}

export async function downloadMedia(mediaId: string): Promise<{ buffer: Uint8Array; mimeType: string }> {
  const metaRes = await fetch(`${GRAPH_URL}/${mediaId}`, {
    headers: { Authorization: `Bearer ${token()}` },
  });
  if (!metaRes.ok) throw new Error(`Failed to fetch media metadata: ${metaRes.status}`);
  const { url, mime_type } = await metaRes.json();

  const mediaRes = await fetch(url, {
    headers: { Authorization: `Bearer ${token()}` },
  });
  if (!mediaRes.ok) throw new Error(`Failed to download media: ${mediaRes.status}`);

  const buffer = new Uint8Array(await mediaRes.arrayBuffer());
  return { buffer, mimeType: mime_type };
}

export function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

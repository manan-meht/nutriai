const GRAPH_URL = "https://graph.facebook.com/v20.0";

function token() {
  return process.env.WHATSAPP_ACCESS_TOKEN!;
}

function phoneNumberId() {
  return process.env.WHATSAPP_PHONE_NUMBER_ID!;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Retries a transient failure up to `attempts` times with a short,
 * increasing backoff — used for the WhatsApp media fetch below. Meta's
 * media URLs are short-lived, so retrying much later (e.g. a background
 * job re-checking the saved meal) is far less likely to succeed than
 * retrying immediately within the same request, while the media is still
 * fresh. Rethrows the last error if every attempt fails. */
export async function withRetry<T>(fn: () => Promise<T>, attempts = 3, baseDelayMs = 400): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt < attempts - 1) await sleep(baseDelayMs * (attempt + 1));
    }
  }
  throw lastErr;
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

/** Retries the whole metadata+download round-trip up to 3 times (short
 * backoff) before giving up — a transient network blip on either the
 * metadata call or the actual media fetch previously meant a meal got
 * logged with no photo (best-effort upload, never blocking the save — see
 * conversation-handler.ts's uploadMealPhoto), with no second chance since
 * Meta's media URLs are short-lived. Retrying here, immediately, while the
 * media is still fresh, is far more likely to succeed than any later
 * recheck would be. */
export async function downloadMedia(mediaId: string): Promise<{ buffer: Uint8Array; mimeType: string }> {
  return withRetry(async () => {
    const metaRes = await fetch(`${GRAPH_URL}/${mediaId}`, {
      headers: { Authorization: `Bearer ${token()}` },
    });
    if (!metaRes.ok) throw new Error(`Failed to fetch media metadata: ${metaRes.status} ${await metaRes.text()}`);
    const { url, mime_type } = await metaRes.json();

    const mediaRes = await fetch(url, {
      headers: { Authorization: `Bearer ${token()}` },
    });
    if (!mediaRes.ok) throw new Error(`Failed to download media: ${mediaRes.status} ${await mediaRes.text()}`);

    const buffer = new Uint8Array(await mediaRes.arrayBuffer());
    return { buffer, mimeType: mime_type };
  });
}

export function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

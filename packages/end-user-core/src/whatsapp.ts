// Minimal WhatsApp Cloud API sender, extracted from the main web app's
// src/lib/whatsapp/client.ts so apps/mobile-api can send OTP codes too
// without depending on the main app. Deliberately takes credentials as
// parameters rather than reading process.env directly — both callers read
// their own environment (Cloudflare Pages secrets in each deployment) and
// pass them in explicitly, keeping this package env-agnostic.

const GRAPH_URL = "https://graph.facebook.com/v21.0";

export async function sendWhatsAppTemplate(opts: {
  accessToken: string;
  phoneNumberId: string;
  to: string;
  templateName: string;
  languageCode: string;
  bodyParameters?: string[];
}): Promise<void> {
  const { accessToken, phoneNumberId, to, templateName, languageCode, bodyParameters = [] } = opts;
  const res = await fetch(`${GRAPH_URL}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
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
    const body = await res.text().catch(() => "");
    throw new Error(`WhatsApp template send failed: ${res.status} ${body}`);
  }
}

export function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

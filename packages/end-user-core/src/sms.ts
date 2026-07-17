// Dual-provider OTP SMS delivery: MSG91 for Indian numbers, Twilio for
// everyone else. India requires DLT (Distributed Ledger Technology)
// registration for all commercial/OTP SMS by TRAI regulation — this
// applies to every provider sending to Indian numbers, not something any
// single vendor choice avoids. MSG91 is used for +91 specifically because
// it has stronger India-first DLT registration support than Twilio, which
// is otherwise the stronger pick for everywhere else.
//
// Both providers take credentials as parameters rather than reading
// process.env directly — same convention as whatsapp.ts in this package —
// so callers (web, mobile-api) each read their own environment.

export interface Msg91Credentials {
  authKey: string;
  /** DLT-registered template ID (India requires the exact approved
   * template text; MSG91's API takes the template ID + variable values,
   * not free-form text). */
  templateId: string;
  senderId: string;
}

export interface TwilioCredentials {
  accountSid: string;
  authToken: string;
  /** Either a purchased Twilio number ("+1...") or a Messaging Service SID
   * ("MG...") — Twilio's API accepts either as the "From"/"MessagingServiceSid". */
  fromNumberOrMessagingServiceSid: string;
}

export interface OtpSmsCredentials {
  msg91: Msg91Credentials;
  twilio: TwilioCredentials;
}

async function sendViaMsg91(to: string, code: string, creds: Msg91Credentials): Promise<void> {
  const res = await fetch("https://control.msg91.com/api/v5/flow/", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      authkey: creds.authKey,
    },
    body: JSON.stringify({
      template_id: creds.templateId,
      sender: creds.senderId,
      short_url: "0",
      recipients: [
        {
          mobiles: to.replace(/^\+/, ""), // MSG91 expects digits only, country code prefixed, no "+".
          OTP: code,
        },
      ],
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`MSG91 send failed: ${res.status} ${body}`);
  }
}

async function sendViaTwilio(to: string, code: string, creds: TwilioCredentials): Promise<void> {
  const isMessagingService = creds.fromNumberOrMessagingServiceSid.startsWith("MG");
  const params = new URLSearchParams({
    To: to,
    Body: `Your Tistra Health verification code is ${code}. It expires in 10 minutes.`,
    ...(isMessagingService
      ? { MessagingServiceSid: creds.fromNumberOrMessagingServiceSid }
      : { From: creds.fromNumberOrMessagingServiceSid }),
  });

  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${creds.accountSid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${creds.accountSid}:${creds.authToken}`)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Twilio send failed: ${res.status} ${body}`);
  }
}

/** Sends an OTP code via SMS, routing to MSG91 for +91 numbers and Twilio
 * for everyone else. `to` must be E.164 (leading "+", e.g. "+919812345678").
 *
 * MSG91 requires an approved DLT (Distributed Ledger Technology) template
 * per TRAI regulation before it can actually send — until that's in place,
 * `creds.msg91.templateId` is empty, and +91 numbers fall back to Twilio
 * (sent internationally, without DLT). This is a stopgap: Twilio's
 * non-DLT-routed SMS to Indian numbers is more prone to carrier filtering
 * than a DLT-registered MSG91 send, but it's better than not delivering an
 * OTP at all. Once DLT registration is complete and MSG91_OTP_TEMPLATE_ID
 * is set, +91 numbers switch back to MSG91 automatically — no code change
 * needed. */
export async function sendOtpSms(to: string, code: string, creds: OtpSmsCredentials): Promise<void> {
  if (to.startsWith("+91") && creds.msg91.templateId) {
    await sendViaMsg91(to, code, creds.msg91);
  } else {
    await sendViaTwilio(to, code, creds.twilio);
  }
}

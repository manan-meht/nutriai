import { sendOtpSms } from "@nutriai/end-user-core";

describe("sendOtpSms provider routing", () => {
  const creds = {
    msg91: { authKey: "msg91-key", templateId: "tmpl-123", senderId: "TSTRA" },
    twilio: { accountSid: "AC123", authToken: "twilio-token", fromNumberOrMessagingServiceSid: "+15551234567" },
  };

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("routes +91 numbers to MSG91", async () => {
    const fetchSpy = jest.fn().mockResolvedValue({ ok: true, text: async () => "" });
    global.fetch = fetchSpy as any;

    await sendOtpSms("+919812345678", "123456", creds);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://control.msg91.com/api/v5/flow/");
    expect((init.headers as Record<string, string>).authkey).toBe("msg91-key");
    const body = JSON.parse(init.body);
    expect(body.template_id).toBe("tmpl-123");
    expect(body.recipients[0].OTP).toBe("123456");
    expect(body.recipients[0].mobiles).toBe("919812345678");
  });

  it("routes non-+91 numbers to Twilio", async () => {
    const fetchSpy = jest.fn().mockResolvedValue({ ok: true, text: async () => "" });
    global.fetch = fetchSpy as any;

    await sendOtpSms("+16505551234", "654321", creds);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://api.twilio.com/2010-04-01/Accounts/AC123/Messages.json");
    const params = new URLSearchParams(init.body as string);
    expect(params.get("To")).toBe("+16505551234");
    expect(params.get("Body")).toContain("654321");
    expect(params.get("From")).toBe("+15551234567");
  });

  it("uses MessagingServiceSid instead of From when given an MG-prefixed SID", async () => {
    const fetchSpy = jest.fn().mockResolvedValue({ ok: true, text: async () => "" });
    global.fetch = fetchSpy as any;

    await sendOtpSms("+16505551234", "654321", {
      ...creds,
      twilio: { ...creds.twilio, fromNumberOrMessagingServiceSid: "MGabc123" },
    });

    const [, init] = fetchSpy.mock.calls[0];
    const params = new URLSearchParams(init.body as string);
    expect(params.get("MessagingServiceSid")).toBe("MGabc123");
    expect(params.get("From")).toBeNull();
  });

  it("throws when MSG91 returns a non-OK response", async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 401, text: async () => "invalid auth key" }) as any;
    await expect(sendOtpSms("+919812345678", "123456", creds)).rejects.toThrow(/MSG91 send failed/);
  });

  it("throws when Twilio returns a non-OK response", async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 400, text: async () => "bad request" }) as any;
    await expect(sendOtpSms("+16505551234", "123456", creds)).rejects.toThrow(/Twilio send failed/);
  });

  it("falls back to Twilio for +91 numbers when MSG91's DLT template isn't configured yet", async () => {
    const fetchSpy = jest.fn().mockResolvedValue({ ok: true, text: async () => "" });
    global.fetch = fetchSpy as any;

    await sendOtpSms("+919812345678", "123456", {
      ...creds,
      msg91: { ...creds.msg91, templateId: "" },
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://api.twilio.com/2010-04-01/Accounts/AC123/Messages.json");
  });
});

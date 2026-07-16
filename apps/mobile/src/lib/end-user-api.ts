import { getEndUserSessionToken, type EndUserContactType } from "./end-user-session";

const API_BASE_URL = process.env.EXPO_PUBLIC_MOBILE_API_URL!;

export class EndUserApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "EndUserApiError";
  }
}

async function endUserRequest<T>(path: string, init: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new EndUserApiError(res.status, body.error ?? res.statusText);
  }
  return res.json();
}

/** Same request/verify calls as the web app's requestOtpAction/
 * verifyOtpAction (src/app/(public)/my-progress/actions.ts), against
 * apps/mobile-api's /end-user/* routes instead of a Next.js Server Action —
 * this app has no server-rendering context to run one in. */
export const endUserApi = {
  requestOtp: (whatsappNumber: string) =>
    endUserRequest<{ ok: true }>("/end-user/request-otp", {
      method: "POST",
      body: JSON.stringify({ whatsappNumber }),
    }),

  verifyOtp: (whatsappNumber: string, code: string, deviceLabel?: string) =>
    endUserRequest<{ sessionToken: string; contactId: string; contactType: EndUserContactType; fullName: string }>(
      "/end-user/verify-otp",
      { method: "POST", body: JSON.stringify({ whatsappNumber, code, deviceLabel }) }
    ),

  /** Authenticated calls — throws EndUserApiError(401) if there's no
   * stored session token, which callers should treat as "sign in again"
   * rather than retry. */
  async getDashboard() {
    const token = await getEndUserSessionToken();
    if (!token) throw new EndUserApiError(401, "Not signed in");
    return endUserRequest<{
      profile: Record<string, any>;
      meals: Record<string, any>[];
      accessList: { role: "caregiver" | "coach"; label: string }[];
      isPaused: boolean;
    }>("/end-user/dashboard", { method: "GET", headers: { Authorization: `Bearer ${token}` } });
  },

  async setSharingPaused(paused: boolean) {
    const token = await getEndUserSessionToken();
    if (!token) throw new EndUserApiError(401, "Not signed in");
    return endUserRequest<{ ok: true }>("/end-user/sharing", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ paused }),
    });
  },
};

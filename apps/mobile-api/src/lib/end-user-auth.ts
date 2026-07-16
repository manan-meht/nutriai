import type { NextRequest } from "next/server";
import { validateEndUserSessionToken, type EndUserSessionInfo } from "@nutriai/end-user-core";
import { createServiceClient } from "./supabase";

/**
 * Validates the mobile app's `Authorization: Bearer <session_token>` for a
 * participant/end-user session — a completely separate mechanism from
 * getUserFromBearerToken (which validates a real Supabase Auth JWT for
 * caregivers/coaches). The end-user session is an opaque random token
 * whose hash is stored in end_user_sessions (see
 * @nutriai/end-user-core/session.ts) — minted by POST /end-user/verify-otp
 * and persisted client-side in SecureStore, mirroring exactly how the web
 * app stores the same token in an httpOnly cookie.
 */
export async function getEndUserFromBearerToken(request: NextRequest): Promise<EndUserSessionInfo | null> {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return null;

  return validateEndUserSessionToken(createServiceClient(), token);
}

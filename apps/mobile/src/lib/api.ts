import { supabase } from "./supabase";

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL as string;

if (!API_BASE_URL) {
  throw new Error("Missing EXPO_PUBLIC_API_BASE_URL in apps/mobile/.env (see .env.example).");
}

/**
 * Calls the standalone mobile-api Cloudflare Pages project (see
 * apps/mobile-api) with the current Supabase session's access token as a
 * Bearer header — mirrors exactly how that app's own tests authenticate
 * against it. Throws on any non-2xx response.
 */
export async function apiGet<T>(path: string): Promise<T> {
  return apiRequest<T>(path, { method: "GET" });
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  return apiRequest<T>(path, { method: "POST", body: JSON.stringify(body) });
}

export async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  return apiRequest<T>(path, { method: "PATCH", body: JSON.stringify(body) });
}

async function apiRequest<T>(path: string, init: RequestInit): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");

  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? `Request failed: ${res.status}`);
  }

  return res.json();
}

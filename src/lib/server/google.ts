import "server-only";
import { GOOGLE_TOKEN_URL, type GoogleFlow } from "@/lib/google-oauth";

/**
 * The Google OAuth client the site signs in with: the same "Web application"
 * client that Supabase's Google provider is set up with, so Supabase accepts
 * its ID tokens. The secret is server only.
 */
export function googleClient(): { id: string; secret: string } | null {
  const id = process.env.GOOGLE_CLIENT_ID;
  const secret = process.env.GOOGLE_CLIENT_SECRET;
  if (!id || !secret) return null;
  return { id, secret };
}

/** Trades the code Google sent back for an ID token. Null (with a log line) if Google refuses. */
export async function exchangeCode(code: string, flow: GoogleFlow, client: { id: string; secret: string }): Promise<string | null> {
  try {
    const res = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: client.id,
        client_secret: client.secret,
        redirect_uri: flow.redirectUri,
        code_verifier: flow.verifier,
      }),
      cache: "no-store",
    });
    const body = (await res.json().catch(() => ({}))) as { id_token?: string; error?: string; error_description?: string };
    if (!res.ok || !body.id_token) {
      console.error(`[auth] Google token exchange failed: ${body.error ?? res.status} ${body.error_description ?? ""}`.trim());
      return null;
    }
    return body.id_token;
  } catch (err) {
    console.error(`[auth] Google token exchange failed: ${String(err)}`);
    return null;
  }
}

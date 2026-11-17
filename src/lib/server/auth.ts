import "server-only";
import { connection } from "next/server";
import { sessionClient } from "./supabase";

export type CurrentUser = {
  id: string;
  /** From the Google account. */
  name: string | null;
  avatarUrl: string | null;
  /** The Google address. Shown only to the account's owner, on the settings page. */
  email: string | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The signed-in account, or null. The session token's signature is verified
 * (against the project's public signing keys) before anything in it is trusted.
 */
export async function currentUser(): Promise<CurrentUser | null> {
  // Checking a session compares its expiry with the current time, so this must
  // run for a real request, never while a page is being prerendered.
  await connection();
  const supabase = await sessionClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims || typeof claims.sub !== "string" || !UUID.test(claims.sub)) return null;
  if (claims.is_anonymous) return null;

  const meta = (claims.user_metadata ?? {}) as Record<string, unknown>;
  const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const avatar = text(meta.avatar_url) ?? text(meta.picture);
  return {
    id: claims.sub,
    name: text(meta.full_name) ?? text(meta.name),
    avatarUrl: avatar && avatar.startsWith("https://") ? avatar : null,
    email: typeof claims.email === "string" && claims.email ? claims.email : null,
  };
}

/** Where to send someone after sign in: a path on this site, or the home page. */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return "/";
  return next;
}

/**
 * The address the visitor used to reach this site. Behind Vercel's proxy the
 * request URL can carry an internal host, so the forwarded host wins when present.
 */
export function siteOrigin(request: Request): string {
  const url = new URL(request.url);
  const host = request.headers.get("x-forwarded-host");
  if (host && process.env.NODE_ENV !== "development") {
    return `${request.headers.get("x-forwarded-proto") ?? "https"}://${host}`;
  }
  return url.origin;
}

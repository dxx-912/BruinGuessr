import "server-only";
import { createHash, createHmac, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { adminClient } from "./supabase";

/**
 * Guest play: a signed-out visitor can play solo games.
 *
 * A guest is a random 32-byte token in an http-only cookie. The database keeps
 * only its SHA-256, next to a guest profile with no account behind it. The
 * cookie cannot be read by page scripts, and a guessed token would have to
 * match one of 2^256. Guests never get a username, so they never reach the
 * leaderboard, and nothing ever moves a guest's games onto an account.
 *
 * Rate limits (all in the settings table, checked in the database):
 *   - new guests: 150 an hour per network,
 *   - guest games: 20 an hour per guest, 300 an hour per network, and 1,500 an
 *     hour across all guests together.
 * The network is the visitor's IP address, stored only as an HMAC keyed with a
 * server secret, so the stored value cannot be turned back into an address.
 */
export const GUEST_COOKIE = "bg_guest";
const GUEST_COOKIE_DAYS = 7;

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

/** The visitor's IP address as Vercel reports it. Vercel sets these headers itself; a client cannot. */
export function clientIp(request: Request): string {
  const real = request.headers.get("x-real-ip")?.trim();
  if (real) return real;
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || "local";
}

/** A keyed hash of the visitor's network, for the per-network limits. */
export function networkHash(request: Request): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  return createHmac("sha256", key).update(`guest-network:${clientIp(request)}`).digest("hex");
}

/** The guest playing in this browser, or null. */
export async function currentGuest(): Promise<string | null> {
  await connection();
  const token = (await cookies()).get(GUEST_COOKIE)?.value;
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const { data, error } = await adminClient().rpc("guest_from_token", { p_token_hash: sha256(token) });
  if (error) {
    console.error(`[guest] could not read the guest: ${error.message}`);
    return null;
  }
  return typeof data === "string" ? data : null;
}

export type GuestStart = { id: string } | { error: "rate_limited" | "server_error" | "unauthorized" | "bad_request" };

/**
 * Starts a guest solo game, making the guest first if this browser has none.
 * Only for route handlers: it may set the guest cookie.
 */
export async function startGuestGame(request: Request): Promise<GuestStart> {
  const network = networkHash(request);
  let guest = await currentGuest();

  if (!guest) {
    const token = randomBytes(32).toString("base64url");
    const { data, error } = await adminClient().rpc("create_guest", { p_token_hash: sha256(token), p_ip_hash: network });
    if (error) {
      console.error(`[guest] create_guest failed: ${error.message}`);
      return { error: "server_error" };
    }
    const made = data as { id?: string; error?: "rate_limited" | "bad_request" };
    if (made.error || !made.id) return { error: made.error ?? "server_error" };
    guest = made.id;
    (await cookies()).set(GUEST_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: GUEST_COOKIE_DAYS * 24 * 60 * 60,
    });
  }

  const { data, error } = await adminClient().rpc("start_guest_game", { p_guest: guest, p_ip_hash: network });
  if (error) {
    console.error(`[guest] start_guest_game failed: ${error.message}`);
    return { error: "server_error" };
  }
  return data as GuestStart;
}

/** Forgets this browser's guest, so nothing from guest play follows a player into their account. */
export async function forgetGuest(): Promise<void> {
  const store = await cookies();
  if (store.get(GUEST_COOKIE)) store.delete(GUEST_COOKIE);
}

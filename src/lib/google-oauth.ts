/**
 * Google sign in on our own domain (the parts with no secrets, so they can be
 * tested). The flow:
 *
 * 1. `POST /auth/sign-in` makes a random state, nonce and PKCE verifier, keeps
 *    them in a short-lived http-only cookie, and sends the browser to Google
 *    with `redirect_uri` = this site's `/auth/google/callback`. Because the
 *    redirect is on our domain, Google's account screen names our site, not
 *    the Supabase project.
 * 2. Google sends the browser back to `/auth/google/callback` with a code and
 *    the state. The state must match the cookie (CSRF). The code is traded
 *    with Google for an ID token, using the client secret and the verifier.
 * 3. The ID token goes to Supabase (`signInWithIdToken`) with the raw nonce.
 *    Google put the SHA-256 of the raw nonce in the token; Supabase hashes the
 *    raw nonce and checks it matches, so a token cannot be replayed into
 *    another sign in. Supabase also checks the token's signature and that it
 *    was issued to our client ID.
 */

export const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const CALLBACK_PATH = "/auth/google/callback";
export const FLOW_COOKIE = "bg_google_flow";
/** Long enough to pick an account and sign in, short enough that a stale flow is useless. */
export const FLOW_MAX_AGE_SECONDS = 10 * 60;

/** What the flow cookie holds between the redirect to Google and the callback. */
export type GoogleFlow = {
  state: string;
  /** The raw nonce. Google is sent its SHA-256; Supabase is sent this. */
  nonce: string;
  /** PKCE code verifier. */
  verifier: string;
  /** Exactly the redirect_uri sent to Google, which the token exchange must repeat. */
  redirectUri: string;
  /** Where to land after signing in: a path on this site. */
  next: string;
};

const encoder = new TextEncoder();

function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function randomToken(bytes = 32): string {
  return base64url(crypto.getRandomValues(new Uint8Array(bytes)));
}

async function sha256(text: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(text)));
}

/** The nonce as Google receives it: the hex SHA-256 of the raw nonce, which is what Supabase compares against. */
export async function hashedNonce(raw: string): Promise<string> {
  return [...(await sha256(raw))].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** PKCE S256 challenge for a verifier. */
export async function codeChallenge(verifier: string): Promise<string> {
  return base64url(await sha256(verifier));
}

/** A fresh flow for a sign in that starts on `origin` and should end on `next`. */
export function newFlow(origin: string, next: string): GoogleFlow {
  return { state: randomToken(), nonce: randomToken(), verifier: randomToken(48), redirectUri: `${origin}${CALLBACK_PATH}`, next };
}

/** Google's sign-in address for a flow. */
export async function authorizationUrl(flow: GoogleFlow, clientId: string): Promise<string> {
  const url = new URL(GOOGLE_AUTH_URL);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", flow.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", flow.state);
  url.searchParams.set("nonce", await hashedNonce(flow.nonce));
  url.searchParams.set("code_challenge", await codeChallenge(flow.verifier));
  url.searchParams.set("code_challenge_method", "S256");
  // Same as before: always offer the account chooser, so a shared computer is not signed in as the last person.
  url.searchParams.set("prompt", "select_account");
  return url.toString();
}

export function encodeFlow(flow: GoogleFlow): string {
  return base64url(encoder.encode(JSON.stringify(flow)));
}

/** The flow from its cookie, or null if the cookie is missing or not one of ours. */
export function decodeFlow(value: string | undefined | null): GoogleFlow | null {
  if (!value) return null;
  try {
    const json = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
    const flow = JSON.parse(json) as Partial<GoogleFlow>;
    const ok = (v: unknown) => typeof v === "string" && v.length > 0;
    if (!ok(flow.state) || !ok(flow.nonce) || !ok(flow.verifier) || !ok(flow.redirectUri) || !ok(flow.next)) return null;
    return flow as GoogleFlow;
  } catch {
    return null;
  }
}

/** Compares the state Google echoed with the one in the cookie, in constant time. */
export function stateMatches(expected: string, received: string | null): boolean {
  if (!received) return false;
  const a = encoder.encode(expected);
  const b = encoder.encode(received);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

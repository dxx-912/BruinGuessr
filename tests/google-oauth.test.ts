import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { authorizationUrl, codeChallenge, decodeFlow, encodeFlow, hashedNonce, newFlow, stateMatches } from "@/lib/google-oauth";

const hex = (s: string) => createHash("sha256").update(s).digest("hex");
const b64url = (s: string) => createHash("sha256").update(s).digest("base64url");

describe("Google sign in on our own domain", () => {
  it("builds the redirect from the site's own origin", () => {
    for (const origin of ["http://localhost:3000", "https://ucla-geoguessr.vercel.app", "https://www.bruinguessr.com"]) {
      expect(newFlow(origin, "/").redirectUri).toBe(`${origin}/auth/google/callback`);
    }
  });

  it("makes a fresh, unguessable state, nonce and verifier every time", () => {
    const a = newFlow("http://localhost:3000", "/");
    const b = newFlow("http://localhost:3000", "/");
    expect(a.state).not.toBe(b.state);
    expect(a.nonce).not.toBe(b.nonce);
    expect(a.verifier).not.toBe(b.verifier);
    expect(a.state.length).toBeGreaterThanOrEqual(43);
    expect(a.verifier.length).toBeGreaterThanOrEqual(43);
  });

  it("sends Google the SHA-256 (hex) of the nonce, which is what Supabase checks the raw nonce against", async () => {
    expect(await hashedNonce("abc")).toBe(hex("abc"));
  });

  it("uses an S256 PKCE challenge", async () => {
    expect(await codeChallenge("verifier-123")).toBe(b64url("verifier-123"));
  });

  it("asks Google for an OpenID code with state, hashed nonce, PKCE and the account chooser", async () => {
    const flow = newFlow("https://www.bruinguessr.com", "/leaderboard");
    const url = new URL(await authorizationUrl(flow, "client-id.apps.googleusercontent.com"));
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    const q = Object.fromEntries(url.searchParams);
    expect(q).toMatchObject({
      client_id: "client-id.apps.googleusercontent.com",
      redirect_uri: "https://www.bruinguessr.com/auth/google/callback",
      response_type: "code",
      scope: "openid email profile",
      state: flow.state,
      nonce: hex(flow.nonce),
      code_challenge: b64url(flow.verifier),
      code_challenge_method: "S256",
      prompt: "select_account",
    });
    // The raw nonce and the verifier never leave the server's cookie.
    expect(url.toString()).not.toContain(flow.nonce);
    expect(url.toString()).not.toContain(flow.verifier);
  });

  it("round-trips the flow through its cookie and rejects anything else", () => {
    const flow = newFlow("http://localhost:3000", "/versus/ABCDE");
    expect(decodeFlow(encodeFlow(flow))).toEqual(flow);
    expect(decodeFlow(undefined)).toBeNull();
    expect(decodeFlow("not-base64-json")).toBeNull();
    expect(decodeFlow(encodeFlow({ ...flow, state: "" }))).toBeNull();
  });

  it("accepts only the exact state", () => {
    expect(stateMatches("abc123", "abc123")).toBe(true);
    expect(stateMatches("abc123", "abc124")).toBe(false);
    expect(stateMatches("abc123", "abc12")).toBe(false);
    expect(stateMatches("abc123", null)).toBe(false);
  });
});

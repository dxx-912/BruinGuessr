import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { CALLBACK_PATH, decodeFlow, FLOW_COOKIE, stateMatches } from "@/lib/google-oauth";
import { safeNextPath, siteOrigin } from "@/lib/server/auth";
import { exchangeCode, googleClient } from "@/lib/server/google";
import { forgetGuest } from "@/lib/server/guest";
import { usernameOf } from "@/lib/server/profile";
import { sessionClient } from "@/lib/server/supabase";

/**
 * Google sends the visitor back here. Check the state against the flow cookie,
 * trade the code for an ID token, and sign in to Supabase with it (the nonce
 * is checked there). Then the same landing as always: a first-time player
 * picks a username, everyone else goes where they were headed.
 */
export async function GET(request: Request) {
  const origin = siteOrigin(request);
  const url = new URL(request.url);
  const store = await cookies();
  const flow = decodeFlow(store.get(FLOW_COOKIE)?.value);
  // One use only, whatever happens next.
  store.set(FLOW_COOKIE, "", { path: CALLBACK_PATH, maxAge: 0 });

  const next = safeNextPath(flow?.next);
  const failed = () => NextResponse.redirect(`${origin}/login?error=failed&next=${encodeURIComponent(next)}`);

  if (!flow) {
    console.error("[auth] Google callback without a sign-in in progress (missing or expired flow cookie)");
    return failed();
  }
  if (!stateMatches(flow.state, url.searchParams.get("state"))) {
    console.error("[auth] Google callback with a state that does not match this browser's sign in");
    return failed();
  }
  // The player pressed Cancel on Google's screen: back to the sign-in page, no error.
  if (url.searchParams.get("error") === "access_denied") {
    return NextResponse.redirect(`${origin}/login?next=${encodeURIComponent(next)}`);
  }
  // Google refused for another reason.
  const code = url.searchParams.get("code");
  if (!code) {
    console.error(`[auth] Google callback without a code: ${url.searchParams.get("error") ?? "no error given"}`);
    return failed();
  }

  const client = googleClient();
  if (!client) {
    console.error("[auth] GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET is not set");
    return failed();
  }
  const idToken = await exchangeCode(code, flow, client);
  if (!idToken) return failed();

  const supabase = await sessionClient();
  const { data, error } = await supabase.auth.signInWithIdToken({ provider: "google", token: idToken, nonce: flow.nonce });
  if (error || !data.user) {
    console.error(`[auth] sign in could not be completed: ${error?.message ?? "no user returned"}`);
    return failed();
  }

  // Guest games are never moved onto an account. The guest is simply forgotten here.
  await forgetGuest();
  // First sign in: pick a username before anything else.
  const username = await usernameOf(data.user.id).catch(() => null);
  if (!username) return NextResponse.redirect(`${origin}/welcome?next=${encodeURIComponent(next)}`);
  return NextResponse.redirect(`${origin}${next}`);
}

import { NextResponse } from "next/server";
import { authorizationUrl, encodeFlow, FLOW_COOKIE, FLOW_MAX_AGE_SECONDS, CALLBACK_PATH, newFlow } from "@/lib/google-oauth";
import { safeNextPath, siteOrigin } from "@/lib/server/auth";
import { googleClient } from "@/lib/server/google";

/**
 * Starts Google sign in. The "Continue with Google" button is a form that posts
 * here. The browser goes straight to Google with this site's own callback as
 * the redirect, so Google's account screen names this site (see
 * src/lib/google-oauth.ts for the whole flow). Google is the only sign in method.
 */
export async function POST(request: Request) {
  const origin = siteOrigin(request);
  const form = await request.formData().catch(() => null);
  const nextValue = form?.get("next");
  const next = safeNextPath(typeof nextValue === "string" ? nextValue : null);

  const client = googleClient();
  if (!client) {
    console.error("[auth] could not start Google sign in: GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET is not set");
    return NextResponse.redirect(`${origin}/login?error=failed&next=${encodeURIComponent(next)}`, 303);
  }

  const flow = newFlow(origin, next);
  const response = NextResponse.redirect(await authorizationUrl(flow, client.id), 303);
  // Lax, so the cookie comes back on Google's top-level redirect to the callback; only sent to the callback.
  response.cookies.set(FLOW_COOKIE, encodeFlow(flow), {
    httpOnly: true,
    secure: origin.startsWith("https://"),
    sameSite: "lax",
    path: CALLBACK_PATH,
    maxAge: FLOW_MAX_AGE_SECONDS,
  });
  return response;
}

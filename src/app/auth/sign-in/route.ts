import { NextResponse } from "next/server";
import { safeNextPath, siteOrigin } from "@/lib/server/auth";
import { sessionClient } from "@/lib/server/supabase";

/**
 * Starts Google sign in. The "Sign in with Google" button is a form that posts
 * here; we ask Supabase for the Google address and send the browser to it.
 * Google is the only sign in method.
 */
export async function POST(request: Request) {
  const origin = siteOrigin(request);
  const form = await request.formData().catch(() => null);
  const nextValue = form?.get("next");
  const next = safeNextPath(typeof nextValue === "string" ? nextValue : null);

  const supabase = await sessionClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
      queryParams: { prompt: "select_account" },
    },
  });
  if (error || !data.url) {
    console.error(`[auth] could not start Google sign in: ${error?.message ?? "no URL returned"}`);
    return NextResponse.redirect(`${origin}/login?error=failed&next=${encodeURIComponent(next)}`, 303);
  }
  return NextResponse.redirect(data.url, 303);
}

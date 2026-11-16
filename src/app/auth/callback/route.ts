import { NextResponse } from "next/server";
import { safeNextPath, siteOrigin } from "@/lib/server/auth";
import { usernameOf } from "@/lib/server/profile";
import { sessionClient } from "@/lib/server/supabase";

/** Google sends the visitor back here. Trade the one-time code for a session cookie. */
export async function GET(request: Request) {
  const origin = siteOrigin(request);
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = safeNextPath(url.searchParams.get("next"));

  if (code) {
    const supabase = await sessionClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // First sign in: pick a username before anything else.
      const username = data.user ? await usernameOf(data.user.id).catch(() => null) : null;
      if (!username) return NextResponse.redirect(`${origin}/welcome?next=${encodeURIComponent(next)}`);
      return NextResponse.redirect(`${origin}${next}`);
    }
    console.error(`[auth] sign in could not be completed: ${error.message}`);
  }
  return NextResponse.redirect(`${origin}/?signin=failed`);
}

import { NextResponse } from "next/server";
import { safeNextPath, siteOrigin } from "@/lib/server/auth";
import { sessionClient } from "@/lib/server/supabase";

/** Google sends the visitor back here. Trade the one-time code for a session cookie. */
export async function GET(request: Request) {
  const origin = siteOrigin(request);
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = safeNextPath(url.searchParams.get("next"));

  if (code) {
    const supabase = await sessionClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);
    console.error(`[auth] sign in could not be completed: ${error.message}`);
  }
  return NextResponse.redirect(`${origin}/?signin=failed`);
}

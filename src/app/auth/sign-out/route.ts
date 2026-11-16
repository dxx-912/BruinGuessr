import { NextResponse } from "next/server";
import { siteOrigin } from "@/lib/server/auth";
import { sameOrigin } from "@/lib/server/http";
import { sessionClient } from "@/lib/server/supabase";

export async function POST(request: Request) {
  const origin = siteOrigin(request);
  if (sameOrigin(request)) {
    const supabase = await sessionClient();
    await supabase.auth.signOut({ scope: "local" });
  }
  return NextResponse.redirect(`${origin}/`, 303);
}

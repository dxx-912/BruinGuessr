import { NextResponse } from "next/server";
import { safeNextPath } from "@/lib/server/auth";
import { adminClient, sessionClient } from "@/lib/server/supabase";

/**
 * Development only: signs the browser in as a test account without Google, so
 * the game can be tested by scripts and with several accounts at once.
 *
 *   /api/dev/login?as=1          sign in as "Dev Player 1"
 *   /api/dev/login?as=2&next=/   sign in as "Dev Player 2", then go to /
 *
 * Returns 404 everywhere except `npm run dev`.
 */
export async function GET(request: Request) {
  if (process.env.NODE_ENV !== "development") return new Response("Not found", { status: 404 });

  const url = new URL(request.url);
  const n = Number(url.searchParams.get("as") ?? "1");
  if (!Number.isInteger(n) || n < 1 || n > 9) return new Response("as must be 1 to 9", { status: 400 });
  const email = `dev-player-${n}@bruinguessr.test`;

  const admin = adminClient();
  // Create the account the first time. "Already registered" is the normal case after that.
  await admin.auth.admin.createUser({ email, email_confirm: true, user_metadata: { full_name: `Dev Player ${n}` } });
  const link = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const token = link.data?.properties?.hashed_token;
  if (link.error || !token) return new Response(`Could not create a test session: ${link.error?.message}`, { status: 500 });

  const supabase = await sessionClient();
  const { error } = await supabase.auth.verifyOtp({ token_hash: token, type: "magiclink" });
  if (error) return new Response(`Could not sign in the test account: ${error.message}`, { status: 500 });

  return NextResponse.redirect(`${url.origin}${safeNextPath(url.searchParams.get("next"))}`);
}

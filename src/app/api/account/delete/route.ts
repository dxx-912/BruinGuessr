import { deleteAccount, usernameOf } from "@/lib/server/profile";
import { fail, json, readJson, requireUser, sameOrigin } from "@/lib/server/http";
import { sessionClient } from "@/lib/server/supabase";

/**
 * POST /api/account/delete { confirm: "<username>" } → deletes the signed-in
 * account, its games, its leaderboard entry and its session. The player
 * confirms by typing their username (capitals do not matter).
 */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return fail("bad_request");
  const user = await requireUser();
  if (user instanceof Response) return user;

  const { confirm } = await readJson(request);
  const username = await usernameOf(user.id);
  if (!username || typeof confirm !== "string" || confirm.trim().toLowerCase() !== username.toLowerCase()) {
    return json({ ok: false, problem: "confirm" }, 400);
  }

  await deleteAccount(user.id);
  // The session's tokens die with the account; this clears the cookies too.
  const supabase = await sessionClient();
  await supabase.auth.signOut({ scope: "local" }).catch(() => {});
  return json({ ok: true });
}

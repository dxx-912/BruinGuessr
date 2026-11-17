import { changeUsername, usernameOf } from "@/lib/server/profile";
import { fail, json, readJson, requireUser, sameOrigin } from "@/lib/server/http";

/**
 * POST /api/account/username { username } → changes the signed-in player's
 * username. Same rules as the first pick, at most once per 30 days.
 *   200 { ok: true, username, nextChangeAt }
 *   4xx { ok: false, problem, nextChangeAt? }
 */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return fail("bad_request");
  const user = await requireUser();
  if (user instanceof Response) return user;

  const { username } = await readJson(request);
  if (typeof username !== "string") return fail("bad_request");
  if (!(await usernameOf(user.id))) return fail("no_username");

  const result = await changeUsername(user.id, username.trim());
  if ("problem" in result) {
    const status = result.problem === "taken" || result.problem === "too_soon" ? 409 : 400;
    return json({ ok: false, problem: result.problem, nextChangeAt: result.nextChangeAt ?? null }, status);
  }
  return json({ ok: true, username: result.username, nextChangeAt: result.nextChangeAt });
}

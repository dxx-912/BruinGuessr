import { checkUsername, setUsername, usernameOf } from "@/lib/server/profile";
import { fail, json, readJson, requireUser, sameOrigin } from "@/lib/server/http";

/** GET /api/username?name=RoyceHall22 → { ok: true } or { ok: false, problem: "taken" } */
export async function GET(request: Request) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const name = new URL(request.url).searchParams.get("name") ?? "";
  const problem = await checkUsername(name);
  return json(problem ? { ok: false, problem } : { ok: true });
}

/** POST /api/username { username } → picks the signed-in player's username (once). */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return fail("bad_request");
  const user = await requireUser();
  if (user instanceof Response) return user;

  const { username } = await readJson(request);
  if (typeof username !== "string") return fail("bad_request");

  if (await usernameOf(user.id)) return json({ ok: false, problem: "locked" }, 409);
  const result = await setUsername(user.id, username.trim());
  if ("problem" in result) return json({ ok: false, problem: result.problem }, result.problem === "taken" || result.problem === "locked" ? 409 : 400);
  return json({ ok: true, username: result.username });
}

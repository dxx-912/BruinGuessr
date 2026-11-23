import { adminJson, requireAdmin } from "@/lib/server/admin";
import { REMOVAL_REASON_MAX } from "@/lib/leaderboard";
import { readJson } from "@/lib/server/http";
import { setLeaderboardRemoval } from "@/lib/server/profile";

const USERNAME = /^[A-Za-z0-9_]{3,16}$/;

/**
 * POST /api/admin/leaderboard/<username> { action: "remove", reason } or { action: "restore" }.
 * Admins only. A removed player stays off the board until restored and sees the reason.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/admin/leaderboard/[username]">) {
  const admin = await requireAdmin(request, true);
  if (admin instanceof Response) return admin;
  const { username } = await ctx.params;
  const { action, reason } = await readJson(request);
  const text = typeof reason === "string" ? reason.trim() : "";
  const valid = USERNAME.test(username) && (action === "restore" || (action === "remove" && text.length > 0 && text.length <= REMOVAL_REASON_MAX));
  if (!valid) return adminJson({ ok: false, problem: "bad_request" }, 400);
  if (action === "remove" && username.toLowerCase() === admin.username?.toLowerCase()) return adminJson({ ok: false, problem: "bad_request" }, 400);
  const found = await setLeaderboardRemoval(username, action === "remove" ? text : null);
  return found ? adminJson({ ok: true }) : adminJson({ ok: false, problem: "not_found" }, 404);
}

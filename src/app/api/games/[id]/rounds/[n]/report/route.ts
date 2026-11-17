import { REPORT_REASONS, type ReportReason } from "@/lib/game/types";
import { reportImage } from "@/lib/server/game";
import { fail, isUuid, readJson, reply, requirePlayer, roundNumber, sameOrigin } from "@/lib/server/http";

/** Reports the photo from a finished round as bad. */
export async function POST(request: Request, ctx: RouteContext<"/api/games/[id]/rounds/[n]/report">) {
  if (!sameOrigin(request)) return fail("bad_request");
  const { id, n } = await ctx.params;
  const round = roundNumber(n);
  if (!isUuid(id) || round === null) return fail("not_found");
  const user = await requirePlayer();
  if (user instanceof Response) return user;
  // Reports hide photos, so they need an account: a guest costs nothing to make.
  if (user.guest) return fail("account_required");

  const body = await readJson(request);
  const known = REPORT_REASONS.some((r) => r.id === body.reason) || body.reason === "other";
  const reason: ReportReason = known ? (body.reason as ReportReason) : "other";
  return reply(await reportImage(id, user.id, round, reason));
}

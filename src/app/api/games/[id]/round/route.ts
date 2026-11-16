import { startRound } from "@/lib/server/game";
import { fail, isUuid, reply, requireUser, sameOrigin } from "@/lib/server/http";

/** Opens the next round and starts its clock on the server. */
export async function POST(request: Request, ctx: RouteContext<"/api/games/[id]/round">) {
  if (!sameOrigin(request)) return fail("bad_request");
  const { id } = await ctx.params;
  if (!isUuid(id)) return fail("not_found");
  const user = await requireUser();
  if (user instanceof Response) return user;
  return reply(await startRound(id, user.id));
}

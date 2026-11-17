import { startRound } from "@/lib/server/game";
import { pingRoom } from "@/lib/server/rooms";
import { fail, isUuid, reply, requirePlayer, sameOrigin } from "@/lib/server/http";

/** Opens the next round and starts its clock on the server. */
export async function POST(request: Request, ctx: RouteContext<"/api/games/[id]/round">) {
  if (!sameOrigin(request)) return fail("bad_request");
  const { id } = await ctx.params;
  if (!isUuid(id)) return fail("not_found");
  const user = await requirePlayer();
  if (user instanceof Response) return user;
  const result = await startRound(id, user.id);
  // Versus: everyone else's screen moves to the new round with this one.
  pingRoom(result);
  return reply(result);
}

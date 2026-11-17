import { gameState } from "@/lib/server/game";
import { fail, isUuid, reply, requirePlayer } from "@/lib/server/http";

/** Where the player's game stands. Also notices when the current round has run out of time. */
export async function GET(_request: Request, ctx: RouteContext<"/api/games/[id]">) {
  const { id } = await ctx.params;
  if (!isUuid(id)) return fail("not_found");
  const user = await requirePlayer();
  if (user instanceof Response) return user;
  return reply(await gameState(id, user.id));
}

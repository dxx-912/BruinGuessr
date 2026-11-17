import { lockGuess } from "@/lib/server/game";
import { pingRoom } from "@/lib/server/rooms";
import { coordinate, fail, isUuid, readJson, reply, requirePlayer, roundNumber, sameOrigin } from "@/lib/server/http";

/**
 * The player pressed Guess. The server locks the pin and answers with the game
 * state. In a solo game that state already holds the reveal; in a versus game
 * the round is scored once everyone still playing has guessed.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/games/[id]/guess">) {
  if (!sameOrigin(request)) return fail("bad_request");
  const { id } = await ctx.params;
  if (!isUuid(id)) return fail("not_found");
  const user = await requirePlayer();
  if (user instanceof Response) return user;

  const body = await readJson(request);
  const round = roundNumber(body.round);
  if (round === null) return fail("bad_request");
  const hasPin = body.lat !== undefined || body.lng !== undefined;
  const lat = hasPin ? coordinate(body.lat, 90) : null;
  const lng = hasPin ? coordinate(body.lng, 180) : null;
  if (hasPin && (lat === null || lng === null)) return fail("bad_pin");
  const result = await lockGuess(id, user.id, round, lat, lng);
  // Versus: the other players see the check mark, or the reveal, straight away.
  pingRoom(result);
  return reply(result);
}

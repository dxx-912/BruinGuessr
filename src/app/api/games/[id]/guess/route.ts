import { lockGuess } from "@/lib/server/game";
import { coordinate, fail, isUuid, readJson, reply, requireUser, roundNumber, sameOrigin } from "@/lib/server/http";

/**
 * The player pressed Guess. The server locks the pin, scores the round and
 * answers with the game state, which now includes the reveal for that round.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/games/[id]/guess">) {
  if (!sameOrigin(request)) return fail("bad_request");
  const { id } = await ctx.params;
  if (!isUuid(id)) return fail("not_found");
  const user = await requireUser();
  if (user instanceof Response) return user;

  const body = await readJson(request);
  const round = roundNumber(body.round);
  if (round === null) return fail("bad_request");
  const hasPin = body.lat !== undefined || body.lng !== undefined;
  const lat = hasPin ? coordinate(body.lat, 90) : null;
  const lng = hasPin ? coordinate(body.lng, 180) : null;
  if (hasPin && (lat === null || lng === null)) return fail("bad_pin");
  return reply(await lockGuess(id, user.id, round, lat, lng));
}

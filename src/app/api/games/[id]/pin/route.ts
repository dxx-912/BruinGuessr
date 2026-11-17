import { placePin } from "@/lib/server/game";
import { coordinate, fail, isUuid, readJson, reply, requirePlayer, roundNumber, sameOrigin } from "@/lib/server/http";

/**
 * Saves where the player's pin is. Sent every time the pin moves, so the guess
 * is already on the server when the clock hits zero.
 */
export async function PUT(request: Request, ctx: RouteContext<"/api/games/[id]/pin">) {
  if (!sameOrigin(request)) return fail("bad_request");
  const { id } = await ctx.params;
  if (!isUuid(id)) return fail("not_found");
  const user = await requirePlayer();
  if (user instanceof Response) return user;

  const body = await readJson(request);
  const round = roundNumber(body.round);
  const lat = coordinate(body.lat, 90);
  const lng = coordinate(body.lng, 180);
  if (round === null) return fail("bad_request");
  if (lat === null || lng === null) return fail("bad_pin");
  return reply(await placePin(id, user.id, round, lat, lng));
}

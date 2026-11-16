import { fail, json, requireUser, roomCode, sameOrigin } from "@/lib/server/http";
import { leaveRoom, pingRoom } from "@/lib/server/rooms";

/**
 * Leaves the room. In the lobby the seat is freed. During a game the seat is
 * kept, so the player can come back; rounds they miss score 0. If the host
 * leaves, the next player becomes the host.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/rooms/[code]/leave">) {
  if (!sameOrigin(request)) return fail("bad_request");
  const code = roomCode((await ctx.params).code);
  if (!code) return fail("not_found");
  const user = await requireUser();
  if (user instanceof Response) return user;
  const result = await leaveRoom(code, user.id);
  if ("error" in result) return fail(result.error);
  pingRoom(result);
  return json({ ok: true });
}

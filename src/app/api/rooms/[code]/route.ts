import { fail, reply, requireUser, roomCode } from "@/lib/server/http";
import { roomState } from "@/lib/server/rooms";

/** Where the room stands, for a player in it. Asked every few seconds; that is how the room knows who is still here. */
export async function GET(_request: Request, ctx: RouteContext<"/api/rooms/[code]">) {
  const code = roomCode((await ctx.params).code);
  if (!code) return fail("not_found");
  const user = await requireUser();
  if (user instanceof Response) return user;
  return reply(await roomState(code, user.id));
}

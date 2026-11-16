import { fail, reply, requireUser, sameOrigin } from "@/lib/server/http";
import { usernameOf } from "@/lib/server/profile";
import { createRoom } from "@/lib/server/rooms";

/** Hosts a versus game: makes a room with a fresh code and puts the player in seat one. */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return fail("bad_request");
  const user = await requireUser();
  if (user instanceof Response) return user;
  // Other players see this name in the lobby and on the scoreboard.
  if (!(await usernameOf(user.id))) return fail("no_username");
  return reply(await createRoom(user.id));
}

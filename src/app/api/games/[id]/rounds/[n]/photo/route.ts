import { roundPhoto } from "@/lib/server/game";
import { isUuid, requireUser, roundNumber } from "@/lib/server/http";

const HEADERS = {
  // Never keep a copy under this address, anywhere.
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
  "X-Robots-Tag": "noindex",
};

const gone = () => new Response("Not found", { status: 404, headers: HEADERS });

/**
 * The photo for one round of one game. Works only for a player in that game,
 * and only while that round is open; once the round is scored or its time is
 * up, this address answers 404 for good.
 *
 * The photo's real location in Storage is never sent to the browser. The bytes
 * are read with the secret key and passed through.
 */
export async function GET(_request: Request, ctx: RouteContext<"/api/games/[id]/rounds/[n]/photo">) {
  const { id, n } = await ctx.params;
  const round = roundNumber(n);
  if (!isUuid(id) || round === null) return gone();
  const user = await requireUser();
  if (user instanceof Response) return gone();

  const photo = await roundPhoto(id, user.id, round);
  if (!photo) return gone();
  return new Response(photo, {
    headers: { ...HEADERS, "Content-Type": "image/webp", "Content-Length": String(photo.size) },
  });
}

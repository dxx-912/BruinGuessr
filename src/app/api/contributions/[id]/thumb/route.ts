import { contributionThumb } from "@/lib/server/contributions";
import { isUuid, requireUser } from "@/lib/server/http";

const HEADERS = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "X-Robots-Tag": "noindex" };
const gone = () => new Response("Not found", { status: 404, headers: HEADERS });

/**
 * A small copy of one of the signed-in player's own submissions (waiting or
 * live), for their "Your photos" list. Anyone else's answers 404.
 */
export async function GET(_request: Request, ctx: RouteContext<"/api/contributions/[id]/thumb">) {
  const { id } = await ctx.params;
  if (!isUuid(id)) return gone();
  const user = await requireUser();
  if (user instanceof Response) return gone();
  const bytes = await contributionThumb(user.id, id);
  if (!bytes) return gone();
  return new Response(new Uint8Array(bytes), { headers: { ...HEADERS, "Content-Type": "image/webp", "Content-Length": String(bytes.length) } });
}

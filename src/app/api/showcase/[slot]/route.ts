import { SHOWCASE_COUNT, showcaseBatch, showcasePhoto } from "@/lib/server/showcase";

const gone = () => new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });

/**
 * One of the Play page's "Where is this?" photos (see lib/server/showcase.ts).
 * The address names a slot and a batch, never a photo. `b` must be the batch
 * showing now or the one before it (a page loaded just before the change),
 * so nobody can page through old batches to collect the pool.
 */
export async function GET(request: Request, ctx: RouteContext<"/api/showcase/[slot]">) {
  const slot = Number((await ctx.params).slot);
  if (!Number.isInteger(slot) || slot < 0 || slot >= SHOWCASE_COUNT) return gone();
  const now = showcaseBatch(Date.now());
  const asked = Number(new URL(request.url).searchParams.get("b"));
  const batch = asked === now || asked === now - 1 ? asked : now;

  const photo = await showcasePhoto(batch, slot);
  if (!photo) return gone();
  return new Response(new Uint8Array(photo), {
    headers: {
      "Content-Type": "image/webp",
      "Content-Length": String(photo.length),
      // A slot in a batch is always the same picture, and it holds nothing secret.
      "Cache-Control": asked === batch ? "public, max-age=21600, immutable" : "public, max-age=300",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex",
    },
  });
}

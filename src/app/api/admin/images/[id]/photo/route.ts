import { ADMIN_HEADERS, requireAdmin } from "@/lib/server/admin";
import { poolPreview } from "@/lib/server/contributions";
import { isUuid } from "@/lib/server/http";

/** A small copy of a photo already in the pool, to compare with a submission on the review page. Admins only. */
export async function GET(request: Request, ctx: RouteContext<"/api/admin/images/[id]/photo">) {
  const admin = await requireAdmin(request);
  if (admin instanceof Response) return admin;
  const { id } = await ctx.params;
  const bytes = isUuid(id) ? await poolPreview(admin.id, id) : null;
  if (!bytes) return new Response("Not found", { status: 404, headers: ADMIN_HEADERS });
  return new Response(new Uint8Array(bytes), { headers: { ...ADMIN_HEADERS, "Content-Type": "image/webp", "Content-Length": String(bytes.length) } });
}

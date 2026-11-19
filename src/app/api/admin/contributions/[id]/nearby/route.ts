import { ADMIN_HEADERS, adminJson, requireAdmin } from "@/lib/server/admin";
import { nearbyImages } from "@/lib/server/contributions";
import { coordinate, isUuid } from "@/lib/server/http";

/**
 * GET /api/admin/contributions/<id>/nearby?lat=…&lng=…&heading=… → photos in
 * rotation within 22 m of the pin facing within 40° of the heading (the
 * pipeline's near-duplicate rule). The pin is the reviewer's current one, which
 * may have been moved. Admins only.
 */
export async function GET(request: Request, ctx: RouteContext<"/api/admin/contributions/[id]/nearby">) {
  const admin = await requireAdmin(request);
  if (admin instanceof Response) return admin;
  const { id } = await ctx.params;
  const q = new URL(request.url).searchParams;
  const lat = coordinate(Number(q.get("lat")), 90);
  const lng = coordinate(Number(q.get("lng")), 180);
  const headingText = q.get("heading");
  const heading = headingText === null || headingText === "" ? null : Number(headingText);
  if (!isUuid(id) || lat === null || lng === null || (heading !== null && !(heading >= 0 && heading <= 360))) return adminJson({ error: "bad_request" }, 400);
  const near = await nearbyImages(admin.id, lat, lng, heading);
  return near ? adminJson({ near }) : new Response("Not found", { status: 404, headers: ADMIN_HEADERS });
}

import { normalisedBoxes } from "@/lib/contribute/faces";
import { adminJson, requireAdmin } from "@/lib/server/admin";
import { approveContribution, type ReviewProblem } from "@/lib/server/contributions";
import { coordinate, isUuid, readJson } from "@/lib/server/http";

const STATUS: Record<ReviewProblem, number> = {
  not_found: 404,
  already_decided: 409,
  bad_pin: 400,
  outside_campus: 400,
  faces_unchecked: 409,
  pin_unchecked: 409,
  bad_reason: 400,
  server_error: 500,
};

/**
 * POST /api/admin/contributions/<id>/approve
 *   { lat, lng, pinConfirmed, facesChecked, blur: [{ x, y, w, h }] }
 *   (the boxes to blur, as fractions of the photo: the detector's suggestions
 *   the reviewer kept plus any they drew; nothing else is blurred)
 * → publishes the photo at once. Admins only, from our own pages.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/admin/contributions/[id]/approve">) {
  const admin = await requireAdmin(request, true);
  if (admin instanceof Response) return admin;
  const { id } = await ctx.params;
  const body = await readJson(request);
  const lat = coordinate(body.lat, 90);
  const lng = coordinate(body.lng, 180);
  const blur = normalisedBoxes(body.blur ?? []);
  if (!isUuid(id) || lat === null || lng === null || blur === null) return adminJson({ ok: false, problem: "bad_pin" }, 400);
  const result = await approveContribution(admin.id, id, {
    lat,
    lng,
    pinConfirmed: body.pinConfirmed === true,
    facesChecked: body.facesChecked === true,
    blur,
  });
  return result.ok ? adminJson(result) : adminJson(result, STATUS[result.problem]);
}

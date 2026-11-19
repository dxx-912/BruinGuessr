import { adminJson, requireAdmin } from "@/lib/server/admin";
import { rejectContribution } from "@/lib/server/contributions";
import { isUuid, readJson } from "@/lib/server/http";

/** POST /api/admin/contributions/<id>/reject { reason } → turns it down and deletes the file at once. Admins only. */
export async function POST(request: Request, ctx: RouteContext<"/api/admin/contributions/[id]/reject">) {
  const admin = await requireAdmin(request, true);
  if (admin instanceof Response) return admin;
  const { id } = await ctx.params;
  const { reason } = await readJson(request);
  const text = typeof reason === "string" ? reason.trim() : "";
  if (!isUuid(id) || !text || text.length > 300) return adminJson({ ok: false, problem: "bad_reason" }, 400);
  const result = await rejectContribution(admin.id, id, text);
  const status = result.ok ? 200 : result.problem === "not_found" ? 404 : result.problem === "already_decided" ? 409 : result.problem === "bad_reason" ? 400 : 500;
  return adminJson(result, status);
}

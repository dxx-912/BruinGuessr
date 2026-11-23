import { adminJson, requireAdmin } from "@/lib/server/admin";
import { isUuid, readJson } from "@/lib/server/http";
import { decideReported } from "@/lib/server/reports";

/** POST /api/admin/reports/<image id> { action: "keep" | "remove" }. Admins only. */
export async function POST(request: Request, ctx: RouteContext<"/api/admin/reports/[id]">) {
  const admin = await requireAdmin(request, true);
  if (admin instanceof Response) return admin;
  const { id } = await ctx.params;
  const { action } = await readJson(request);
  if (!isUuid(id) || (action !== "keep" && action !== "remove")) return adminJson({ ok: false, problem: "bad_request" }, 400);
  const result = await decideReported(id, action);
  return result === "ok" ? adminJson({ ok: true }) : adminJson({ ok: false, problem: "not_found" }, 404);
}

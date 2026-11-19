import { ADMIN_HEADERS, adminJson, requireAdmin } from "@/lib/server/admin";
import { reviewQueue } from "@/lib/server/contributions";

/** GET /api/admin/contributions → the review queue: people first, then pin checks, then oldest. Admins only; 404 for anyone else. */
export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof Response) return admin;
  const queue = await reviewQueue(admin.id);
  return queue ? adminJson({ queue }) : new Response("Not found", { status: 404, headers: ADMIN_HEADERS });
}

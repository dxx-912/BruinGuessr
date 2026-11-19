import { ADMIN_HEADERS, requireAdmin } from "@/lib/server/admin";
import { waitingPhoto } from "@/lib/server/contributions";
import { isUuid } from "@/lib/server/http";

/** The waiting photo of one submission, as stored. Admins only; never cached. */
export async function GET(request: Request, ctx: RouteContext<"/api/admin/contributions/[id]/photo">) {
  const admin = await requireAdmin(request);
  if (admin instanceof Response) return admin;
  const { id } = await ctx.params;
  const bytes = isUuid(id) ? await waitingPhoto(admin.id, id) : null;
  if (!bytes) return new Response("Not found", { status: 404, headers: ADMIN_HEADERS });
  return new Response(new Uint8Array(bytes), {
    headers: { ...ADMIN_HEADERS, "Content-Type": "image/jpeg", "Content-Length": String(bytes.length), "X-Content-Type-Options": "nosniff" },
  });
}

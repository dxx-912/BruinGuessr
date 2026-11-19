import "server-only";
import { notFound } from "next/navigation";
import { currentUser } from "./auth";
import { fail, sameOrigin } from "./http";
import { adminClient } from "./supabase";

export type Admin = { id: string; username: string | null };

/**
 * The signed-in admin, or null. The one place every admin page and API asks.
 *
 * The role is read from the database on every call: never from the session
 * token, whose user metadata the player can edit. Revoking (npm run admin --
 * revoke) therefore takes effect on the next request.
 */
export async function currentAdmin(): Promise<Admin | null> {
  const user = await currentUser();
  if (!user) return null;
  const { data, error } = await adminClient()
    .from("profiles")
    .select("username, role, is_guest")
    .eq("id", user.id)
    .maybeSingle();
  if (error) throw new Error(`[admin] could not read the role: ${error.message}`);
  if (!data || data.is_guest || data.role !== "admin") return null;
  return { id: user.id, username: data.username ?? null };
}

/** For admin pages: the admin, or the ordinary 404 page for anyone else. */
export async function adminOr404(): Promise<Admin> {
  const admin = await currentAdmin();
  if (!admin) notFound();
  return admin;
}

/** Headers for every admin response: never stored by a browser or a cache. */
export const ADMIN_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  "X-Robots-Tag": "noindex, nofollow",
};

const notFoundResponse = () => new Response("Not found", { status: 404, headers: ADMIN_HEADERS });

/**
 * For admin APIs: the admin, or a 404 to return as is (the same answer an
 * address that does not exist gets, so nobody learns the API is there). Writes
 * must also come from our own pages.
 */
export async function requireAdmin(request: Request, write = false): Promise<Admin | Response> {
  const admin = await currentAdmin();
  if (!admin) return notFoundResponse();
  if (write && !sameOrigin(request)) return fail("bad_request");
  return admin;
}

export function adminJson(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: ADMIN_HEADERS });
}

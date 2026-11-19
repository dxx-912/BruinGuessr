import type { Metadata } from "next";
import { adminOr404 } from "@/lib/server/admin";
import ReviewClient from "./ReviewClient";

export const metadata: Metadata = { title: "Review contributions", robots: { index: false, follow: false } };

/**
 * The review queue for contributed photos. Admins only: anyone else gets the
 * ordinary 404 page, with a 404 status. The role is looked up in the database
 * on every request (adminOr404), so this page blocks on the server instead of
 * streaming a shell first, which is what lets it answer 404 rather than 200.
 * Its responses are never cached (a dynamic page sends no-store).
 */
export const instant = false;

export default async function ReviewPage() {
  const admin = await adminOr404();
  return <ReviewClient adminName={admin.username ?? "admin"} />;
}

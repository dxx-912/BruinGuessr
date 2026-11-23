import "server-only";
import { adminClient } from "./supabase";

const REPORTED = "reported by players";
const REMOVED = "removed after review";

export const REPORT_REASONS: Record<string, string> = {
  wrong_location: "Answer in the wrong place",
  unclear: "Blurry, dark or impossible to place",
  not_campus: "Not a campus photo",
  inappropriate: "Inappropriate",
  other: "Something else",
};

export type ReportedPhoto = {
  id: string;
  lat: number;
  lng: number;
  hidden: boolean;
  hiddenReason: string | null;
  reportCount: number;
  latest: string | null;
  reasons: { reason: string; n: number }[];
};

/** Photos with reports, or removed after a review, most reported first. */
export async function reportedPhotos(): Promise<ReportedPhoto[]> {
  const db = adminClient();
  const images = await db
    .from("images")
    .select("id, lat, lng, report_count, hidden, hidden_reason")
    .or(`report_count.gt.0,hidden_reason.eq.${REMOVED}`)
    .order("report_count", { ascending: false });
  if (images.error) throw new Error(`[reports] ${images.error.message}`);
  if (!images.data.length) return [];
  const reports = await db.from("image_reports").select("image_id, reason, created_at").in("image_id", images.data.map((i) => i.id));
  if (reports.error) throw new Error(`[reports] ${reports.error.message}`);
  return images.data.map((i) => {
    const mine = reports.data.filter((r) => r.image_id === i.id);
    const tally = new Map<string, number>();
    for (const r of mine) tally.set(r.reason, (tally.get(r.reason) ?? 0) + 1);
    return {
      id: i.id,
      lat: i.lat,
      lng: i.lng,
      hidden: i.hidden,
      hiddenReason: i.hidden_reason,
      reportCount: i.report_count,
      latest: mine.map((r) => r.created_at).sort().at(-1) ?? null,
      reasons: [...tally].map(([reason, n]) => ({ reason, n })),
    };
  });
}

/** keep: the photo is fine, clear its reports. remove: out of rotation for good. Nothing is deleted. */
export async function decideReported(id: string, action: "keep" | "remove"): Promise<"ok" | "not_found"> {
  const db = adminClient();
  const found = await db.from("images").select("id, hidden, hidden_reason").eq("id", id).maybeSingle();
  if (found.error) throw new Error(`[reports] ${found.error.message}`);
  if (!found.data) return "not_found";
  if (action === "remove") {
    const upd = await db.from("images").update({ hidden: true, hidden_reason: REMOVED }).eq("id", id);
    if (upd.error) throw new Error(`[reports] ${upd.error.message}`);
    return "ok";
  }
  const del = await db.from("image_reports").delete().eq("image_id", id);
  if (del.error) throw new Error(`[reports] ${del.error.message}`);
  // Un-hide only if reports (or an earlier review) hid it; a photo withdrawn some other way stays withdrawn.
  const unhide = found.data.hidden && (found.data.hidden_reason === REPORTED || found.data.hidden_reason === REMOVED);
  const upd = await db
    .from("images")
    .update(unhide ? { report_count: 0, hidden: false, hidden_reason: null } : { report_count: 0 })
    .eq("id", id);
  if (upd.error) throw new Error(`[reports] ${upd.error.message}`);
  return "ok";
}

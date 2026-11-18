import "server-only";
import sharp from "sharp";
import { PHOTO_BUCKET } from "./game";
import { adminClient } from "./supabase";

/**
 * The "Where is this?" photos on the Play page: a few photos from the game
 * pool, shown as a teaser. Nothing here may tie a photo to a place or to a
 * round, so:
 * - the browser asks for a slot and a batch number (`/api/showcase/2?b=…`),
 *   never a photo's ID or storage path;
 * - the bytes are re-cut and re-encoded here (a smaller, cropped copy), so
 *   they are never the same file a round serves and cannot be matched to it;
 * - no location, credit or source goes out with them.
 * The set changes every few hours; within a batch a slot always shows the
 * same photo, so the copies can be cached.
 */

export const SHOWCASE_COUNT = 5;

/** How long one set of photos stays up. */
const BATCH_MS = 6 * 60 * 60 * 1000;

/** The served copy: small, landscape, cropped toward whatever is interesting. */
const WIDTH = 560;
const HEIGHT = 400;

/** The batch showing at a given moment. */
export const showcaseBatch = (now: number = Date.now()) => Math.floor(now / BATCH_MS);

/** A small, repeatable random sequence (mulberry32), so every server picks the same photos for a batch. */
function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Which of `size` photos fill the slots in a batch: a seeded shuffle, first few taken. */
export function showcasePicks(batch: number, size: number): number[] {
  const order = Array.from({ length: size }, (_, i) => i);
  const random = seeded(batch * 2654435761);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order.slice(0, Math.min(SHOWCASE_COUNT, size));
}

/**
 * The bytes for one slot of a batch, or null if there is no photo for it.
 * Only landscape photos in rotation that nobody has reported.
 */
export async function showcasePhoto(batch: number, slot: number): Promise<Buffer | null> {
  const admin = adminClient();
  const { data, error } = await admin
    .from("images")
    .select("storage_path, width, height")
    .eq("hidden", false)
    .eq("report_count", 0)
    .order("id");
  if (error) {
    console.error(`[showcase] could not list photos: ${error.message}`);
    return null;
  }
  const pool = (data ?? []).filter((row) => row.width > row.height * 1.15).map((row) => row.storage_path as string);
  const pick = showcasePicks(batch, pool.length)[slot];
  if (pick === undefined) return null;

  const file = await admin.storage.from(PHOTO_BUCKET).download(pool[pick]);
  if (file.error || !file.data) {
    console.error(`[showcase] photo download failed: ${file.error?.message ?? "no data"}`);
    return null;
  }
  // sharp re-encodes from pixels, so no metadata survives.
  return sharp(Buffer.from(await file.data.arrayBuffer()))
    .resize(WIDTH, HEIGHT, { fit: "cover", position: sharp.strategy.attention })
    .webp({ quality: 70 })
    .toBuffer();
}

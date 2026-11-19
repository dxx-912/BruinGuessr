import "server-only";
import { randomBytes } from "node:crypto";
import sharp from "sharp";
import type { Box } from "@/lib/contribute/faces";
import {
  MAX_ASPECT,
  MAX_UPLOAD_BYTES,
  MIN_LONG_EDGE,
  MIN_SHORT_EDGE,
  MIN_UPLOAD_BYTES,
  UPLOAD_LONG_EDGE,
  checkMeta,
  insideCampus,
  trueHeading,
  type MetaProblem,
} from "@/lib/contribute/rules";
import type { MyContribution, NearbyImage, QueueItem, Quota } from "@/lib/contribute/types";
import { PIPELINE } from "@/lib/pipeline/config";
import { hasMetadata, sharpnessOf } from "@/lib/pipeline/quality";
import { PHOTO_BUCKET } from "./game";
import { adminClient } from "./supabase";

/** Waiting submissions. Private, no policies: only the secret key reads or writes. */
export const CONTRIBUTION_BUCKET = "contributions";

export type SubmitProblem =
  | MetaProblem
  | "file_type"
  | "file_size"
  | "dimensions"
  | "blurry"
  | "daily_limit"
  | "waiting_limit"
  | "account_required"
  | "no_username"
  | "server_error";

const log = (what: string, error: unknown) =>
  console.error(`[contribute] ${what}: ${error instanceof Error ? error.message : typeof error === "object" && error && "message" in error ? (error as { message: string }).message : String(error)}`);

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await adminClient().rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data as T;
}

const randomName = (ext: "jpg" | "webp") => `${randomBytes(16).toString("hex")}.${ext}`;

async function removeFiles(bucket: string, paths: string[]): Promise<void> {
  const list = paths.filter(Boolean);
  if (!list.length) return;
  const { error } = await adminClient().storage.from(bucket).remove(list);
  if (error) log(`could not delete ${list.length} file(s) from ${bucket}`, error);
}

async function download(bucket: string, path: string): Promise<Buffer | null> {
  const { data, error } = await adminClient().storage.from(bucket).download(path);
  if (error || !data) {
    log(`download from ${bucket} failed`, error ?? "no data");
    return null;
  }
  return Buffer.from(await data.arrayBuffer());
}

// ---------------------------------------------------------------------------
// The contributor's side
// ---------------------------------------------------------------------------

export const contributionQuota = (userId: string) => rpc<Quota>("contribution_quota", { p_user: userId });

export const myContributions = (userId: string) => rpc<MyContribution[]>("my_contributions", { p_user: userId, p_limit: 60 });

/** The first bytes say what a file really is; the name and the browser's word for it do not count. */
function sniff(bytes: Buffer): "jpeg" | "webp" | null {
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  if (bytes.length > 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") return "webp";
  return null;
}

/**
 * Checks a photo sent from the Contribute page and, if it passes, stores it to
 * wait for review. Every rule is checked here again, whatever the page did.
 *
 * The file is re-encoded by sharp, which writes no metadata (EXIF, GPS, XMP,
 * ICC), and the result goes through the pipeline's metadata check before
 * anything is stored.
 */
export async function submitContribution(
  userId: string,
  file: File,
  rawMeta: unknown,
): Promise<{ ok: true; id: string } | { ok: false; problem: SubmitProblem }> {
  const no = (problem: SubmitProblem) => ({ ok: false as const, problem });

  const checked = checkMeta(rawMeta, Date.now());
  if ("problem" in checked) return no(checked.problem);
  const meta = checked.meta;

  // Cheap first: is there room under the limits? (Checked again under a lock when storing.)
  const quota = await contributionQuota(userId);
  if (quota.last24h >= quota.dailyLimit) return no("daily_limit");
  if (quota.waiting >= quota.waitingLimit) return no("waiting_limit");

  if (file.size > MAX_UPLOAD_BYTES || file.size < MIN_UPLOAD_BYTES) return no("file_size");
  const bytes = Buffer.from(await file.arrayBuffer());
  if (!sniff(bytes)) return no("file_type");

  let stored: Buffer;
  let width: number;
  let height: number;
  try {
    const info = await sharp(bytes, { failOn: "error" }).metadata();
    if (info.format !== "jpeg" && info.format !== "webp") return no("file_type");
    // .rotate() bakes any orientation tag into the pixels, so the stored file needs none.
    const out = await sharp(bytes, { failOn: "error" }).rotate().jpeg({ quality: 90 }).toBuffer({ resolveWithObject: true });
    stored = out.data;
    width = out.info.width;
    height = out.info.height;
  } catch (err) {
    log("unreadable upload", err);
    return no("file_type");
  }
  const long = Math.max(width, height);
  const short = Math.min(width, height);
  if (long > UPLOAD_LONG_EDGE || long < MIN_LONG_EDGE || short < MIN_SHORT_EDGE || long / short > MAX_ASPECT) return no("dimensions");
  if (await hasMetadata(stored)) {
    log("re-encoded upload still carries metadata", "refused");
    return no("server_error");
  }
  const sharpness = await sharpnessOf(stored);
  if (sharpness < PIPELINE.minSharpness) return no("blurry");

  const path = randomName("jpg");
  const up = await adminClient().storage.from(CONTRIBUTION_BUCKET).upload(path, stored, { contentType: "image/jpeg", upsert: false });
  if (up.error) {
    log("upload failed", up.error);
    return no("server_error");
  }

  let result: { ok?: true; id?: string; error?: string };
  try {
    result = await rpc("submit_contribution", {
      p_user: userId,
      p_storage_path: path,
      p_gps_lat: meta.lat,
      p_gps_lng: meta.lng,
      p_accuracy_m: meta.accuracy,
      p_heading: meta.heading === null ? null : trueHeading(meta.heading),
      p_position_at: new Date(meta.positionAt).toISOString(),
      p_captured_at: new Date(meta.capturedAt).toISOString(),
      p_capture_width: meta.captureWidth,
      p_capture_height: meta.captureHeight,
      p_width: width,
      p_height: height,
      p_sharpness: sharpness,
      p_people: meta.people,
      p_faces: meta.faces,
    });
  } catch (err) {
    log("submit_contribution failed", err);
    await removeFiles(CONTRIBUTION_BUCKET, [path]);
    return no("server_error");
  }
  if (!result.ok || !result.id) {
    await removeFiles(CONTRIBUTION_BUCKET, [path]);
    const known: SubmitProblem[] = ["daily_limit", "waiting_limit", "account_required", "no_username"];
    return no(known.includes(result.error as SubmitProblem) ? (result.error as SubmitProblem) : result.error === "bad_accuracy" ? "too_inaccurate" : "server_error");
  }
  return { ok: true, id: result.id };
}

/** A small copy of one of the player's own submissions for their list, or null. */
export async function contributionThumb(userId: string, id: string): Promise<Buffer | null> {
  const where = await rpc<{ bucket: string; path: string } | null>("my_contribution_file", { p_user: userId, p_id: id });
  if (!where?.path || (where.bucket !== CONTRIBUTION_BUCKET && where.bucket !== PHOTO_BUCKET)) return null;
  const bytes = await download(where.bucket, where.path);
  if (!bytes) return null;
  // Re-encoded small, so these bytes never match the file a round serves.
  return sharp(bytes).rotate().resize({ width: 240, height: 240, fit: "cover" }).webp({ quality: 70 }).toBuffer();
}

/**
 * Before an account is deleted: takes its photos out of the game for good and
 * deletes their files, live and waiting. Past rounds keep their scores.
 */
export async function withdrawAccountPhotos(userId: string): Promise<void> {
  const files = await rpc<{ live: string[]; waiting: string[] }>("withdraw_contributions", { p_user: userId });
  await Promise.all([removeFiles(PHOTO_BUCKET, files.live), removeFiles(CONTRIBUTION_BUCKET, files.waiting)]);
}

// ---------------------------------------------------------------------------
// Review (admins only; the database checks the role again on every call)
// ---------------------------------------------------------------------------

type Refused = { error: string };
const refused = (x: unknown): x is Refused => !!x && typeof x === "object" && "error" in x;

export async function reviewQueue(adminId: string): Promise<QueueItem[] | null> {
  const queue = await rpc<QueueItem[] | Refused>("contribution_queue", { p_admin: adminId });
  return refused(queue) ? null : queue;
}

/** The waiting photo as stored (JPEG, at most 2048 px), or null. */
export async function waitingPhoto(adminId: string, id: string): Promise<Buffer | null> {
  const path = await rpc<string | null>("contribution_file", { p_admin: adminId, p_id: id });
  return path ? download(CONTRIBUTION_BUCKET, path) : null;
}

export async function nearbyImages(adminId: string, lat: number, lng: number, heading: number | null): Promise<NearbyImage[] | null> {
  const near = await rpc<NearbyImage[] | Refused>("nearby_images", {
    p_admin: adminId,
    p_lat: lat,
    p_lng: lng,
    p_heading: heading,
    p_radius_m: PIPELINE.mapillary.dupRadiusM,
    p_heading_deg: PIPELINE.mapillary.dupHeadingDeg,
  });
  return refused(near) ? null : near;
}

/** A small copy of a photo already in the pool, to compare with a submission. */
export async function poolPreview(adminId: string, imageId: string): Promise<Buffer | null> {
  const path = await rpc<string | null>("admin_image_file", { p_admin: adminId, p_image: imageId });
  const bytes = path ? await download(PHOTO_BUCKET, path) : null;
  return bytes ? sharp(bytes).resize({ width: 640, height: 640, fit: "inside" }).webp({ quality: 75 }).toBuffer() : null;
}

/** Blurs boxes (fractions of the picture) into the photo: each patch is shrunk to a smear and blurred again. */
async function applyBlur(upright: Buffer, boxes: Box[]): Promise<Buffer> {
  if (!boxes.length) return upright;
  const { width = 0, height = 0 } = await sharp(upright).metadata();
  const overlays = [];
  for (const b of boxes) {
    const left = Math.max(0, Math.floor(b.x * width));
    const top = Math.max(0, Math.floor(b.y * height));
    const w = Math.max(2, Math.min(width - left, Math.ceil(b.w * width)));
    const h = Math.max(2, Math.min(height - top, Math.ceil(b.h * height)));
    const across = Math.max(w, h);
    const small = await sharp(upright)
      .extract({ left, top, width: w, height: h })
      .resize(Math.max(2, Math.round((8 * w) / across)), Math.max(2, Math.round((8 * h) / across)))
      .toBuffer();
    const input = await sharp(small).resize(w, h, { kernel: "cubic" }).blur(Math.max(1, Math.min(w, h) / 12)).png().toBuffer();
    overlays.push({ input, left, top });
  }
  return sharp(upright).composite(overlays).png().toBuffer();
}

export type ReviewProblem = "not_found" | "already_decided" | "bad_pin" | "outside_campus" | "faces_unchecked" | "pin_unchecked" | "bad_reason" | "server_error";

/**
 * Publishes a submission at once: the blur boxes applied, processed exactly as
 * the pipeline does (WebP, 1600 px, metadata stripped and checked), uploaded to
 * the photos bucket under a new random name and added to the pool. Then the
 * waiting file is deleted.
 */
export async function approveContribution(
  adminId: string,
  id: string,
  input: { lat: number; lng: number; pinConfirmed: boolean; facesChecked: boolean; blur: Box[] },
): Promise<{ ok: true; imageId: string } | { ok: false; problem: ReviewProblem }> {
  const no = (problem: ReviewProblem) => ({ ok: false as const, problem });
  if (!insideCampus(input.lat, input.lng)) return no("outside_campus");

  const original = await waitingPhoto(adminId, id);
  if (!original) return no("not_found");

  let webp: Buffer;
  let width: number;
  let height: number;
  try {
    const upright = await sharp(original).rotate().png().toBuffer();
    const blurred = await applyBlur(upright, input.blur);
    const { maxEdgePx, webpQuality } = PIPELINE.output;
    const out = await sharp(blurred)
      .resize({ width: maxEdgePx, height: maxEdgePx, fit: "inside", withoutEnlargement: true })
      .webp({ quality: webpQuality, effort: 5 })
      .toBuffer({ resolveWithObject: true });
    webp = out.data;
    width = out.info.width;
    height = out.info.height;
  } catch (err) {
    log("could not process the photo", err);
    return no("server_error");
  }
  if (await hasMetadata(webp)) {
    log("processed photo still carries metadata", "refused");
    return no("server_error");
  }

  const path = randomName("webp");
  const up = await adminClient().storage.from(PHOTO_BUCKET).upload(path, webp, { contentType: "image/webp", cacheControl: "31536000", upsert: false });
  if (up.error) {
    log("upload to photos failed", up.error);
    return no("server_error");
  }

  let result: { ok?: true; imageId?: string; oldPath?: string; error?: string };
  try {
    result = await rpc("approve_contribution", {
      p_admin: adminId,
      p_id: id,
      p_lat: input.lat,
      p_lng: input.lng,
      p_pin_confirmed: input.pinConfirmed,
      p_faces_checked: input.facesChecked,
      p_blur: input.blur,
      p_storage_path: path,
      p_width: width,
      p_height: height,
    });
  } catch (err) {
    log("approve_contribution failed", err);
    await removeFiles(PHOTO_BUCKET, [path]);
    return no("server_error");
  }
  if (!result.ok || !result.imageId) {
    await removeFiles(PHOTO_BUCKET, [path]);
    const known: ReviewProblem[] = ["not_found", "already_decided", "bad_pin", "faces_unchecked", "pin_unchecked"];
    return no(known.includes(result.error as ReviewProblem) ? (result.error as ReviewProblem) : "server_error");
  }
  if (result.oldPath) await removeFiles(CONTRIBUTION_BUCKET, [result.oldPath]);
  return { ok: true, imageId: result.imageId };
}

/** Turns a submission down with a reason and deletes its file at once. */
export async function rejectContribution(adminId: string, id: string, reason: string): Promise<{ ok: true } | { ok: false; problem: ReviewProblem }> {
  const result = await rpc<{ ok?: true; oldPath?: string; error?: string }>("reject_contribution", { p_admin: adminId, p_id: id, p_reason: reason });
  if (!result.ok) {
    const known: ReviewProblem[] = ["not_found", "already_decided", "bad_reason"];
    return { ok: false, problem: known.includes(result.error as ReviewProblem) ? (result.error as ReviewProblem) : "server_error" };
  }
  if (result.oldPath) await removeFiles(CONTRIBUTION_BUCKET, [result.oldPath]);
  return { ok: true };
}

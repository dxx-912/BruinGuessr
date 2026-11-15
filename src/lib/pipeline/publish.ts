import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { STORAGE_BUCKET } from "./config";
import { hasMetadata } from "./image";
import { isPublishable, paths, readCatalog, readPublished, writeJson } from "./store";
import type { CatalogEntry, Published } from "./types";

/** Marks rows this pipeline took out of rotation, as opposed to ones hidden by player reports. */
const WITHDRAWN = "withdrawn in review";

export type PublishPlan = {
  /** Approved photos not yet in the game. */
  add: CatalogEntry[];
  /** Live photos whose pin was moved. */
  move: CatalogEntry[];
  /** Live photos that are no longer approved (or were dragged off campus). */
  hide: CatalogEntry[];
  /** Photos withdrawn earlier that are approved again. */
  restore: CatalogEntry[];
};

export type PublishResult = { added: number; moved: number; hidden: number; restored: number; errors: string[] };

/** Server-side Supabase client using the secret key. Never import this from browser code. */
export function adminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (see .env.local)");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** Works out what a publish would change, without changing anything. */
export function planPublish(catalog: CatalogEntry[]): PublishPlan {
  const plan: PublishPlan = { add: [], move: [], hide: [], restore: [] };
  for (const e of catalog) {
    const live = isPublishable(e);
    if (!e.published) {
      if (live) plan.add.push(e);
      continue;
    }
    if (!live) {
      if (!e.published.hidden) plan.hide.push(e);
      continue;
    }
    if (e.published.hidden) plan.restore.push(e);
    if (e.published.lat !== e.lat || e.published.lng !== e.lng) plan.move.push(e);
  }
  return plan;
}

/**
 * Brings Supabase in line with the local catalog: uploads newly approved photos,
 * updates moved pins, and takes withdrawn photos out of rotation.
 * Safe to run repeatedly; it only acts on differences.
 */
export async function publish(root = process.cwd(), log: (line: string) => void = () => {}): Promise<PublishResult> {
  const supabase = adminClient();
  const P = paths(root);
  const catalog = await readCatalog(root);
  const published = await readPublished(root);
  const plan = planPublish(catalog);
  const result: PublishResult = { added: 0, moved: 0, hidden: 0, restored: 0, errors: [] };
  const save = () => writeJson(P.published, published);
  const fail = (e: CatalogEntry, what: string, message: string) => {
    result.errors.push(`${what} ${e.key}: ${message}`);
    log(`  ! ${what} ${e.key}: ${message}`);
  };

  for (const e of plan.add) {
    try {
      const file = path.join(P.dir, e.file);
      // Anti-cheat backstop: refuse to upload anything that still carries metadata.
      if (await hasMetadata(file)) throw new Error("processed file still contains metadata");
      const row = {
        lat: e.lat!,
        lng: e.lng!,
        source: e.source,
        source_id: e.sourceId,
        source_url: e.sourceUrl,
        photographer: e.photographer,
        photographer_url: e.photographerUrl,
        license: e.license,
        license_url: e.licenseUrl,
        captured_at: e.capturedAt,
        heading: e.heading,
        width: e.width,
        height: e.height,
        zone: e.zone as "inside" | "buffer",
      };

      // If a previous run uploaded this photo but lost its local record, adopt that row.
      const existing = await supabase
        .from("images")
        .select("id, storage_path, hidden")
        .eq("source", e.source)
        .eq("source_id", e.sourceId)
        .maybeSingle();
      if (existing.error) throw new Error(existing.error.message);

      let record: Published;
      if (existing.data) {
        const upd = await supabase.from("images").update({ ...row, hidden: false, hidden_reason: null }).eq("id", existing.data.id);
        if (upd.error) throw new Error(upd.error.message);
        record = { imageId: existing.data.id, storagePath: existing.data.storage_path, lat: row.lat, lng: row.lng, hidden: false };
      } else {
        // Random name: nothing about the file's URL hints at what or where it is.
        const storagePath = `${randomBytes(16).toString("hex")}.webp`;
        const up = await supabase.storage
          .from(STORAGE_BUCKET)
          .upload(storagePath, await readFile(file), { contentType: "image/webp", cacheControl: "31536000", upsert: false });
        if (up.error) throw new Error(`upload: ${up.error.message}`);
        const ins = await supabase.from("images").insert({ ...row, storage_path: storagePath }).select("id").single();
        if (ins.error) {
          await supabase.storage.from(STORAGE_BUCKET).remove([storagePath]);
          throw new Error(`insert: ${ins.error.message}`);
        }
        record = { imageId: ins.data.id, storagePath, lat: row.lat, lng: row.lng, hidden: false };
      }
      published[e.key] = record;
      result.added++;
      if (result.added % 25 === 0) {
        await save();
        log(`  uploaded ${result.added}/${plan.add.length}`);
      }
    } catch (err) {
      fail(e, "add", err instanceof Error ? err.message : String(err));
    }
  }
  await save();

  for (const e of plan.move) {
    const upd = await supabase.from("images").update({ lat: e.lat, lng: e.lng, zone: e.zone }).eq("id", e.published!.imageId);
    if (upd.error) { fail(e, "move", upd.error.message); continue; }
    published[e.key] = { ...published[e.key], lat: e.lat!, lng: e.lng! };
    result.moved++;
  }

  for (const e of plan.hide) {
    const upd = await supabase.from("images").update({ hidden: true, hidden_reason: WITHDRAWN }).eq("id", e.published!.imageId);
    if (upd.error) { fail(e, "hide", upd.error.message); continue; }
    published[e.key] = { ...published[e.key], hidden: true };
    result.hidden++;
  }

  for (const e of plan.restore) {
    // Only undo our own withdrawal. A photo hidden by player reports stays hidden.
    const upd = await supabase
      .from("images")
      .update({ hidden: false, hidden_reason: null })
      .eq("id", e.published!.imageId)
      .eq("hidden_reason", WITHDRAWN);
    if (upd.error) { fail(e, "restore", upd.error.message); continue; }
    published[e.key] = { ...published[e.key], hidden: false };
    result.restored++;
  }

  await save();
  return result;
}

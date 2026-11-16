/**
 * Gives every stored photo a new random filename.
 *
 *   npm run photos:rotate
 *
 * Why this exists: until Phase 2 the photo bucket was public, and any file that
 * had been fetched by its public URL stays in Supabase's CDN cache for up to a
 * year, even after the bucket is made private. (Purging the CDN is not available
 * on this plan.) Renaming a file leaves the cached copy stranded under a name
 * that nothing refers to any more, and the new name has never been public.
 *
 * Run it again any time a filename might have leaked. Run it when nobody is
 * playing: a round that is open at that moment loses its photo.
 *
 * Nothing is deleted. Each file is renamed inside the bucket, then its row in
 * the images table and its entry in .cache/pipeline/published.json are updated.
 * If the database update fails, the file is moved back.
 */
import { randomBytes } from "node:crypto";
import { copyFile } from "node:fs/promises";
import { STORAGE_BUCKET } from "../../src/lib/pipeline/config";
import { adminClient } from "../../src/lib/pipeline/publish";
import { paths, readPublished, writeJson } from "../../src/lib/pipeline/store";

async function main() {
  const supabase = adminClient();
  const file = paths().published;
  const published = await readPublished();
  // Keep the old list beside the new one, in case anything needs tracing back.
  await copyFile(file, file.replace(/\.json$/, ".before-rotate.json")).catch(() => {});
  const byImage = new Map(Object.entries(published).map(([key, record]) => [record.imageId, key]));

  const images = await supabase.from("images").select("id, storage_path").limit(10_000);
  if (images.error) throw new Error(images.error.message);

  let renamed = 0;
  const failed: string[] = [];
  for (const image of images.data) {
    const next = `${randomBytes(16).toString("hex")}.webp`;
    const moved = await supabase.storage.from(STORAGE_BUCKET).move(image.storage_path, next);
    if (moved.error) {
      failed.push(`${image.id}: move failed (${moved.error.message})`);
      continue;
    }
    const updated = await supabase.from("images").update({ storage_path: next }).eq("id", image.id);
    if (updated.error) {
      // Put the file back so the database row still points at it.
      const back = await supabase.storage.from(STORAGE_BUCKET).move(next, image.storage_path);
      failed.push(
        `${image.id}: database update failed (${updated.error.message})${back.error ? `; AND the file could not be moved back: it is now at ${next}` : ""}`,
      );
      continue;
    }
    const key = byImage.get(image.id);
    if (key) published[key] = { ...published[key], storagePath: next };
    renamed++;
    if (renamed % 40 === 0) {
      await writeJson(file, published);
      console.log(`  renamed ${renamed}/${images.data.length}`);
    }
  }
  await writeJson(file, published);

  console.log(`Renamed ${renamed} of ${images.data.length} photos.`);
  if (failed.length) {
    console.error(`${failed.length} could not be renamed:\n  ${failed.join("\n  ")}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
